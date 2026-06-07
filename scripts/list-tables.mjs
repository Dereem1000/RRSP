import Database from 'better-sqlite3';
const db = new Database('f:/Computer Dynamics System v2/data/computer_dynamics.db');
const rows = db.prepare("SELECT name FROM sqlite_master WHERE type='table' ORDER BY name").all();
console.log(rows.map((r) => r.name).join('\n'));
