/**
 * One-time bulk update: normalize Trinidad & Tobago phone numbers to +1-868-XXX-XXXX.
 * Run: node scripts/migrate-phone-numbers.mjs
 * Dry run: node scripts/migrate-phone-numbers.mjs --dry-run
 */
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { getSequelize, getMonorepoRoot } from '../packages/database/dist/connection.js';
import { Client, SalesOpportunity, SystemConfig, Ticket, User } from '../packages/database/dist/index.js';

const CANONICAL_PHONE_RE = /^\+1-868-\d{3}-\d{4}$/;

function formatLocalPhoneInput(value) {
  const digits = String(value || '').replace(/\D/g, '').slice(0, 7);
  if (digits.length <= 3) return digits;
  return `${digits.slice(0, 3)}-${digits.slice(3)}`;
}

function parsePhoneToLocal(phone) {
  if (!phone) return '';
  let digits = String(phone).replace(/\D/g, '');
  if (digits.startsWith('1868') && digits.length >= 11) digits = digits.slice(4);
  else if (digits.startsWith('868') && digits.length >= 10) digits = digits.slice(3);
  else if (digits.startsWith('1') && digits.length >= 11) digits = digits.slice(1).replace(/^868/, '');
  return formatLocalPhoneInput(digits.slice(0, 7));
}

function buildFullPhone(local) {
  const digits = String(local || '').replace(/\D/g, '').slice(0, 7);
  if (!digits) return '';
  return `+1-868-${formatLocalPhoneInput(digits)}`;
}

function isTrinidadPhone(phone) {
  const trimmed = String(phone || '').trim();
  if (!trimmed) return false;
  if (/868/i.test(trimmed)) return true;
  const digits = trimmed.replace(/\D/g, '');
  if (digits.length === 7) return true;
  if (digits.startsWith('868') && digits.length === 10) return true;
  if (digits.startsWith('1868') && digits.length === 11) return true;
  return false;
}

function normalizeStoredPhone(phone) {
  if (phone == null) return null;
  const trimmed = String(phone).trim();
  if (!trimmed) return null;
  if (CANONICAL_PHONE_RE.test(trimmed)) return trimmed;
  if (!isTrinidadPhone(trimmed)) return trimmed;
  const localDigits = parsePhoneToLocal(trimmed).replace(/\D/g, '');
  if (localDigits.length !== 7) return trimmed;
  return buildFullPhone(localDigits);
}

const dryRun = process.argv.includes('--dry-run');
let changed = 0;

async function migrateField(Model, field, label) {
  const allRows = await Model.findAll({ attributes: ['id', field] });
  const candidates = allRows.filter((row) => {
    const value = row[field];
    return value != null && String(value).trim() !== '';
  });

  console.log(`\n${label}: checking ${candidates.length} record(s) with phone values`);

  for (const row of candidates) {
    const current = String(row[field]).trim();
    const next = normalizeStoredPhone(current);
    if (!next || next === current) continue;

    console.log(`  ${row.id}: ${current} -> ${next}`);
    changed += 1;
    if (!dryRun) {
      await row.update({ [field]: next });
    }
  }
}

function getLicenseDbPath() {
  const root = getMonorepoRoot();
  const configured = process.env.LICENSE_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(root, configured);
  }
  return path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
}

async function migrateLicenseDb() {
  const dbPath = getLicenseDbPath();
  if (!fs.existsSync(dbPath)) {
    console.log(`\nLicense DB: skipped (${dbPath} not found)`);
    return;
  }

  const db = new sqlite3.Database(dbPath);
  const all = promisify(db.all.bind(db));
  const run = promisify(db.run.bind(db));

  try {
    const rows = await all(`SELECT id, phone FROM company_registration WHERE phone IS NOT NULL AND TRIM(phone) != ''`);
    console.log(`\nLicense company_registration: checking ${rows.length} record(s)`);

    for (const row of rows) {
      const current = String(row.phone).trim();
      const next = normalizeStoredPhone(current);
      if (!next || next === current) continue;

      console.log(`  company #${row.id}: ${current} -> ${next}`);
      changed += 1;
      if (!dryRun) {
        await run(`UPDATE company_registration SET phone = ? WHERE id = ?`, [next, row.id]);
      }
    }
  } finally {
    await promisify(db.close.bind(db))();
  }
}

async function migrateSystemConfigPhone() {
  const current = await SystemConfig.getConfig('email_company_phone', '+1-868-316-8851');
  const next = normalizeStoredPhone(String(current ?? ''));
  if (!next || next === String(current ?? '').trim()) return;

  console.log(`\nSystemConfig email_company_phone: ${current} -> ${next}`);
  changed += 1;
  if (!dryRun) {
    await SystemConfig.setConfig('email_company_phone', next, 'string');
  }
}

const sequelize = getSequelize();
await sequelize.authenticate();

await migrateField(Client, 'phone', 'Clients');
await migrateField(User, 'phone', 'Users');
await migrateField(SalesOpportunity, 'phone', 'Sales opportunities');
await migrateField(Ticket, 'clientContactNumber', 'Ticket contact numbers');
await migrateSystemConfigPhone();
await migrateLicenseDb();

await sequelize.close();

console.log(
  dryRun
    ? `\nDry run complete — ${changed} phone value(s) would be updated.`
    : `\nUpdated ${changed} phone value(s).`
);
