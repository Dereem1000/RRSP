// get-secret.js
// Usage: node get-secret.js SECRET_NAME
// Prints the encrypted_value of the given secret name from the vault

const path = require('path');
const sqlite3 = require('sqlite3').verbose();

const name = process.argv[2];
if (!name) {
  console.error('Usage: node get-secret.js SECRET_NAME');
  process.exit(1);
}

const dbPath = path.join(__dirname, '../data/vault.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READONLY, (err) => {
  if (err) {
    console.error('Error opening vault database:', err.message);
    process.exit(1);
  }
});

db.get('SELECT encrypted_value FROM secrets WHERE name = ?', [name], (err, row) => {
  if (err) {
    console.error('Error reading secret:', err.message);
    process.exit(1);
  }
  if (!row) {
    console.log(`Secret not found: ${name}`);
  } else {
    console.log(row.encrypted_value);
  }
  db.close();
});
