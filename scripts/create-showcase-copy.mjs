/**
 * Create a standalone showcase copy of Computer Dynamics v2 with demo data.
 *
 * Usage:
 *   node scripts/create-showcase-copy.mjs [destination-folder]
 *
 * Default destination: ../Computer Dynamics System v2 - Showcase
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const defaultDest = path.resolve(root, '..', 'Computer Dynamics System v2 - Showcase');
const dest = path.resolve(process.argv[2] || defaultDest);

const EXCLUDE_DIRS = new Set([
  'node_modules',
  '.next',
  '.git',
  'dist',
  '.turbo',
  '.demo_mode',
]);

function copyDirSync(src, dst) {
  fs.mkdirSync(dst, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    if (EXCLUDE_DIRS.has(entry.name)) continue;
    if (entry.name === 'data' && entry.isDirectory()) {
      fs.mkdirSync(path.join(dst, 'data'), { recursive: true });
      fs.mkdirSync(path.join(dst, 'data', 'showcase'), { recursive: true });
      continue;
    }
    const from = path.join(src, entry.name);
    const to = path.join(dst, entry.name);
    if (entry.isDirectory()) {
      copyDirSync(from, to);
    } else if (entry.isFile()) {
      fs.copyFileSync(from, to);
    }
  }
}

function writeShowcaseEnv(targetRoot) {
  const envPath = path.join(targetRoot, '.env');
  const content = `# Computer Dynamics v2 — SHOWCASE (demo data only)
DATABASE_PATH=./data/computer_dynamics.db
LICENSE_DB_PATH=./license_activation_system_new/instance/license_system.db

JWT_SECRET=showcase-demo-jwt-secret-min-32-chars
JWT_EXPIRES_IN=24h
JWT_REFRESH_EXPIRES_IN=7d

PORT=3001
DEMO_MODE=true

# Public URL for the demo site (Cloudflare tunnel demo.computerdynamicstt.com → :3001)
NEXT_PUBLIC_SITE_URL=https://demo.computerdynamicstt.com

WIPAY_ENABLED=false
WIPAY_ENVIRONMENT=sandbox

# Showcase uses local CAPTCHA test keys automatically on localhost
`;
  fs.writeFileSync(envPath, content, 'utf8');
}

function copyLicenseDb(targetRoot) {
  const srcLicense = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
  const destDir = path.join(targetRoot, 'license_activation_system_new', 'instance');
  const destLicense = path.join(destDir, 'license_system.db');
  fs.mkdirSync(destDir, { recursive: true });

  if (fs.existsSync(srcLicense)) {
    fs.copyFileSync(srcLicense, destLicense);
    console.log('Copied license database (existing licenses preserved in showcase copy).');
    return;
  }

  const init = spawnSync('python', ['init_db.py'], {
    cwd: path.join(targetRoot, 'license_activation_system_new'),
    stdio: 'inherit',
    shell: process.platform === 'win32',
  });
  if (init.status !== 0) {
    console.warn('License DB init skipped — run pip install + init_db.py in showcase folder if needed.');
  }
}

if (fs.existsSync(dest)) {
  console.error('Destination already exists:', dest);
  console.error('Remove it or pass a different path.');
  process.exit(1);
}

console.log('Creating showcase copy at:', dest);
console.log('Copying project files (excluding node_modules, .next, live databases)...');
copyDirSync(root, dest);

const showcaseDb = path.join(dest, 'data', 'computer_dynamics.db');
const schemaSrc = path.join(root, 'data', 'showcase', 'schema.sql');
const schemaDst = path.join(dest, 'data', 'showcase', 'schema.sql');
if (!fs.existsSync(schemaSrc)) {
  const exportSchema = spawnSync(process.execPath, ['scripts/export-showcase-schema.mjs'], {
    cwd: root,
    stdio: 'inherit',
  });
  if (exportSchema.status !== 0) process.exit(exportSchema.status ?? 1);
}
fs.mkdirSync(path.dirname(schemaDst), { recursive: true });
fs.copyFileSync(schemaSrc, schemaDst);

console.log('Initializing showcase database...');
const initDb = spawnSync(process.execPath, ['scripts/init-showcase-database.mjs', showcaseDb], {
  cwd: root,
  stdio: 'inherit',
});
if (initDb.status !== 0) process.exit(initDb.status ?? 1);

writeShowcaseEnv(dest);
copyLicenseDb(dest);

const marker = {
  showcase: true,
  createdAt: new Date().toISOString(),
  sourceRoot: root,
  login: { admin: 'demo', tech: 'tech', password: 'Demo@2026!' },
  port: 3001,
};
fs.writeFileSync(path.join(dest, 'data', 'showcase', 'install.json'), JSON.stringify(marker, null, 2));

console.log('');
console.log('========================================');
console.log(' Showcase copy created');
console.log('========================================');
console.log(' Location:', dest);
console.log(' Portal:   http://localhost:3001');
console.log(' Login:    demo / Demo@2026!  (admin)');
console.log('           tech / Demo@2026!  (technician)');
console.log('');
console.log(' Next steps:');
console.log('   cd "' + dest + '"');
console.log('   npm install');
console.log('   start-showcase.bat');
console.log('');
