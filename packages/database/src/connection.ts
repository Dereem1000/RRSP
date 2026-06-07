import fs from 'fs';
import path from 'path';
import dotenv from 'dotenv';
import { Sequelize } from 'sequelize';
import sqlite3 from 'sqlite3';
import { setDemoModeCache } from './demo-mode';

function loadEnv(): void {
  const candidates = [
    process.env.CD_V2_ROOT ? path.join(process.env.CD_V2_ROOT, '.env') : '',
    path.resolve(process.cwd(), '../../.env'),
    path.resolve(process.cwd(), '.env'),
    path.resolve(__dirname, '../../../.env'),
  ].filter(Boolean);

  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      dotenv.config({ path: envPath });
      break;
    }
  }
}

loadEnv();

/** Resolve monorepo root (Computer Dynamics System v2/) reliably across Next.js, tsx, and node. */
export function getMonorepoRoot(): string {
  if (process.env.CD_V2_ROOT?.trim()) {
    return path.resolve(process.env.CD_V2_ROOT.trim());
  }

  const cwd = process.cwd();
  const cwdNorm = cwd.replace(/\\/g, '/');

  if (cwdNorm.endsWith('/apps/web') || cwdNorm.endsWith('/apps/api')) {
    return path.resolve(cwd, '../..');
  }

  if (fs.existsSync(path.join(cwd, 'data', 'computer_dynamics.db'))) {
    return cwd;
  }

  const fromPackage = path.resolve(__dirname, '../../..');
  if (fs.existsSync(path.join(fromPackage, 'data', 'computer_dynamics.db'))) {
    return fromPackage;
  }

  return fromPackage;
}

const defaultDbPath = path.join(getMonorepoRoot(), 'data', 'computer_dynamics.db');

/** Path to the production/live SQLite database file. */
export function getLiveDatabasePath(): string {
  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(getMonorepoRoot(), configured);
  }
  return defaultDbPath;
}

/** Active DB path — always the live database file (demo mode uses a snapshot for restore). */
export function getDatabasePath(): string {
  return getLiveDatabasePath();
}

let sequelize: Sequelize | null = null;
let onSequelizeCreated: ((instance: Sequelize) => void) | null = null;

export function setSequelizeRecreateHook(fn: (instance: Sequelize) => void): void {
  onSequelizeCreated = fn;
}

function createSequelizeInstance(storage: string): Sequelize {
  const instance = new Sequelize({
    dialect: 'sqlite',
    dialectModule: sqlite3,
    storage,
    logging: process.env.DB_LOGGING === 'true' ? console.log : false,
    define: {
      timestamps: false,
      underscored: true,
      freezeTableName: true,
    },
    pool: {
      max: 5,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  instance.addHook('afterConnect', async (connection: { exec: (sql: string) => Promise<void> }) => {
    await connection.exec('PRAGMA foreign_keys = ON;');
  });

  onSequelizeCreated?.(instance);
  return instance;
}

export function getSequelize(): Sequelize {
  if (!sequelize) {
    const marker = path.join(getMonorepoRoot(), 'data', '.demo_mode', 'active.json');
    if (fs.existsSync(marker)) {
      setDemoModeCache(true);
    }

    sequelize = createSequelizeInstance(getDatabasePath());
  }
  return sequelize;
}

/** Connect only — never sync/alter; v2 reads the v1 schema as-is. */
export async function testConnection(): Promise<boolean> {
  const db = getSequelize();
  await db.authenticate();
  await db.query('PRAGMA foreign_keys = ON;');
  return true;
}

export async function closeConnection(): Promise<void> {
  if (sequelize) {
    await sequelize.close();
    sequelize = null;
  }
}

/** Recreate Sequelize and rebind models after closeConnection() (e.g. demo sandbox toggle). */
export async function reopenConnection(): Promise<Sequelize> {
  const db = getSequelize();
  await db.authenticate();
  await db.query('PRAGMA foreign_keys = ON;');
  return db;
}
