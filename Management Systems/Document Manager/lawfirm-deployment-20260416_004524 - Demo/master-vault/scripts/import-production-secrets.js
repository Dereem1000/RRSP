// import-production-secrets.js
// Usage: node import-production-secrets.js
// Prompts for name/encrypted_value pairs and inserts them into the vault

const path = require('path');
const readline = require('readline');
const sqlite3 = require('sqlite3').verbose();

const dbPath = path.join(__dirname, '../data/vault.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening vault database:', err.message);
    process.exit(1);
  }
});

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

function promptSecret() {
  rl.question('Enter secret name (or blank to finish): ', (name) => {
    if (!name) {
      rl.close();
      db.close();
      console.log('Import complete.');
      return;
    }
    rl.question('Enter encrypted_value for ' + name + ': ', (encrypted_value) => {
      db.run('INSERT OR REPLACE INTO secrets (name, encrypted_value) VALUES (?, ?)', [name, encrypted_value], (err) => {
        if (err) {
          console.error('Error inserting secret:', err.message);
        } else {
          console.log('Secret saved:', name);
        }
        promptSecret();
      });
    });
  });
}

promptSecret();
