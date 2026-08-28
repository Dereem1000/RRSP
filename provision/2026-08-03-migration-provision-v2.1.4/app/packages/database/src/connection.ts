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

const defaultDbFileName = 'computer_dynamics.db';
const defaultDbPath = path.join(getMonorepoRoot(), 'data', defaultDbFileName);

function demoMarkerPath(): string {
  return path.join(getMonorepoRoot(), 'data', '.demo_mode', 'active.json');
}

/** Points at the current live DB filename under data/ (avoids replacing locked files). */
export function getActiveDatabasePointerPath(): string {
  return path.join(getMonorepoRoot(), 'data', 'active-database.json');
}

export function getDbPauseLockPath(): string {
  return path.join(getMonorepoRoot(), 'data', '.demo_mode', 'db-pause.lock');
}

/** Pause locks older than this are treated as abandoned (crashed toggle). */
const DB_PAUSE_STALE_MS = 90_000;

/** Remove a pause lock left behind by a killed/crashed demo toggle. */
export function clearStaleDbPauseLock(maxAgeMs = DB_PAUSE_STALE_MS): boolean {
  const lockPath = getDbPauseLockPath();
  if (!fs.existsSync(lockPath)) return false;
  try {
    const raw = JSON.parse(fs.readFileSync(lockPath, 'utf8')) as { at?: string };
    const at = raw.at ? Date.parse(raw.at) : NaN;
    if (!Number.isFinite(at) || Date.now() - at > maxAgeMs) {
      fs.unlinkSync(lockPath);
      return true;
    }
  } catch {
    try {
      fs.unlinkSync(lockPath);
      return true;
    } catch {
      return false;
    }
  }
  return false;
}

export function isDbPauseRequested(): boolean {
  clearStaleDbPauseLock();
  return fs.existsSync(getDbPauseLockPath());
}

function readActiveDatabasePointer(): string | null {
  const pointerPath = getActiveDatabasePointerPath();
  if (!fs.existsSync(pointerPath)) return null;
  try {
    const raw = JSON.parse(fs.readFileSync(pointerPath, 'utf8')) as { fileName?: string };
    const fileName = raw.fileName?.trim();
    if (!fileName || fileName.includes('..') || fileName.includes('/') || fileName.includes('\\')) {
      return null;
    }
    const resolved = path.join(getMonorepoRoot(), 'data', fileName);
    if (!fs.existsSync(resolved)) return null;
    return resolved;
  } catch {
    return null;
  }
}

/** Switch live DB to a new file under data/ without deleting the previous (possibly locked) file. */
export function setActiveDatabaseFileName(fileName: string): string {
  const safe = fileName.trim();
  if (!safe || safe.includes('..') || safe.includes('/') || safe.includes('\\')) {
    throw new Error(`Invalid database file name: ${fileName}`);
  }
  const resolved = path.join(getMonorepoRoot(), 'data', safe);
  fs.writeFileSync(
    getActiveDatabasePointerPath(),
    JSON.stringify({ fileName: safe, updatedAt: new Date().toISOString() }, null, 2)
  );
  return resolved;
}

/** Path to the production/live SQLite database file. */
export function getLiveDatabasePath(): string {
  // Restore/recovery pointer wins over DATABASE_PATH so a corrupted default
  // file is not kept in use after active-database.json is updated.
  const pointed = readActiveDatabasePointer();
  if (pointed) return pointed;

  const configured = process.env.DATABASE_PATH?.trim();
  if (configured) {
    return path.isAbsolute(configured)
      ? configured
      : path.resolve(getMonorepoRoot(), configured);
  }
  return defaultDbPath;
}

/** Writable DB used while demo mode is active (live file stays untouched). */
export function getDemoWorkingPath(): string {
  return path.join(getMonorepoRoot(), 'data', '.demo_mode', 'working.db');
}

/**
 * Active DB path. While demo mode is active and a working copy exists, use that
 * so disabling demo never has to replace the live -shm file on Windows.
 * Legacy sessions (marker without working.db) still point at the live file.
 */
export function getDatabasePath(): string {
  if (fs.existsSync(demoMarkerPath())) {
    const working = getDemoWorkingPath();
    if (fs.existsSync(working)) return working;
    return getLiveDatabasePath();
  }
  return getLiveDatabasePath();
}

let sequelize: Sequelize | null = null;
let sequelizeBoundPath: string | null = null;
/** In-memory stand-in so Model.init can run while a file-replace pause is active. */
let modelInitSequelize: Sequelize | null = null;
let onSequelizeCreated: ((instance: Sequelize) => void) | null = null;
let onSequelizeClosed: (() => void) | null = null;
/** Blocks getSequelize from reopening the DB mid file-replace (race → EBUSY). */
let fileReplaceInProgress = false;

export function setSequelizeRecreateHook(fn: (instance: Sequelize) => void): void {
  onSequelizeCreated = fn;
}

export function setSequelizeClosedHook(fn: () => void): void {
  onSequelizeClosed = fn;
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
      max: 1,
      min: 0,
      acquire: 30000,
      idle: 10000,
    },
  });

  instance.addHook('afterConnect', async (connection: { exec: (sql: string) => Promise<void> }) => {
    await connection.exec('PRAGMA foreign_keys = ON;');
    await connection.exec('PRAGMA journal_mode = WAL;');
    await connection.exec('PRAGMA busy_timeout = 15000;');
  });

  onSequelizeCreated?.(instance);
  return instance;
}

