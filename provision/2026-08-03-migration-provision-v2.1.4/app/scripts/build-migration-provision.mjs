/**
 * Build a MIGRATION provision package — move live Computer Dynamics v2 to another machine.
 *
 * Unlike customer provisioning (fresh seed DB), this copies your LIVE database and config.
 *
 * Usage:
 *   node scripts/build-migration-provision.mjs [options]
 *
 * Options:
 *   --dest <path>         Output package folder (default: provision/<date>-migration-provision-v<version>)
 *   --include-backups     Include data/backups/ in the package
 *   --skip-build          Skip npm run build (use existing .next / dist)
 *   --skip-stop-check     Do not verify ports 3000/4000/5001 are free
 *
 * Before running:
 *   1. stop.bat  (release DB file locks)
 *   2. Review that active-database.json points at the DB you want to move
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { fileURLToPath } from 'url';
import sqlite3 from 'sqlite3';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');

const EXCLUDE_TOP_DIRS = new Set([
  'node_modules',
  '.git',
  '.turbo',
  'provision',
  'Management Systems',
  'MultiServer',
  '.demo_mode',
]);

const EXCLUDE_DATA_DIRS = new Set([
  'file-repair-snapshots',
  'showcase',
  '.demo_mode',
]);

const STALE_DB_PATTERN = /^computer_dynamics\.(db|recovered-|restored-)/;

function parseArgs(argv) {
  const opts = {
    dest: null,
    includeBackups: false,
    skipBuild: false,
    skipStopCheck: false,
  };
  for (let i = 2; i < argv.length; i++) {
    const arg = argv[i];
    if (arg === '--include-backups') opts.includeBackups = true;
    else if (arg === '--skip-build') opts.skipBuild = true;
    else if (arg === '--skip-stop-check') opts.skipStopCheck = true;
    else if (arg === '--dest' && argv[i + 1]) opts.dest = path.resolve(argv[++i]);
  }
  return opts;
}

function readJson(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}

function readVersion() {
  const pkg = readJson(path.join(root, 'package.json'));
  return String(pkg.version || '0.0.0');
}

function defaultDest() {
  const date = new Date().toISOString().slice(0, 10);
  const version = readVersion();
  return path.join(root, 'provision', `${date}-migration-provision-v${version}`);
}

function portsInUse() {
  const ports = [3000, 4000, 5001];
  const busy = [];
  const result = spawnSync('netstat', ['-ano'], { encoding: 'utf8', shell: true });
  const lines = result.stdout?.split(/\r?\n/) ?? [];
  for (const port of ports) {
    const re = new RegExp(`:${port}\\s+.*LISTENING`);
    if (lines.some((line) => re.test(line))) busy.push(port);
  }
  return busy;
}

function checkpointDatabase(dbPath) {
  if (!fs.existsSync(dbPath)) {
    throw new Error(`Database not found: ${dbPath}`);
  }
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (openErr) => {
      if (openErr) {
        reject(openErr);
        return;
      }
      db.serialize(() => {
        db.run('PRAGMA busy_timeout = 30000');
        db.run('PRAGMA wal_checkpoint(TRUNCATE)', (err1) => {
          db.run('PRAGMA journal_mode = DELETE', (err2) => {
            db.close((closeErr) => {
              if (err1) reject(err1);
              else if (err2) reject(err2);
              else if (closeErr) reject(closeErr);
              else resolve();
            });
          });
        });
      });
    });
  });
}

function getLiveDatabaseFileName() {
  const pointerPath = path.join(root, 'data', 'active-database.json');
  if (fs.existsSync(pointerPath)) {
    const pointer = readJson(pointerPath);
    if (pointer?.fileName) return pointer.fileName;
  }
  const envPath = path.join(root, '.env');
  if (fs.existsSync(envPath)) {
    for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
      const trimmed = line.trim();
      if (!trimmed.startsWith('DATABASE_PATH=')) continue;
      const value = trimmed.slice('DATABASE_PATH='.length).trim();
      return path.basename(value.replace(/^\.\//, 'data/'));
    }
  }
  return 'computer_dynamics.db';
}

function shouldExcludeDataFile(name) {
  if (STALE_DB_PATTERN.test(name)) return true;
  if (name.endsWith('.db-wal') || name.endsWith('.db-shm')) return true;
  if (name.endsWith('.sqlite-wal') || name.endsWith('.sqlite-shm')) return true;
  return false;
}

function copyFileSync(src, dst) {
  fs.mkdirSync(path.dirname(dst), { recursive: true });
  fs.copyFileSync(src, dst);
}

function copyDirFiltered(srcDir, dstDir, { skipDir, skipFile } = {}) {
  if (!fs.existsSync(srcDir)) return;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const entry of fs.readdirSync(srcDir, { withFileTypes: true })) {
    if (entry.isDirectory()) {
      if (skipDir?.(entry.name)) continue;
      copyDirFiltered(path.join(srcDir, entry.name), path.join(dstDir, entry.name), { skipDir, skipFile });
    } else if (entry.isFile()) {
      if (skipFile?.(entry.name)) continue;
      copyFileSync(path.join(srcDir, entry.name), path.join(dstDir, entry.name));
    }
  }
}

function copyAppTree(appDest) {
  for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
    const name = entry.name;
    if (EXCLUDE_TOP_DIRS.has(name)) continue;
    if (name === 'data') continue;
    if (name === '.env') continue;

    const from = path.join(root, name);
    const to = path.join(appDest, name);

    if (entry.isDirectory()) {
      if (name === 'apps') {
        copyDirFiltered(from, to, {
          skipDir: (d) => d === 'cache' && false,
          skipFile: () => false,
        });
        // Remove .next/cache if copied
        const cacheDir = path.join(to, 'web', '.next', 'cache');
        if (fs.existsSync(cacheDir)) {
          fs.rmSync(cacheDir, { recursive: true, force: true });
        }
      } else {
        copyDirFiltered(from, to);
      }
    } else if (entry.isFile()) {
      copyFileSync(from, to);
    }
  }
}

function stageSeedData(seedDataRoot, liveDbFileName, opts) {
  const dataSrc = path.join(root, 'data');
  fs.mkdirSync(seedDataRoot, { recursive: true });

  const liveDbPath = path.join(dataSrc, liveDbFileName);
  copyFileSync(liveDbPath, path.join(seedDataRoot, liveDbFileName));

  for (const entry of fs.readdirSync(dataSrc, { withFileTypes: true })) {
    const name = entry.name;
    if (entry.isFile()) {
      if (shouldExcludeDataFile(name)) continue;
      if (name === liveDbFileName) continue;
      copyFileSync(path.join(dataSrc, name), path.join(seedDataRoot, name));
    } else if (entry.isDirectory()) {
      if (EXCLUDE_DATA_DIRS.has(name)) continue;
      if (name === 'backups' && !opts.includeBackups) continue;
      copyDirFiltered(path.join(dataSrc, name), path.join(seedDataRoot, name));
    }
  }
}

async function main() {
  const opts = parseArgs(process.argv);
  const dest = opts.dest || defaultDest();

  if (fs.existsSync(dest)) {
    console.error('Destination already exists:', dest);
    console.error('Remove it or pass --dest with a different path.');
    process.exit(1);
  }

  if (!opts.skipStopCheck) {
    const busy = portsInUse();
    if (busy.length) {
      console.error('Ports still in use (run stop.bat first):', busy.join(', '));
      process.exit(1);
    }
  }

  const liveDbFileName = getLiveDatabaseFileName();
  console.log('Live database file:', liveDbFileName);
  console.log('Package destination:', dest);

  if (!opts.skipBuild) {
    console.log('Running production build...');
    const build = spawnSync('npm', ['run', 'build'], { cwd: root, stdio: 'inherit', shell: true });
    if (build.status !== 0) process.exit(build.status ?? 1);
  }

  const buildId = path.join(root, 'apps', 'web', '.next', 'BUILD_ID');
  const workerCli = path.join(root, 'packages', 'security', 'dist', 'worker-cli.js');
  if (!fs.existsSync(buildId) || !fs.existsSync(workerCli)) {
    console.error('Build output missing. Run npm run build or remove --skip-build.');
    process.exit(1);
  }

  const appDest = path.join(dest, 'app');
  const seedDataRoot = path.join(dest, 'seed', 'data');
  fs.mkdirSync(appDest, { recursive: true });

  console.log('Copying application tree to app/...');
  copyAppTree(appDest);

  console.log('Staging live data to seed/data/...');
  const liveDbPath = path.join(root, 'data', liveDbFileName);
  await checkpointDatabase(liveDbPath);
  stageSeedData(seedDataRoot, liveDbFileName, opts);

  const licenseSrc = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
  if (fs.existsSync(licenseSrc)) {
    const licenseDest = path.join(dest, 'seed', 'license_activation_system_new', 'instance', 'license_system.db');
    await checkpointDatabase(licenseSrc);
    copyFileSync(licenseSrc, licenseDest);
    console.log('Staged license_system.db');
  }

  const envSrc = path.join(root, '.env');
  if (fs.existsSync(envSrc)) {
    copyFileSync(envSrc, path.join(dest, 'seed', '.env.migrated'));
    console.log('Staged .env as seed/.env.migrated (contains secrets — protect this package)');
  }

  copyFileSync(path.join(root, '.env.example'), path.join(dest, '.env.example'));
  copyFileSync(
    path.join(root, 'scripts', 'migration-provision-update-layout.json'),
    path.join(dest, 'update-layout.json'),
  );
  copyFileSync(path.join(root, 'scripts', 'install-migration-provision.ps1'), path.join(dest, 'install-migration-provision.ps1'));
  copyFileSync(path.join(root, 'scripts', 'install-migration-provision.bat'), path.join(dest, 'install-migration-provision.bat'));

  const seedReadme = [
    'Migration provision seed — LIVE data from source machine',
    '======================================================',
    `Created: ${new Date().toISOString()}`,
    `Source root: ${root}`,
    `Live database: data/${liveDbFileName}`,
    `Backups included: ${opts.includeBackups ? 'yes' : 'no'}`,
    '',
    'Install copies seed/data/* to <InstallRoot>/data/',
    'and license_system.db to license_activation_system_new/instance/.',
  ].join('\n');
  fs.writeFileSync(path.join(dest, 'seed', 'README-SEED.txt'), seedReadme);

  const migrationMd = [
    '# Computer Dynamics v2 — Migration provision',
    '',
    'This package moves a **live** install to another machine (not a fresh customer seed).',
    '',
    '## Prerequisites on target machine',
    '',
    '- Node.js 20+',
    '- Python 3 (license API)',
    '- Optional: cloudflared for public tunnel',
    '',
    '## Install',
    '',
    '1. Copy this entire folder to the target machine.',
    '2. Run:',
    '',
    '```bat',
    'install-migration-provision.bat "D:\\Apps\\ComputerDynamicsV2" "%CD%"',
    '```',
    '',
    '3. Review `.env` (created from migrated secrets if none existed).',
    '4. Update `cloudflared-computerdynamics.yml` / tunnel credentials for this host.',
    '5. Run `start-production.bat`.',
    '',
    '## Notes',
    '',
    `- Live database: data/${liveDbFileName}`,
    '- Mini dock config (`data/mini-dock.json`) is included if present — update Mini path on new PC.',
    '- This package contains production secrets; store and transfer securely.',
    '',
    '## Source',
    '',
    `Built from: ${root}`,
    `Version: ${readVersion()}`,
  ].join('\n');
  fs.writeFileSync(path.join(dest, 'MIGRATION-PROVISION.md'), migrationMd);

  const marker = {
    type: 'migration-provision',
    version: readVersion(),
    createdAt: new Date().toISOString(),
    sourceRoot: root,
    liveDatabase: liveDbFileName,
    includeBackups: opts.includeBackups,
  };
  fs.writeFileSync(path.join(dest, 'migration-manifest.json'), JSON.stringify(marker, null, 2));

  console.log('');
  console.log('========================================');
  console.log(' Migration provision package created');
  console.log('========================================');
  console.log(' Location:', dest);
  console.log('');
  console.log(' Next steps:');
  console.log('   1. Copy the folder to the target machine (USB, zip, etc.)');
  console.log('   2. install-migration-provision.bat "<InstallRoot>" "<package folder>"');
  console.log('   3. start-production.bat on the target');
  console.log('');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
