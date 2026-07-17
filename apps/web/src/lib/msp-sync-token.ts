import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import sqlite3 from 'sqlite3';
import { SystemConfig, getMonorepoRoot } from '@cd-v2/database';
import { getConfiguredSiteUrl } from '@/lib/site-url';

export const MSP_SYNC_TOKEN_KEY = 'msp_api_token';
export const MSP_SYNC_URL_KEY = 'msp_api_url';

export type MspSyncTokenSource = 'env' | 'database' | 'none';

export type MspSyncTokenSettings = {
  configured: boolean;
  effectiveSource: MspSyncTokenSource;
  tokenPreview: string | null;
  mspApiUrl: string;
  envOverride: boolean;
  licenseDbSynced: boolean;
  updatedAt: string | null;
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

function licenseDbAvailable(): boolean {
  try {
    return fs.existsSync(getLicenseDbPath());
  } catch {
    return false;
  }
}

function openLicenseDb(): Promise<sqlite3.Database> {
  const dbPath = getLicenseDbPath();
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(new Error(`License DB not found at ${dbPath}: ${err.message}`));
      else resolve(db);
    });
  });
}

function closeLicenseDb(db: sqlite3.Database): Promise<void> {
  return new Promise((resolve) => db.close(() => resolve()));
}

function runLicenseDb(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<void> {
  return new Promise((resolve, reject) => {
    db.run(sql, params, (err) => (err ? reject(err) : resolve()));
  });
}

function getLicenseDbConfig(key: string): Promise<{ value: string; updatedAt: string | null } | null> {
  if (!licenseDbAvailable()) return Promise.resolve(null);
  return openLicenseDb().then(async (db) => {
    try {
      const row = await new Promise<{ config_value: string; updated_at?: string } | undefined>((resolve, reject) => {
        db.get(
          'SELECT config_value, updated_at FROM system_configuration WHERE config_key = ?',
          [key],
          (err, result) => (err ? reject(err) : resolve(result as { config_value: string; updated_at?: string } | undefined))
        );
      });
      if (!row?.config_value) return null;
      return { value: row.config_value, updatedAt: row.updated_at ?? null };
    } finally {
      await closeLicenseDb(db);
    }
  });
}

async function upsertLicenseDbConfig(key: string, value: string): Promise<boolean> {
  if (!licenseDbAvailable()) return false;

  const db = await openLicenseDb();
  try {
    const existing = await new Promise<{ id: number } | undefined>((resolve, reject) => {
      db.get('SELECT id FROM system_configuration WHERE config_key = ?', [key], (err, row) =>
        err ? reject(err) : resolve(row as { id: number } | undefined)
      );
    });

    const now = new Date().toISOString();
    if (existing) {
      await runLicenseDb(
        db,
        'UPDATE system_configuration SET config_value = ?, updated_at = ? WHERE config_key = ?',
        [value, now, key]
      );
    } else {
      await runLicenseDb(
        db,
        'INSERT INTO system_configuration (config_key, config_value, created_at, updated_at) VALUES (?, ?, ?, ?)',
        [key, value, now, now]
      );
    }
    return true;
  } finally {
    await closeLicenseDb(db);
  }
}

export function maskMspSyncToken(token: string): string {
  if (token.length <= 12) return '••••••••';
  return `${token.slice(0, 4)}…${token.slice(-4)}`;
}

export function getDefaultMspApiUrl(): string {
  const configured = getConfiguredSiteUrl();
  if (configured) return `${configured}/api/msp`;
  const port = process.env.PORT || '3000';
  return `http://localhost:${port}/api/msp`;
}

export function generateMspSyncToken(): string {
  return randomBytes(32).toString('hex');
}

/** Warn when MSP_API_TOKEN in .env can shadow the Settings-managed token. */
export function getMspSyncEnvOverrideMessage(envOverride: boolean): string | null {
  if (!envOverride) return null;
  return (
    'MSP_API_TOKEN is set in .env. Update or remove that variable so the token saved here is the one used for MSP API auth.'
  );
}

/** Token used to authorize License GUI → portal MSP API calls. */
export async function getMspSyncToken(): Promise<string | null> {
  const dbToken = await SystemConfig.getConfig<string>(MSP_SYNC_TOKEN_KEY, null);
  if (dbToken?.trim()) return dbToken.trim();

  return process.env.MSP_API_TOKEN?.trim() || process.env.LICENSE_API_KEY?.trim() || null;
}

export async function getMspSyncTokenSettings(): Promise<MspSyncTokenSettings> {
  const envToken = process.env.MSP_API_TOKEN?.trim();
  const dbToken = await SystemConfig.getConfig<string>(MSP_SYNC_TOKEN_KEY, null);
  const storedUrl = await SystemConfig.getConfig<string>(MSP_SYNC_URL_KEY, null);
  const licenseDbToken = await getLicenseDbConfig(MSP_SYNC_TOKEN_KEY);

  const effectiveToken = dbToken?.trim() || envToken || process.env.LICENSE_API_KEY?.trim() || null;
  const effectiveSource: MspSyncTokenSource = dbToken?.trim()
    ? 'database'
    : envToken
      ? 'env'
      : 'none';

  return {
    configured: Boolean(effectiveToken),
    effectiveSource,
    tokenPreview: effectiveToken ? maskMspSyncToken(effectiveToken) : null,
    mspApiUrl: storedUrl?.trim() || getDefaultMspApiUrl(),
    envOverride: Boolean(process.env.MSP_API_TOKEN?.trim()),
    licenseDbSynced: Boolean(licenseDbToken?.value && dbToken?.trim() === licenseDbToken.value),
    updatedAt: licenseDbToken?.updatedAt ?? null,
  };
}

export async function saveMspSyncToken(token: string, mspApiUrl?: string): Promise<{
  tokenPreview: string;
  licenseDbSynced: boolean;
  envOverride: boolean;
}> {
  const trimmed = token.trim();
  if (trimmed.length < 16) {
    throw new Error('Token must be at least 16 characters');
  }

  await SystemConfig.setConfig(MSP_SYNC_TOKEN_KEY, trimmed, 'string', 'license');

  const apiUrl = (mspApiUrl?.trim() || getDefaultMspApiUrl()).replace(/\/$/, '');
  await SystemConfig.setConfig(MSP_SYNC_URL_KEY, apiUrl, 'string', 'license');

  const licenseDbSynced = await upsertLicenseDbConfig(MSP_SYNC_TOKEN_KEY, trimmed);
  await upsertLicenseDbConfig(MSP_SYNC_URL_KEY, apiUrl);

  return {
    tokenPreview: maskMspSyncToken(trimmed),
    licenseDbSynced,
    envOverride: Boolean(process.env.MSP_API_TOKEN?.trim()),
  };
}
