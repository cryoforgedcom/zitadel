import fs from 'fs';
import path, { join, dirname, resolve } from 'path';
import { spawn, execSync } from 'child_process';
import { fileURLToPath } from 'url';
import semver from 'semver';
import { Readable } from 'stream';

const FALLBACK_VERSION = 'v4.10.0';
const FALLBACK_BRANCH = 'main';
const REPO = 'zitadel/zitadel';
const CUTOFF = '4.10.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PROTO_DIR = join(ROOT_DIR, '../../proto');
const CONTENT_DIR = join(ROOT_DIR, 'content');
const PUBLIC_DIR = join(ROOT_DIR, 'public');
const VERSIONS_FILE = join(ROOT_DIR, 'content/versions.json');
const CONTENT_LATEST_DIR = join(ROOT_DIR, 'content');

console.log(`[fetch-docs] __dirname: ${__dirname}`);
console.log(`[fetch-docs] ROOT_DIR: ${ROOT_DIR}`);
console.log(`[fetch-docs] PROTO_DIR: ${PROTO_DIR}`);
console.log(`[fetch-docs] CONTENT_DIR: ${CONTENT_DIR}`);

// --- Helper Functions ---

// Sanitize logs to prevent log injection (CWE-117)
export function safeLog(str) {
  return str ? String(str).replace(/[\n\r]/g, '') : '';
}

// Validate refs to prevent command injection or unsafe URL construction
export function isValidRef(ref) {
  // Allow alphanumeric, dots, dashes, underscores, slashes, @ (dependabot), and +
  // But explicitly disallow ".." to prevent traversal
  if (ref.includes('..')) return false;
  return /^[a-zA-Z0-9._\-/@+]+$/.test(ref);
}

// Caches result to avoid redundant git/env checks.
let cachedRef = null;
function getCurrentRef() {
  if (cachedRef) return cachedRef;

  if (process.env.VERCEL_GIT_COMMIT_REF) {
    const ref = process.env.VERCEL_GIT_COMMIT_REF;
    if (!isValidRef(ref)) {
       console.warn(`[ref] Invalid VERCEL_GIT_COMMIT_REF: ${safeLog(ref)}, falling through...`);
    } else {
       console.log(`[ref] Detected Vercel Branch: ${safeLog(ref)}`);
       cachedRef = ref;
       return cachedRef;
    }
  }

  if (process.env.GITHUB_REF_NAME) {
    const ref = process.env.GITHUB_REF_NAME;
    if (!isValidRef(ref)) {
       console.warn(`[ref] Invalid GITHUB_REF_NAME: ${safeLog(ref)}, falling through...`);
    } else {
       console.log(`[ref] Detected GitHub Action Branch: ${safeLog(ref)}`);
       cachedRef = ref;
       return cachedRef;
    }
  }

  try {
    const branch = execSync('git branch --show-current').toString().trim();
    if (branch) {
      cachedRef = branch;
      return cachedRef;
    }
  } catch (e) {
    // Ignore git errors
  }
  console.log(`[ref] Defaulting to ${FALLBACK_BRANCH}`);
  cachedRef = FALLBACK_BRANCH;
  return cachedRef;
}

export function resetCache() {
  cachedRef = null;
}

// --- Helper Functions ---
function copyDirectorySafely(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });

  const items = fs.readdirSync(src);
  // Matches v4.10, v4.10.0, etc.
  const versionDirPattern = /^v\d+(\.\d+){1,2}$/;

  for (const item of items) {
    // Avoid copying versioned folders to prevent recursion
    let isVersionDir = false;
    try {
      if (versionDirPattern.test(item) && fs.statSync(join(src, item)).isDirectory()) {
        isVersionDir = true;
      }
    } catch (e) {
      // Ignore stat errors
    }

    if (isVersionDir) continue;
    if (item === 'versions.json') continue; // Skip manifest

    fs.cpSync(join(src, item), join(dest, item), { recursive: true });
  }
}

