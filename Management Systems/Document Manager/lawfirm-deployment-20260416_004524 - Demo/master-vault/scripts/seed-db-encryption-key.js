#!/usr/bin/env node
/**
 * Seed DB_ENCRYPTION_KEY into the vault.
 * Uses vault-compatible encryption (AES-256-GCM + PBKDF2) so it works in deployment (no src/ required).
 *
 * Usage (from master-vault folder):
 *   set MASTER_PASSWORD=YourVaultMasterPassword
 *   set DB_ENCRYPTION_KEY=your-64-char-hex-key
 *   node scripts/seed-db-encryption-key.js
 *
 * Or pass key as first argument (master password still from env):
 *   node scripts/seed-db-encryption-key.js <64-char-hex-key>
 */

const path = require('path');
const sqlite3 = require('sqlite3').verbose();
const { v4: uuidv4 } = require('uuid');

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || process.env.VAULT_MASTER_PASSWORD;
const DB_ENCRYPTION_KEY = process.env.DB_ENCRYPTION_KEY || process.argv[2];

if (!MASTER_PASSWORD) {
  console.error('Error: Set MASTER_PASSWORD (or VAULT_MASTER_PASSWORD) in the environment.');
  process.exit(1);
}
if (!DB_ENCRYPTION_KEY || DB_ENCRYPTION_KEY.length !== 64 || !/^[0-9a-fA-F]+$/.test(DB_ENCRYPTION_KEY)) {
  console.error('Error: Set DB_ENCRYPTION_KEY in the environment (64 hex characters), or pass as first argument.');
  process.exit(1);
}

// Inline vault-compatible encryption so script works in deployment without src/
function encrypt(plaintext, masterPassword) {
  const crypto = require('crypto');
  const SALT_LENGTH = 16;
  const ITERATIONS = 100000;
  const salt = crypto.randomBytes(SALT_LENGTH);
  const iv = crypto.randomBytes(12);
  const key = crypto.pbkdf2Sync(masterPassword, salt, ITERATIONS, 32, 'sha256');
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  let encryptedData = cipher.update(plaintext, 'utf8', 'hex');
  encryptedData += cipher.final('hex');
  const authTag = cipher.getAuthTag();
  return {
    encryptedData,
    iv: iv.toString('hex'),
    authTag: authTag.toString('hex'),
    salt: salt.toString('hex'),
  };
}

const dbPath = path.join(__dirname, '../data/vault.db');
const db = new sqlite3.Database(dbPath, sqlite3.OPEN_READWRITE, (err) => {
  if (err) {
    console.error('Error opening vault database:', err.message);
    process.exit(1);
  }
});

function run(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve(this);
    });
  });
}

function get(sql, params = []) {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => {
      if (err) reject(err);
      else resolve(row);
    });
  });
}

async function main() {
  try {
    const tableInfo = await new Promise((resolve, reject) => {
      db.all('PRAGMA table_info(secrets)', (err, rows) => {
        if (err) reject(err);
        else resolve(rows);
      });
    });
    const hasSalt = tableInfo.some((c) => c.name === 'salt');
    if (!hasSalt) {
      await run('ALTER TABLE secrets ADD COLUMN salt TEXT');
      console.log('Added salt column to secrets table.');
    }

    const encrypted = encrypt(DB_ENCRYPTION_KEY, MASTER_PASSWORD);
    const secretId = uuidv4();
    const existing = await get('SELECT id FROM secrets WHERE name = ?', ['DB_ENCRYPTION_KEY']);

    if (existing) {
      await run(
        `UPDATE secrets SET encrypted_value = ?, iv = ?, auth_tag = ?, salt = ?, updated_at = CURRENT_TIMESTAMP WHERE name = ?`,
        [encrypted.encryptedData, encrypted.iv, encrypted.authTag, encrypted.salt, 'DB_ENCRYPTION_KEY']
      );
      console.log('Updated existing DB_ENCRYPTION_KEY in vault.');
    } else {
      await run(
        `INSERT INTO secrets (id, name, encrypted_value, iv, auth_tag, salt, description, created_by) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          secretId,
          'DB_ENCRYPTION_KEY',
          encrypted.encryptedData,
          encrypted.iv,
          encrypted.authTag,
          encrypted.salt,
          'Database encryption key (64 hex) for lawfirm.db',
          'seed-script',
        ]
      );
      console.log('Stored DB_ENCRYPTION_KEY in vault.');
    }

    console.log('Done. Run: node scripts/check-secrets.js');
  } catch (err) {
    console.error(err);
    process.exit(1);
  } finally {
    db.close();
  }
}

main();
