import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { promisify } from 'util';
import { getMonorepoRoot } from '@cd-v2/database';
import { Client } from '@/lib/db';
import { FEATURE_TO_LICENSE_KEY, activationFeaturesFromLicenseRows, type ActivationFeature } from '@/lib/license-constants';

export type LicenseRow = {
  id: number;
  serialNumber: string;
  licenseType: string;
  isActive: boolean;
  maxUsers: number;
  features: Record<string, boolean>;
  activationDate: string | null;
  expirationDate: string | null;
  companyName: string;
  contactPerson: string;
  email: string;
  mspClientId: string | null;
};

export type CombinedLicenseStatus = {
  id: number;
  serialNumber: string;
  licenseType: string;
  isActive: boolean;
  maxUsers: number;
  features: Record<string, boolean>;
  activationDate: string | null;
  expirationDate: string | null;
  companyName: string;
  contactPerson: string;
  email: string;
  allLicenses: LicenseRow[];
};

type DbRow = {
  id: number;
  serial_number: string;
  license_type: string;
  is_active: number;
  max_users: number;
  features: string | null;
  activation_date: string | null;
  expiration_date: string | null;
  company_name: string;
  contact_person: string;
  email: string;
  msp_client_id: string | null;
};

function getLicenseDbPath(): string {
  const v2Root = getMonorepoRoot();
  const defaultPath = path.join(v2Root, 'license_activation_system_new', 'instance', 'license_system.db');

  const configured = process.env.LICENSE_DB_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured) ? configured : path.resolve(v2Root, configured);
  }

  return defaultPath;
}

function openDb(): Promise<sqlite3.Database> {
  const dbPath = getLicenseDbPath();
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(new Error(`License DB not found at ${dbPath}: ${err.message}`));
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

function run(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<{ lastID: number }> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, function (err) {
      if (err) reject(err);
      else resolve({ lastID: this.lastID });
    });
  });
}

function get(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<DbRow | undefined> {
  return new Promise((resolve, reject) => {
    db.get(sql, params, (err, row) => (err ? reject(err) : resolve(row as DbRow | undefined)));
  });
}

function parseFeatures(raw: string | null): Record<string, boolean> {
  if (!raw) return {};
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, boolean> = {};
    for (const [k, v] of Object.entries(parsed)) out[k] = Boolean(v);
    return out;
  } catch {
    return {};
  }
}

function rowToLicense(row: DbRow): LicenseRow {
  const license: LicenseRow = {
    id: row.id,
    serialNumber: row.serial_number,
    licenseType: row.license_type,
    isActive: Boolean(row.is_active),
    maxUsers: row.max_users,
    features: parseFeatures(row.features),
    activationDate: row.activation_date,
    expirationDate: row.expiration_date,
    companyName: row.company_name,
    contactPerson: row.contact_person,
    email: row.email,
    mspClientId: row.msp_client_id,
  };
  license.isActive = isLicenseCurrentlyActive(row);
  return license;
}

function isLicenseCurrentlyActive(row: DbRow): boolean {
  if (!row.is_active) return false;
  if (!row.expiration_date) return true;
  return new Date(row.expiration_date) > new Date();
}

function isLicenseRowActive(license: LicenseRow): boolean {
  if (!license.isActive) return false;
  if (!license.expirationDate) return true;
  return new Date(license.expirationDate) > new Date();
}

const LICENSE_QUERY = `
  SELECT la.id, la.serial_number, la.license_type, la.is_active, la.max_users, la.features,
         la.activation_date, la.expiration_date,
         cr.company_name, cr.contact_person, cr.email, cr.msp_client_id
  FROM license_activation la
  JOIN company_registration cr ON la.company_id = cr.id
`;

export function getLicenseDbPathForDisplay() {
  return getLicenseDbPath();
}

export function isLicenseDbAvailable(): boolean {
  try {
    return fs.existsSync(getLicenseDbPath());
  } catch {
    return false;
  }
}

export async function getLicensesForClient(mspClientId: string, email?: string | null): Promise<LicenseRow[]> {
  const db = await openDb();
  try {
    let rows = await all<DbRow>(db, `${LICENSE_QUERY} WHERE cr.msp_client_id = ?`, [mspClientId]);
    if (rows.length === 0 && email) {
      rows = await all<DbRow>(db, `${LICENSE_QUERY} WHERE cr.email = ?`, [email]);
    }
    return rows.map(rowToLicense);
  } finally {
    await closeDb(db);
  }
}

export async function getLicenseStatusByMspClientId(mspClientId: string): Promise<CombinedLicenseStatus | null> {
  const client = await Client.findByPk(mspClientId, { attributes: ['id', 'email', 'name'] });
  if (!client) return null;

  const db = await openDb();
  try {
    let rows = await all<DbRow>(db, `${LICENSE_QUERY} WHERE cr.msp_client_id = ?`, [mspClientId]);
    if (rows.length === 0) {
      rows = await all<DbRow>(db, `${LICENSE_QUERY} WHERE cr.email = ?`, [client.email]);
    }
    if (rows.length === 0) return null;

    const combinedFeatures: Record<string, boolean> = {};
    let hasActiveLicense = false;
    const allLicenses: LicenseRow[] = [];

    for (const row of rows) {
      const features = parseFeatures(row.features);
      const active = isLicenseCurrentlyActive(row);
      if (active) {
        hasActiveLicense = true;
        for (const [k, v] of Object.entries(features)) {
          if (v) combinedFeatures[k] = true;
        }
      }
      allLicenses.push(rowToLicense(row));
    }

    const first = rows[0];
    return {
      id: first.id,
      serialNumber: first.serial_number,
      licenseType: first.license_type,
      isActive: hasActiveLicense,
      maxUsers: first.max_users,
      features: combinedFeatures,
      activationDate: first.activation_date,
      expirationDate: first.expiration_date,
      companyName: first.company_name,
      contactPerson: first.contact_person,
      email: first.email,
      allLicenses,
    };
  } finally {
    await closeDb(db);
  }
}

