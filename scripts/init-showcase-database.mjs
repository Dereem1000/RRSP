/**
 * Create a fresh showcase database: copy structure from the live DB, clear data, seed demo rows.
 *
 * Usage:
 *   node scripts/init-showcase-database.mjs [target-db-path]
 *
 * Default target: data/showcase/computer_dynamics.db
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const templateDb = path.join(root, 'data', 'computer_dynamics.db');
const defaultDb = path.join(root, 'data', 'showcase', 'computer_dynamics.db');
const targetDb = path.resolve(process.argv[2] || defaultDb);

function run(db, sql) {
  return new Promise((resolve, reject) => {
    db.run(sql, (err) => (err ? reject(err) : resolve()));
  });
}

function all(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

function copyDbFiles(sourcePath, destPath) {
  fs.mkdirSync(path.dirname(destPath), { recursive: true });
  fs.copyFileSync(sourcePath, destPath);
  for (const suffix of ['-wal', '-shm']) {
    const sidecar = `${sourcePath}${suffix}`;
    if (fs.existsSync(sidecar)) {
      fs.copyFileSync(sidecar, `${destPath}${suffix}`);
    }
  }
}

function removeDbFiles(basePath) {
  for (const suffix of ['', '-wal', '-shm']) {
    const filePath = `${basePath}${suffix}`;
    if (fs.existsSync(filePath)) fs.unlinkSync(filePath);
  }
}

async function clearAllData(dbPath) {
  const db = new sqlite3.Database(dbPath);
  const tables = await all(
    db,
    "SELECT name FROM sqlite_master WHERE type='table' AND name NOT LIKE 'sqlite_%' ORDER BY name"
  );

  await run(db, 'PRAGMA foreign_keys = OFF');
  for (const { name } of tables) {
    await run(db, `DELETE FROM "${name}"`);
  }
  try {
    await run(db, 'DELETE FROM sqlite_sequence');
  } catch {
    /* optional */
  }
  await run(db, 'PRAGMA foreign_keys = ON');
  await run(db, 'VACUUM');
  db.close();
}

if (!fs.existsSync(templateDb)) {
  console.error('Template database not found:', templateDb);
  console.error('Copy your v1/v2 computer_dynamics.db to data/ first.');
  process.exit(1);
}

removeDbFiles(targetDb);
console.log('Copying database structure from:', templateDb);
copyDbFiles(templateDb, targetDb);

console.log('Clearing existing rows...');
await clearAllData(targetDb);

console.log('Seeding showcase data...');
const seed = spawnSync(
  process.platform === 'win32' ? 'npx.cmd' : 'npx',
  ['tsx', 'src/seed-showcase.ts'],
  {
    cwd: path.join(root, 'packages', 'database'),
    env: { ...process.env, CD_V2_ROOT: root, DATABASE_PATH: targetDb },
    stdio: 'inherit',
    shell: process.platform === 'win32',
  }
);

if (seed.status !== 0) {
  process.exit(seed.status ?? 1);
}

console.log('Showcase database ready:', targetDb);
