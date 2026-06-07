// check-secrets.js
// Lists all secrets in the vault database

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../data/vault.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening vault database:', err.message);
    process.exit(1);
  }
});

db.all('SELECT name FROM secrets', [], (err, rows) => {
  if (err) {
    console.error('Error reading secrets:', err.message);
    process.exit(1);
  }
  if (rows.length === 0) {
    console.log('No secrets found in vault.');
  } else {
    console.log(`Found ${rows.length} secrets in vault:`);
    rows.forEach(row => console.log(' -', row.name));
  }
  db.close();
});