export async function getActiveLicenses(): Promise<LicenseRow[]> {
  const db = await openDb();
  try {
    const rows = await all<DbRow>(db, `${LICENSE_QUERY} WHERE la.is_active = 1`);
    return rows.map(rowToLicense);
  } finally {
    await closeDb(db);
  }
}

function findLicenseRowForFeature(licenses: LicenseRow[], feature: ActivationFeature): LicenseRow | undefined {
  const key = FEATURE_TO_LICENSE_KEY[feature];
  const matching = licenses.filter((l) => l.features[key]);
  const active = matching.find(isLicenseRowActive);
  if (active) return active;
  return matching.sort((a, b) => b.id - a.id)[0];
}

export type FeatureLicenseStatusEntry = {
  hasLicense: boolean;
  isActive: boolean;
  serialNumber?: string;
  licenseId?: number;
  expirationDate?: string | null;
  licenseType?: string;
};

export type ClientLicenseSnapshot = {
  dbAvailable: boolean;
  dbPath?: string;
  activationFeatures: ActivationFeature[];
  featureLicenseStatus: Partial<Record<ActivationFeature, FeatureLicenseStatusEntry>>;
  overallStatus: 'Active' | 'Partial' | 'Pending' | 'Not Found' | 'Unavailable';
  hasActiveLicense: boolean;
  license: CombinedLicenseStatus | null;
};

/** License DB is the source of truth — derive all display/sync data from license rows */
export function buildLicenseSnapshot(license: CombinedLicenseStatus | null): ClientLicenseSnapshot {
  if (!license) {
    return {
      dbAvailable: true,
      activationFeatures: [],
      featureLicenseStatus: {},
      overallStatus: 'Not Found',
      hasActiveLicense: false,
      license: null,
    };
  }

  const activationFeatures = activationFeaturesFromLicenseRows(license.allLicenses);
  const featureLicenseStatus: Partial<Record<ActivationFeature, FeatureLicenseStatusEntry>> = {};

  for (const feature of activationFeatures) {
    const row = findLicenseRowForFeature(license.allLicenses, feature);
    featureLicenseStatus[feature] = {
      hasLicense: Boolean(row),
      isActive: row ? isLicenseRowActive(row) : false,
      serialNumber: row?.serialNumber,
      licenseId: row?.id,
      expirationDate: row?.expirationDate ?? null,
      licenseType: row?.licenseType,
    };
  }

  const statuses = Object.values(featureLicenseStatus);
  const activeCount = statuses.filter((s) => s?.isActive).length;
  const hasAny = statuses.length > 0;
  const hasActiveLicense = activeCount > 0;

  let overallStatus: ClientLicenseSnapshot['overallStatus'] = 'Not Found';
  if (hasAny && activeCount === statuses.length) overallStatus = 'Active';
  else if (hasActiveLicense) overallStatus = 'Partial';
  else if (hasAny) overallStatus = 'Pending';

  return {
    dbAvailable: true,
    activationFeatures,
    featureLicenseStatus,
    overallStatus,
    hasActiveLicense,
    license,
  };
}

export async function getClientLicenseSnapshot(mspClientId: string): Promise<ClientLicenseSnapshot> {
  if (!isLicenseDbAvailable()) {
    return {
      dbAvailable: false,
      dbPath: getLicenseDbPathForDisplay(),
      activationFeatures: [],
      featureLicenseStatus: {},
      overallStatus: 'Unavailable',
      hasActiveLicense: false,
      license: null,
    };
  }

  const license = await getLicenseStatusByMspClientId(mspClientId);
  return buildLicenseSnapshot(license);
}

export type FeatureLicenseStatus = Record<ActivationFeature, FeatureLicenseStatusEntry>;

/** @deprecated Use buildLicenseSnapshot — kept for callers passing explicit feature lists */
export function buildFeatureLicenseStatus(
  activationFeatures: ActivationFeature[],
  license: CombinedLicenseStatus | null
): Partial<FeatureLicenseStatus> {
  const snapshot = buildLicenseSnapshot(license);
  const result: Partial<FeatureLicenseStatus> = {};
  for (const feature of activationFeatures) {
    result[feature] = snapshot.featureLicenseStatus[feature] ?? {
      hasLicense: false,
      isActive: false,
    };
  }
  return result;
}

export async function activateLicense(licenseId: number): Promise<boolean> {
  const db = await openDb();
  try {
    await run(db, `UPDATE license_activation SET is_active = 1, updated_at = datetime('now') WHERE id = ?`, [
      licenseId,
    ]);
    return true;
  } finally {
    await closeDb(db);
  }
}

export async function withLicenseDb<T>(fn: (db: sqlite3.Database) => Promise<T>): Promise<T> {
  const db = await openDb();
  try {
    return await fn(db);
  } finally {
    await closeDb(db);
  }
}

export { get, run, all, parseFeatures };
