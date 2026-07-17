import sqlite3 from 'sqlite3';
import path from 'path';

const root = path.resolve(import.meta.dirname, '..');
const dbPath = path.join(root, 'data', 'computer_dynamics.db');

const rows = await new Promise((resolve, reject) => {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return reject(err);
    db.all(
      `SELECT id, event_type, severity, description, is_active
       FROM security_events WHERE is_active = 1
       ORDER BY severity DESC, id DESC LIMIT 30`,
      (e, r) => {
        db.close();
        e ? reject(e) : resolve(r ?? []);
      }
    );
  });
});

console.log(JSON.stringify(rows, null, 2));

const fileRows = await new Promise((resolve, reject) => {
  const db = new sqlite3.Database(dbPath, (err) => {
    if (err) return reject(err);
    db.all(
      `SELECT id, event_type, severity, is_active, description
       FROM security_events WHERE event_type LIKE 'file_%'
       ORDER BY id DESC LIMIT 20`,
      (e, r) => {
        db.close();
        e ? reject(e) : resolve(r ?? []);
      }
    );
  });
});

console.log('\n=== file_* events ===');
console.log(JSON.stringify(fileRows, null, 2));
