import fs from 'fs';
import path, { join, dirname } from 'path';
import semver from 'semver';
import { fileURLToPath } from 'url';

const FALLBACK_VERSION = 'v4.10.0';
const REPO = 'zitadel/zitadel';
const CUTOFF = '4.10.0';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT_DIR = join(__dirname, '..');
const REMOTE_TAGS_FILE = join(ROOT_DIR, '.remote-tags.json');

async function fetchTags() {
  const token = process.env.GITHUB_TOKEN;
  const headers = { 'User-Agent': 'node-fetch' };
  if (token) headers['Authorization'] = `token ${token}`;

  const url = `https://api.github.com/repos/${REPO}/tags?per_page=100`;
  console.log(`[check-tags] Fetching tags from ${url}...`);
  const res = await fetch(url, { headers });
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Failed to fetch tags: ${res.statusText} - ${body}`);
  }
  const tags = await res.json();
  console.log(`[check-tags] Fetched ${tags.length} tags.`);
  return tags;
}

export function filterVersions(tags) {
  console.log(`[check-tags] Filtering tags with cutoff strictly > ${CUTOFF}...`);
  const versions = tags
    .map(t => t.name)
    .filter(v => {
      const valid = semver.valid(v);
      if (!valid) return false;
      return semver.gt(v, CUTOFF);
    })
    .sort((a, b) => semver.rcompare(a, b));

  const groups = new Map();
  for (const v of versions) {
    const majorMinor = `${semver.major(v)}.${semver.minor(v)}`;
    if (!groups.has(majorMinor)) {
      groups.set(majorMinor, v);
    }
  }

  const result = Array.from(groups.values()).slice(0, 3);
  console.log(`[check-tags] Selected versions: ${result.join(', ')}`);
  return result;
}

async function run() {
  console.log('[check-tags] Checking remote tags for caching...');
  try {
    const tags = await fetchTags();
    const selectedTags = filterVersions(tags);

    if (selectedTags.length === 0) {
      console.log(`[check-tags] No versions found strictly > ${CUTOFF}. Injecting ${FALLBACK_VERSION} as fallback.`);
      selectedTags.push(FALLBACK_VERSION);
    }

    fs.writeFileSync(REMOTE_TAGS_FILE, JSON.stringify(selectedTags, null, 2));
    console.log(`[check-tags] Successfully wrote ${REMOTE_TAGS_FILE}`);
  } catch (err) {
    console.error('[check-tags] Failed to check remote tags:', err);
    process.exit(1);
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  run();
}

export { fetchTags };
