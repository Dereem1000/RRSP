// print-secrets-schema.js
// Prints the schema for the 'secrets' table in the vault database

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../data/vault.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening vault database:', err.message);
    process.exit(1);
  }
});

db.all("PRAGMA table_info(secrets)", [], (err, rows) => {
  if (err) {
    console.error('Error reading schema:', err.message);
    process.exit(1);
  }
  if (rows.length === 0) {
    console.log('No secrets table found.');
  } else {
    console.log('Schema for secrets table:');
    rows.forEach(col => {
      console.log(` - ${col.name} (${col.type})`);
    });
  }
  db.close();
});
