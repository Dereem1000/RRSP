/**
 * Export empty-table schema from the live database for showcase installs.
 * Writes data/showcase/schema.sql (CREATE TABLE + INDEX statements only).
 */
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { fileURLToPath } from 'url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const sourceDb = path.join(root, 'data', 'computer_dynamics.db');
const outDir = path.join(root, 'data', 'showcase');
const outFile = path.join(outDir, 'schema.sql');

const SKIP_TABLES = /_(backup|new|old)$/;

function all(db, sql) {
  return new Promise((resolve, reject) => {
    db.all(sql, (err, rows) => (err ? reject(err) : resolve(rows)));
  });
}

if (!fs.existsSync(sourceDb)) {
  console.error('Source database not found:', sourceDb);
  process.exit(1);
}

const db = new sqlite3.Database(sourceDb);
const objects = await all(
  db,
  `SELECT type, name, sql FROM sqlite_master
   WHERE sql IS NOT NULL
     AND name NOT LIKE 'sqlite_%'
   ORDER BY CASE type WHEN 'table' THEN 0 WHEN 'index' THEN 1 ELSE 2 END, name`
);

const lines = [
  '-- Computer Dynamics v2 showcase schema (structure only, no data)',
  `-- Exported from ${path.basename(sourceDb)} on ${new Date().toISOString()}`,
  'PRAGMA foreign_keys = OFF;',
  '',
];

for (const row of objects) {
  if (row.type === 'table' && SKIP_TABLES.test(row.name)) continue;
  if (row.type === 'index' && SKIP_TABLES.test(row.name.replace(/^sqlite_autoindex_/, ''))) continue;
  lines.push(`${row.sql};`, '');
}

lines.push('PRAGMA foreign_keys = ON;', '');

fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(outFile, lines.join('\n'), 'utf8');
console.log('Wrote', outFile);
console.log('Objects:', objects.filter((o) => o.type === 'table' && !SKIP_TABLES.test(o.name)).length, 'tables');
db.close();