/**
 * For Model.init only — never throws during a pause (Turbopack reloads import
 * models while db-pause.lock exists). Uses :memory: until the real DB reopens.
 */
export function getSequelizeForModelInit(): Sequelize {
  if (sequelize) return sequelize;
  if (fileReplaceInProgress || isDbPauseRequested()) {
    if (!modelInitSequelize) {
      modelInitSequelize = new Sequelize({
        dialect: 'sqlite',
        dialectModule: sqlite3,
        storage: ':memory:',
        logging: false,
      });
    }
    return modelInitSequelize;
  }
  return getSequelize();
}

/** Drop the in-process handle immediately so Windows can release -shm (best-effort async close). */
function dropSequelizeHandle(): void {
  if (!sequelize) return;
  const closing = sequelize;
  sequelize = null;
  sequelizeBoundPath = null;
  onSequelizeClosed?.();
  void closing.close().catch(() => {
    /* ignore */
  });
}

export async function closeConnection(): Promise<void> {
  if (!sequelize) {
    onSequelizeClosed?.();
    return;
  }
  const closing = sequelize;
  sequelize = null;
  sequelizeBoundPath = null;
  onSequelizeClosed?.();
  await closing.close();
}

/**
 * If a cross-process DB pause is active, release our handle.
 * Safe to call from any process (web scheduler, security worker, etc.).
 */
export async function releaseConnectionIfPaused(): Promise<boolean> {
  if (!isDbPauseRequested()) return false;
  await closeConnection();
  return true;
}

export function getSequelize(): Sequelize {
  // Release any open handle first — throwing alone left -shm locked in web/security.
  if (fileReplaceInProgress || isDbPauseRequested()) {
    dropSequelizeHandle();
    throw new Error('Database temporarily unavailable during demo mode switch. Retry shortly.');
  }

  const desiredPath = getDatabasePath();
  if (sequelize && sequelizeBoundPath && sequelizeBoundPath !== desiredPath) {
    dropSequelizeHandle();
  }

  if (!sequelize) {
    const marker = demoMarkerPath();
    if (fs.existsSync(marker)) {
      setDemoModeCache(true);
    }

    sequelize = createSequelizeInstance(desiredPath);
    sequelizeBoundPath = desiredPath;
  }
  return sequelize;
}

/** Connect only — never sync/alter; v2 reads the v1 schema as-is. */
export async function waitForDbAvailable(timeoutMs = 120_000): Promise<void> {
  const started = Date.now();
  while (isDbPauseRequested() || fileReplaceInProgress) {
    if (Date.now() - started > timeoutMs) {
      // Don't brick process startup on a stuck lock.
      clearDbPauseLock();
      fileReplaceInProgress = false;
      break;
    }
    await delay(500);
  }
}

export async function testConnection(): Promise<boolean> {
  await waitForDbAvailable();
  const db = getSequelize();
  await db.authenticate();
  await db.query('PRAGMA foreign_keys = ON;');
  await db.query('PRAGMA journal_mode = WAL;');
  await db.query('PRAGMA busy_timeout = 15000;');
  return true;
}

/**
 * Checkpoint WAL into the main DB, then close — required before replacing
 * database files on disk (demo sandbox). Blocks getSequelize until reopen.
 */
export async function closeConnectionForFileReplace(): Promise<void> {
  fileReplaceInProgress = true;
  if (!sequelize) {
    onSequelizeClosed?.();
    return;
  }
  try {
    await sequelize.query('PRAGMA wal_checkpoint(TRUNCATE);');
    await sequelize.query('PRAGMA journal_mode = DELETE;');
  } catch {
    // Best-effort: still close so callers can attempt file replace.
  }
  const closing = sequelize;
  sequelize = null;
  sequelizeBoundPath = null;
  onSequelizeClosed?.();
  await closing.close();
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

/**
 * Ask every DB consumer to release file handles. Web/security must call
 * releaseConnectionIfPaused() / poll isDbPauseRequested().
 */
export async function beginCrossProcessDbPause(targetDbPath: string, timeoutMs = 20000): Promise<void> {
  const lockPath = getDbPauseLockPath();
  fs.mkdirSync(path.dirname(lockPath), { recursive: true });
  fs.writeFileSync(
    lockPath,
    JSON.stringify({ pid: process.pid, at: new Date().toISOString(), targetDbPath }, null, 2)
  );

  await closeConnectionForFileReplace();
  // Give peer processes a moment to notice the lock and drop handles.
  await delay(750);
}

export function clearDbPauseLock(): void {
  const lockPath = getDbPauseLockPath();
  if (fs.existsSync(lockPath)) {
    try {
      fs.unlinkSync(lockPath);
    } catch {
      // ignore
    }
  }
}

/** Recreate Sequelize and rebind models after closeConnection() (e.g. demo sandbox toggle). */
export async function reopenConnection(): Promise<Sequelize> {
  try {
    clearDbPauseLock();
    fileReplaceInProgress = false;
    if (modelInitSequelize) {
      const boot = modelInitSequelize;
      modelInitSequelize = null;
      void boot.close().catch(() => undefined);
    }
    if (sequelize) {
      await closeConnection();
    }
    const db = getSequelize();
    await db.authenticate();
    await db.query('PRAGMA foreign_keys = ON;');
    await db.query('PRAGMA journal_mode = WAL;');
    await db.query('PRAGMA busy_timeout = 15000;');
    return db;
  } catch (err) {
    clearDbPauseLock();
    fileReplaceInProgress = false;
    throw err;
  }
}
