import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { getLicenseDbPath, isLicenseDbAvailable } from './license-paths';

export type LicenseActivationRow = {
  id: number;
  serial_number: string;
  license_type: string;
  is_active: number;
  expiration_date: string | null;
  msp_client_id: string | null;
  company_name: string;
  email: string;
};

function openDb(): Promise<sqlite3.Database> {
  const dbPath = getLicenseDbPath();
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(err);
      else resolve(db);
    });
  });
}

function closeDb(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

function all<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows as T[]) ?? [])));
  });
}

function get<T>(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<T | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as T | undefined)));
  });
}

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<{ changes: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ changes: this.changes });
    });
  });
}

const EXPIRED_BUT_ACTIVE_WHERE = `
  is_active = 1 AND expiration_date IS NOT NULL
  AND datetime(expiration_date) < datetime('now')
`;

const LICENSE_JOIN = `
  SELECT la.id, la.serial_number, la.license_type, la.is_active, la.expiration_date,
         cr.msp_client_id, cr.company_name, cr.email
  FROM license_activation la
  JOIN company_registration cr ON la.company_id = cr.id
`;

export async function queryLicenseActivations(): Promise<LicenseActivationRow[]> {
  if (!isLicenseDbAvailable()) return [];
  const db = await openDb();
  try {
    return all<LicenseActivationRow>(db, LICENSE_JOIN);
  } finally {
    await closeDb(db);
  }
}

export async function countRecentValidationFailures(windowMinutes: number): Promise<number> {
  if (!isLicenseDbAvailable()) return 0;
  const db = await openDb();
  try {
    const row = await get<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM license_validation_log
       WHERE validation_result = 'failed'
       AND datetime(created_at) >= datetime('now', ?)`,
      [`-${windowMinutes} minutes`]
    );
    return row?.c ?? 0;
  } finally {
    await closeDb(db);
  }
}

export async function countRecentActivations(windowMinutes: number): Promise<number> {
  if (!isLicenseDbAvailable()) return 0;
  const db = await openDb();
  try {
    const row = await get<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM license_activation
       WHERE datetime(created_at) >= datetime('now', ?)`,
      [`-${windowMinutes} minutes`]
    );
    return row?.c ?? 0;
  } finally {
    await closeDb(db);
  }
}

export async function countExpiredButActive(): Promise<number> {
  if (!isLicenseDbAvailable()) return 0;
  const db = await openDb();
  try {
    const row = await get<{ c: number }>(
      db,
      `SELECT COUNT(*) as c FROM license_activation WHERE ${EXPIRED_BUT_ACTIVE_WHERE}`
    );
    return row?.c ?? 0;
  } finally {
    await closeDb(db);
  }
}

export async function queryExpiredButActiveLicenses(): Promise<
  Array<{ id: number; serial_number: string; expiration_date: string; company_name: string }>
> {
  if (!isLicenseDbAvailable()) return [];
  const db = await openDb();
  try {
    return all(db, `
      SELECT la.id, la.serial_number, la.expiration_date, cr.company_name
      FROM license_activation la
      JOIN company_registration cr ON la.company_id = cr.id
      WHERE ${EXPIRED_BUT_ACTIVE_WHERE}
      ORDER BY la.expiration_date ASC
    `);
  } finally {
    await closeDb(db);
  }
}

/** Mirror license_validator.py: expired licenses should not stay active. */
export async function deactivateExpiredActiveLicenses(): Promise<{
  deactivated: number;
  serials: string[];
}> {
  if (!isLicenseDbAvailable()) return { deactivated: 0, serials: [] };
  const db = await openDb();
  try {
    const rows = await all<{ serial_number: string }>(
      db,
      `SELECT serial_number FROM license_activation WHERE ${EXPIRED_BUT_ACTIVE_WHERE}`
    );
    if (rows.length === 0) return { deactivated: 0, serials: [] };

    const { changes } = await run(
      db,
      `UPDATE license_activation
       SET is_active = 0, updated_at = datetime('now')
       WHERE ${EXPIRED_BUT_ACTIVE_WHERE}`
    );
    return { deactivated: changes, serials: rows.map((r) => r.serial_number) };
  } finally {
    await closeDb(db);
  }
}

export function getLicenseDbFileStats(): { exists: boolean; size: number; path: string } {
  const p = getLicenseDbPath();
  if (!fs.existsSync(p)) return { exists: false, size: 0, path: p };
  return { exists: true, size: fs.statSync(p).size, path: p };
}
