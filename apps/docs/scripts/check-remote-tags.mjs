import fs from 'fs';
import path, { join, dirname } from 'path';
import semver from 'semver';
import { fileURLToPath } from 'url';

const FALLBACK_VERSION = 'v4.10.0';
const REPO = 'zitadel/zitadel';
const CUTOFF = '4.10.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const ARTIFACTS_DIR = join(ROOT_DIR, '.artifacts');
const VERSIONS_FILE = join(ARTIFACTS_DIR, 'versions.json');

async function fetchTags() {
  if (!fs.existsSync(ARTIFACTS_DIR)) {
    fs.mkdirSync(ARTIFACTS_DIR, { recursive: true });
  }
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'node-fetch' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `https://api.github.com/repos/${REPO}/tags?per_page=100`;
  console.log(`[check-tags] Fetching tags from ${url}...`);
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`Failed to fetch tags: ${res.statusText}`);
  return await res.json();
}

async function findExclusions(ref) {
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'Accept': 'application/vnd.github.v3+json', 'User-Agent': 'node-fetch' };
  if (token) headers['Authorization'] = `token ${token}`;

  // Fetch the tree for the proto directory
  const url = `https://api.github.com/repos/${REPO}/git/trees/${ref}:proto?recursive=1`;
  console.log(`[check-tags] Discovering exclusions for ${ref}...`);
  try {
    const res = await fetch(url, { headers });
    if (!res.ok) return ['zitadel/v2beta', 'zitadel/v3alpha']; // Fallback to common paths
    const data = await res.json();
    const excluded = new Set();
    if (data.tree) {
      data.tree.forEach(item => {
        if (item.type === 'tree' && (item.path.includes('v2beta') || item.path.includes('v3alpha'))) {
          excluded.add(item.path);
        }
      });
    }
    return Array.from(excluded);
  } catch (e) {
    return ['zitadel/v2beta', 'zitadel/v3alpha'];
  }
}

export function filterVersions(tags) {
  const versions = tags
    .map(t => t.name)
    .filter(v => semver.valid(v) && semver.gt(v, CUTOFF))
    .sort((a, b) => semver.rcompare(a, b));

  const groups = new Map();
  for (const v of versions) {
    const majorMinor = `v${semver.major(v)}.${semver.minor(v)}`;
    if (!groups.has(majorMinor)) groups.set(majorMinor, v);
  }

  return Array.from(groups.entries()).slice(0, 3);
}

async function run() {
  console.log('[check-tags] Generating consolidated version metadata...');
  try {
    const tags = await fetchTags();
    const selectedEntries = filterVersions(tags);

    const versionMetadata = [
      {
        param: 'latest',
        label: 'latest',
        url: '/docs',
        ref: 'local',
        refType: 'local'
      }
    ];

    for (const [majorMinor, tag] of selectedEntries) {
      const exclusions = await findExclusions(tag);
      versionMetadata.push({
        param: majorMinor,
        label: majorMinor,
        url: `/docs/${majorMinor}`,
        ref: tag,
        refType: 'tag',
        exclusions
      });
    }

    fs.writeFileSync(VERSIONS_FILE, JSON.stringify(versionMetadata, null, 2));
    console.log(`[check-tags] Successfully wrote ${VERSIONS_FILE}`);
  } catch (err) {
    console.error('[check-tags] Failed:', err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

export { fetchTags };