async function downloadVersion(tag, sourceRef) {
  if (!isValidRef(sourceRef)) {
     throw new Error(`Invalid sourceRef: ${safeLog(sourceRef)}`);
  }

  const currentRef = getCurrentRef();
  const isLocal = sourceRef === currentRef;
  const tempDir = join(ROOT_DIR, `.temp/${tag}`); // Extract to tag-specific temp to avoid collisions
  fs.mkdirSync(tempDir, { recursive: true });

  try {
    if (isLocal) {
        console.log(`[local] Copying local content for ${tag} (ref: ${safeLog(sourceRef)})...`);
        
        // Copy content
        copyDirectorySafely(join(ROOT_DIR, 'content'), join(tempDir, 'apps/docs/content'));
        
        // Copy public
        copyDirectorySafely(join(ROOT_DIR, 'public'), join(tempDir, 'apps/docs/public'));

        // Copy external files
        const repoRoot = resolve(ROOT_DIR, '../..');
        const tempCmd = join(tempDir, 'cmd');
        fs.mkdirSync(tempCmd, { recursive: true });

        const defaultsPath = join(repoRoot, 'cmd/defaults.yaml');
        if (fs.existsSync(defaultsPath)) {
            fs.cpSync(defaultsPath, join(tempCmd, 'defaults.yaml'));
        }

        const stepsPath = join(repoRoot, 'cmd/setup/steps.yaml');
        if (fs.existsSync(stepsPath)) {
            fs.mkdirSync(join(tempCmd, 'setup'), { recursive: true });
            fs.cpSync(stepsPath, join(tempCmd, 'setup/steps.yaml'));
        }

    } else {
        const isBranch = sourceRef === 'main' || sourceRef === 'master' || !sourceRef.startsWith('v');
        const typeSegment = isBranch ? 'heads' : 'tags';
        const url = `https://github.com/${REPO}/archive/refs/${typeSegment}/${sourceRef}.tar.gz`;

        console.log(`Downloading content for ${tag} (using source: ${safeLog(sourceRef)})...`);
        const res = await fetch(url);
        if (!res.ok) throw new Error(`Failed to download ${url}: ${res.statusText}`);

        // Build tar arguments to extract only the docs content directory from the GitHub archive.
        const tarArgsWildcard = [
            '-xz',
            '-C', tempDir,
            '--strip-components=1'
        ];

        // GNU tar (Linux) requires --wildcards for patterns, BSD tar (macOS) does not support it (and uses patterns by default)
        if (process.platform !== 'darwin') {
            tarArgsWildcard.push('--wildcards');
        }

        tarArgsWildcard.push(
            '*/apps/docs/content',
            '*/apps/docs/public',
            '*/cmd/defaults.yaml',
            '*/cmd/setup/steps.yaml'
        );

        await new Promise((resolve, reject) => {
            const tar = spawn('tar', tarArgsWildcard);
            Readable.fromWeb(res.body).pipe(tar.stdin);
            // Exit code 2 in GNU tar means some wildcard patterns didn't match (e.g. older versions 
            // may not have */cmd/setup/steps.yaml). This is non-fatal since the essential docs content
            // is still extracted successfully.
            tar.on('close', (code) => (code === 0 || code === 2 ? resolve() : reject(new Error(`tar exited ${code}`))));
            tar.stderr.on('data', d => {
                const msg = d.toString();
                if (!msg.includes('Not found in archive')) console.error(msg);
            });
        });
    }

    // Move to final destination
    const versionSlug = `v${semver.major(tag)}.${semver.minor(tag)}`;
    const contentDest = join(CONTENT_DIR, versionSlug);
    const publicDest = join(PUBLIC_DIR, versionSlug);

    fs.mkdirSync(dirname(contentDest), { recursive: true });
    fs.mkdirSync(dirname(publicDest), { recursive: true });

    fs.rmSync(contentDest, { recursive: true, force: true });
    fs.rmSync(publicDest, { recursive: true, force: true });

    if (fs.existsSync(join(tempDir, 'apps/docs/content'))) {
        fs.renameSync(join(tempDir, 'apps/docs/content'), contentDest);
    } else {
         // Fallback warning
         console.warn(`[warn] apps/docs/content not found in archive for ${tag} (ref: ${safeLog(sourceRef)})`);
    }
    
    // Handle external files
    const externalDir = join(contentDest, '_external/cmd');
    fs.mkdirSync(externalDir, { recursive: true });
    
    if (fs.existsSync(join(tempDir, 'cmd/defaults.yaml'))) {
        fs.cpSync(join(tempDir, 'cmd/defaults.yaml'), join(externalDir, 'defaults.yaml'));
    }
    if (fs.existsSync(join(tempDir, 'cmd/setup/steps.yaml'))) {
        fs.mkdirSync(join(externalDir, 'setup'), { recursive: true });
        fs.cpSync(join(tempDir, 'cmd/setup/steps.yaml'), join(externalDir, 'setup/steps.yaml'));
    }

    if (fs.existsSync(join(tempDir, 'apps/docs/public'))) {
        fs.renameSync(join(tempDir, 'apps/docs/public'), publicDest);
    }

  } catch (err) {
    console.error(`[error] Failed to process version ${tag}: ${err.message}`);
    throw err;
  } finally {
    // Always clean up temp dir
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

async function downloadFileContent(tagOrBranch, repoPath) {
  const currentRef = getCurrentRef();
  if (tagOrBranch === currentRef) {
    console.log(`[local] Reading local file content for: ${repoPath}`);
    const repoRoot = resolve(ROOT_DIR, '../..');
    
    let decodedRepoPath;
    try {
        decodedRepoPath = decodeURIComponent(repoPath.replace(/\\/g, '/'));
    } catch (e) {
        // If decoding fails (malformed escape sequences), fall back to original
        decodedRepoPath = repoPath;
    }
    const normalizedRepoPath = decodedRepoPath.replace(/\\/g, '/');

    const localPath = resolve(repoRoot, normalizedRepoPath);
    
    // Secure Check: Ensure the resolved path actually starts with the repo root
    // strict check including separator to avoid partial matches (e.g. /opt/repo matching /opt/repo-hack)
    const secureRepoRoot = repoRoot.endsWith(path.sep) ? repoRoot : repoRoot + path.sep;
    if (!localPath.startsWith(secureRepoRoot) && localPath !== repoRoot) {
      console.warn(`[local] Refusing to read file outside repo root: ${localPath}`);
      return null;
    }

    if (fs.existsSync(localPath)) {
      return fs.readFileSync(localPath, 'utf8');
    }
    return null;
  }

  if (!isValidRef(tagOrBranch)) return null;

  const url = `https://raw.githubusercontent.com/${REPO}/${tagOrBranch}/${repoPath}`;
  const res = await fetch(url);
  if (!res.ok) return null;
  return await res.text();
}

async function fixRelativeImports(versionDir, tagOrBranch) {
  if (!fs.existsSync(versionDir)) return;
  const files = fs.readdirSync(versionDir, { recursive: true });

  const rewritePath = (filePath, originalRelPath) => {
    const versionFolder = path.basename(versionDir);
    const relativePathInContent = filePath.split(join('content', versionFolder))[1];
    if (!relativePathInContent) return null;

    const originalFilePath = join(CONTENT_LATEST_DIR, relativePathInContent);
    const originalDir = dirname(originalFilePath);
    const absoluteTarget = resolve(originalDir, originalRelPath);
    const projectRoot = resolve(ROOT_DIR, '../..');

    if (absoluteTarget.startsWith(PUBLIC_DIR)) {
      const relToPublic = absoluteTarget.slice(PUBLIC_DIR.length + 1);
      const newTargetAbs = join(PUBLIC_DIR, versionFolder, relToPublic);
      const newRelPath = path.relative(dirname(filePath), newTargetAbs);
      return newRelPath.split(path.sep).join('/');
    }

    if (absoluteTarget.startsWith(projectRoot) && !absoluteTarget.startsWith(CONTENT_LATEST_DIR) && !absoluteTarget.startsWith(PUBLIC_DIR)) {
      return null;
    }
    if (originalRelPath.includes('cmd/defaults.yaml') || originalRelPath.includes('cmd/setup/steps.yaml')) {
      return null;
    }

    if (absoluteTarget.startsWith(ROOT_DIR) && !absoluteTarget.startsWith(CONTENT_LATEST_DIR)) {
      const newRelPath = path.relative(dirname(filePath), absoluteTarget);
      return newRelPath.split(path.sep).join('/');
    }
    return null;
  };

  // We'll traverse all files to fix links/imports
  for (const file of files) {
    const filePath = join(versionDir, file);
    if (!fs.statSync(filePath).isFile()) continue;
    if (!filePath.endsWith('.mdx') && !filePath.endsWith('.md')) continue;

    let content = fs.readFileSync(filePath, 'utf8');
    let changed = false;

    // --- Replacements ---

    // 1. Imports: import ... from '...'
    const importRegex = /(import\s+.*?\s+from\s+['"])([^'"]+)(['"])/g;
    content = content.replace(importRegex, (match, p1, p2, p3) => {
      if (!p2.startsWith('.')) return match; // Only relative
      const rewritten = rewritePath(filePath, p2);
      if (rewritten && rewritten !== p2) {
        changed = true;
        return `${p1}${rewritten}${p3}`;
      }
      return match;
    });

    // 2. Markdown Images: ![alt](src)
    const mdImgRegex = /(!\[.*?\]\()([^\)]+)(\))/g;
    content = content.replace(mdImgRegex, (match, p1, p2, p3) => {
      if (!p2.startsWith('.')) return match;
      const rewritten = rewritePath(filePath, p2);
      if (rewritten && rewritten !== p2) {
        changed = true;
        return `${p1}${rewritten}${p3}`;
      }
      return match;
    });

    // 3. HTML Attributes: src="..." or href="..."
    const htmlAttrRegex = /(src|href)=['"]([^'"]+)['"]/g;
    content = content.replace(htmlAttrRegex, (match, attr, val) => {
      if (!val.startsWith('.')) return match;
      const rewritten = rewritePath(filePath, val);
      if (rewritten && rewritten !== val) {
        changed = true;
        const quote = match.includes("'") ? "'" : '"';
        return `${attr}=${quote}${rewritten}${quote}`;
      }
      return match;
    });

    // --- Special handling for the "download external file" case ---
    // Scan for strictly external files (like ../cmd/defaults.yaml) first
    const importRegexForDownload = /import\s+.*\s+from\s+['"](\.\.\/(\.\.\/)+[^'"]+)['"]/g;
    let match;
    while ((match = importRegexForDownload.exec(content)) !== null) {
      const relPath = match[1];
      const versionFolder = path.basename(versionDir);
      const relativePathInContent = filePath.split(join('content', versionFolder))[1];
      const originalFilePath = join(CONTENT_LATEST_DIR, relativePathInContent);
      const absoluteImportTarget = resolve(dirname(originalFilePath), relPath);
      const projectRoot = resolve(ROOT_DIR, '../..');

      // If it points to cmd/ or similar external
      if (absoluteImportTarget.startsWith(projectRoot) && !absoluteImportTarget.startsWith(CONTENT_LATEST_DIR) && !absoluteImportTarget.startsWith(PUBLIC_DIR)) {
        const repoRoot = resolve(ROOT_DIR, '../..');

        let relativeToRepoRoot;
        if (absoluteImportTarget.startsWith(join(repoRoot, 'apps'))) {
          relativeToRepoRoot = absoluteImportTarget.replace(join(repoRoot, 'apps') + '/', '');
        } else {
          relativeToRepoRoot = absoluteImportTarget.replace(repoRoot + '/', '');
        }

        const localPathInVersion = join(versionDir, '_external', relativeToRepoRoot);

        // Download if missing
        if (!fs.existsSync(localPathInVersion)) {
          console.log(`[fix-imports] Downloading external: ${relativeToRepoRoot}`);
          const fileContent = await downloadFileContent(tagOrBranch, relativeToRepoRoot);
          if (fileContent) {
            fs.mkdirSync(dirname(localPathInVersion), { recursive: true });
            fs.writeFileSync(localPathInVersion, fileContent);
          }
        }

        // Rewrite to local path
        const newRelPath = path.relative(dirname(filePath), localPathInVersion).split(path.sep).join('/');
        const finalPath = newRelPath.startsWith('.') ? newRelPath : './' + newRelPath;
        // Perform replacement
        const newImport = match[0].replace(relPath, finalPath);
        content = content.replace(match[0], newImport);
        changed = true;
      }
    }

    if (changed) {
      console.log(`[fix-relative] Updated ${file}`);
      fs.writeFileSync(filePath, content);
    }
  }
}

function getLocalVersion() {
    const vercelBranch = process.env.VERCEL_GIT_COMMIT_REF;
    let branch = vercelBranch;
    if (!branch) {
        try {
            branch = execSync('git branch --show-current').toString().trim();
        } catch (e) {}
    }

    if (branch && branch !== 'main' && branch !== 'master') {
        return { label: branch, isUnreleased: true };
    }
    if (branch === 'main' || branch === 'master') {
        return { label: 'ZITADEL Docs', isUnreleased: false };
    }

    try {
        const tag = execSync('git describe --tags --abbrev=0').toString().trim();
        if (semver.valid(tag) && semver.gt(tag, CUTOFF)) {
            return { label: tag, isUnreleased: false };
        }
    } catch (e) { }

    return { label: 'v4.11.0', isUnreleased: true };
}

async function run() {
  console.log('[fetch-docs] Starting documentation fetch...');
  
  const INPUT_FILE = join(ROOT_DIR, '.artifacts/versions.json');
  if (!fs.existsSync(INPUT_FILE)) {
    console.error(`[error] ${INPUT_FILE} not found. Run check:remote-tags first.`);
    process.exit(1);
  }

  const versionMetadata = JSON.parse(fs.readFileSync(INPUT_FILE, 'utf8'));
  const remoteVersions = versionMetadata.filter(v => v.refType === 'tag');

  console.log(`[fetch-docs] Versions to process: ${versionMetadata.map(v => v.param).join(', ')}`);

  for (const v of remoteVersions) {
    const versionDir = join(CONTENT_DIR, v.param);
    if (fs.existsSync(versionDir)) {
      console.log(`[skip] Version ${v.param} already exists. Skipping download.`);
      continue;
    }

    const sourceUrl = `https://github.com/${REPO}/archive/refs/tags/${v.ref}.tar.gz`;
    console.log(`[fetch-docs] Downloading ${v.param} from ${sourceUrl}...`);
    
    try {
      await downloadVersion(v.ref, v.ref);
      const contentDest = join(CONTENT_DIR, v.param);
      await fixRelativeImports(contentDest, v.ref);
      console.log(`[fetch-docs] Successfully fetched and processed ${v.param}`);
    } catch (err) {
      console.error(`[error] Failed to fetch ${v.param}:`, err.message);
      v.error = true;
    }
  }

  const FINAL_VERSIONS_FILE = join(CONTENT_DIR, 'versions.json');
  fs.writeFileSync(FINAL_VERSIONS_FILE, JSON.stringify(versionMetadata.filter(v => !v.error), null, 2));
  console.log(`[fetch-docs] Generated ${FINAL_VERSIONS_FILE}`);
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run().catch(err => {
    console.error(err);
    process.exit(1);
  });
}

export { getCurrentRef, downloadVersion, downloadFileContent };
