const sqlite3 = require('sqlite3');
const path = require('path');
const dbPath = path.resolve(__dirname, '../data/computer_dynamics.db');
const db = new sqlite3.Database(dbPath);
db.all(
  "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name",
  (err, rows) => {
    if (err) console.error(err);
    else console.log(rows.map((r) => r.name).join('\n'));
    db.close();
  }
);
