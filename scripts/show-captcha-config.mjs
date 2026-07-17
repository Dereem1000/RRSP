import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const portalDb = path.join(path.dirname(path.dirname(fileURLToPath(import.meta.url))), 'data', 'computer_dynamics.db');

const db = new sqlite3.Database(portalDb);
db.all(
  `SELECT key, value, type FROM system_configs
   WHERE key IN ('recaptcha_site_key','recaptcha_secret_key','bot_captcha_enabled','captcha_enabled')`,
  [],
  (err, rows) => {
    if (err) {
      console.error(err);
      process.exit(1);
    }
    for (const row of rows) {
      if (row.key === 'recaptcha_secret_key') {
        console.log(row.key, `(len ${String(row.value).length}, ends …${String(row.value).slice(-4)})`);
      } else {
        console.log(row.key, row.value);
      }
    }
    db.close();
  }
);
