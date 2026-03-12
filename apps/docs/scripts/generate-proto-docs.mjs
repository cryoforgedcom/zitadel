import fs from 'fs';
import { glob } from 'glob';
import path, { join, dirname, resolve } from 'path';
import { spawnSync, spawn } from 'child_process';
import { fileURLToPath } from 'url';
import os from 'os';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const PROTO_DIR = join(ROOT_DIR, '../../proto');
const OPENAPI_DIR = join(ROOT_DIR, 'openapi');
const VERSIONS_FILE = join(ROOT_DIR, 'content/versions.json');
const REPO_URL = 'https://github.com/zitadel/zitadel.git';

async function run() {
  if (!fs.existsSync(VERSIONS_FILE)) {
      console.error('versions.json not found. Run fetch-docs.mjs first.');
      process.exit(1);
  }

  const versions = JSON.parse(fs.readFileSync(VERSIONS_FILE, 'utf8'));
  
  // Parse CLI arguments for filtering
  const args_cli = process.argv.slice(2);
  const filterArg = args_cli.find(arg => arg.startsWith('--filter='));
  const filterValue = filterArg ? filterArg.split('=')[1] : null;

  const filteredVersions = filterValue 
    ? versions.filter(v => v.param === filterValue)
    : versions;

  if (filteredVersions.length === 0) {
      console.warn(`No versions matched filter: ${filterValue}`);
      return;
  }

  console.log(`Processing ${filteredVersions.length} versions (filter: ${filterValue || 'none'})`);

  const baseTempDir = fs.mkdtempSync(join(os.tmpdir(), 'zitadel-buf-'));
  // Use a subdirectory for local generation to avoid pollution
  const localGenDir = join(baseTempDir, 'local'); 
  fs.mkdirSync(localGenDir, { recursive: true });

  const templatePath = resolve(join(ROOT_DIR, 'buf.gen.yaml'));
  const binBinDir = path.resolve(__dirname, `../.artifacts/bin/${process.platform === 'win32' ? 'windows' : process.platform === 'darwin' ? 'darwin' : 'linux'}/${process.arch === 'x64' ? 'amd64' : process.arch === 'arm64' ? 'arm64' : process.arch}`);

  try {
    // Run sequentially for predictable logs and to avoid concurrent clone overhead
    for (const v of filteredVersions) {
      if (v.type === 'external') continue;

      const label = v.param;
      const outputPath = resolve(join(OPENAPI_DIR, label));
        
      console.log(`\n--- Generating OpenAPI specs for ${label} ---`);
        
      fs.rmSync(outputPath, { recursive: true, force: true });
      fs.mkdirSync(outputPath, { recursive: true });

      // Create a unique temp dir for this specific generation task
      const taskTempDir = join(baseTempDir, label);
      fs.mkdirSync(taskTempDir, { recursive: true });

      // Determine buf input: Use native buf remote/local patterns
      let bufInput;
      if (v.refType === 'local') {
          bufInput = PROTO_DIR; 
      } else {
          const refPart = v.refType === 'branch' ? `branch=${v.ref}` : `tag=${v.ref}`;
          bufInput = `${REPO_URL}#${refPart},subdir=proto`;
      }
        
      console.log(`Using input for ${label}: ${bufInput}`);

      // Dynamic discovery of excluded paths
      const getExcludedPaths = async () => {
           if (v.refType === 'local') {
               const patterns = ['v2beta', 'v3alpha', '**/v2beta', '**/v3alpha'];
               try {
                  const files = await glob(patterns, { cwd: PROTO_DIR, nodir: false });
                  return Array.from(new Set(files.map(f => f.split(path.sep).join('/'))));
               } catch (e) {
                   console.warn('[warn] Failed to glob local excluded paths', e.message);
                   return [];
               }
           } else {
               // Use pre-discovered exclusions from versions.json
               return v.exclusions || [];
           }
      };

      const excludedPaths = await getExcludedPaths();
      if (excludedPaths.length > 0) {
          console.log(`Excluding paths: ${excludedPaths.join(', ')}`);
      }

      // Find the local buf binary or use npx as fallback
      const rootNodeModules = resolve(ROOT_DIR, '../../node_modules');
      const localBuf = join(rootNodeModules, '.bin/buf');
      const binToRun = fs.existsSync(localBuf) ? localBuf : 'npx';
      const args = ['generate', bufInput, '--template', templatePath, '--output', outputPath];
      
      for (const p of excludedPaths) {
          args.push('--exclude-path', p);
      }

      const finalArgs = binToRun === 'npx' ? ['buf', ...args] : args;

      // Clean environment: Remove npm_config_* to silence warnings
      const cleanEnv = {};
      for (const key in process.env) {
          if (!key.startsWith('npm_config_')) {
              cleanEnv[key] = process.env[key];
          }
      }
      cleanEnv.PATH = `${binBinDir}${path.delimiter}${process.env.PATH || ''}`;

      await new Promise((resolvePromise, rejectPromise) => {
          // If bufInput is a directory, use it as CWD to ensure relative exclude-paths work correctly.
          // Otherwise use taskTempDir.
          const runInDir = (v.refType === 'local' && fs.existsSync(bufInput)) ? bufInput : taskTempDir;

          const child = spawn(binToRun, finalArgs, {
            cwd: runInDir,
            stdio: 'inherit',
            env: cleanEnv,
            shell: binToRun === 'npx'
          });

          child.on('close', (code) => {
              if (code !== 0) {
                  rejectPromise(new Error(`Failed to generate OpenAPI for ${label} (exit code ${code})`));
              } else {
                  console.log(`Successfully generated OpenAPI for ${label}`);
                  
                  // Post-generation cleanup
                  try {
                      const generatedFiles = glob.sync('**/*', { cwd: outputPath, absolute: true, nodir: false });
                      generatedFiles.forEach(f => {
                          if (f.includes('v2beta') || f.includes('v3alpha')) {
                              fs.rmSync(f, { recursive: true, force: true });
                          }
                      });
                  } catch (e) {
                      console.warn(`[warn] Post-cleanup failed for ${label}`, e.message);
                  }
                  resolvePromise();
              }
          });
            
          child.on('error', (err) => {
              rejectPromise(err);
          });
      });
    }
  } finally {
    fs.rmSync(baseTempDir, { recursive: true, force: true });
  }
}

run().catch(err => {
  console.error(err);
  process.exit(1);
});
