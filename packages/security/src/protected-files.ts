import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMonorepoRoot } from '@cd-v2/database';
import { getLicenseProtectedFilePaths } from './license-paths';

export type FileBaseline = {
  hash: string;
  size: number;
  mtimeMs: number;
};

export type IntegrityResult =
  | { ok: true }
  | { ok: false; relativePath: string; reason: string; details?: Record<string, unknown> };

/**
 * Bump when the protected path list changes so the worker rebaselines on next cycle.
 * 2.0.2 — licensing stack (Flask API, proxy, license monitor modules).
 */
export const PROTECTED_FILES_VERSION = '2.0.2';

/** Critical paths relative to monorepo root. */
export function getProtectedFilePaths(): string[] {
  return [
    // Monorepo / ops
    'package.json',
    'start.bat',
    'stop.bat',

    // Database layer
    'packages/database/src/connection.ts',
    'packages/database/src/models/User.ts',
    'packages/database/src/models/SystemConfig.ts',
    'packages/database/src/models/EmergencyOverride.ts',
    'packages/database/src/models/SecurityEvent.ts',

    // Security package (worker + domain logic)
    'packages/security/package.json',
    'packages/security/src/worker.ts',
    'packages/security/src/worker-cli.ts',
    'packages/security/src/monitoring.ts',
    'packages/security/src/emergency.ts',
    'packages/security/src/auth.ts',
    'packages/security/src/events.ts',
    'packages/security/src/protected-files.ts',
    'packages/security/src/activity-monitor.ts',
    'packages/security/src/intrusion-scan.ts',
    'packages/security/src/features.ts',
    'packages/security/src/sequelize-time.ts',

    // Portal auth + middleware
    'apps/web/src/lib/auth.ts',
    'apps/web/src/lib/jwt.ts',
    'apps/web/src/middleware.ts',

    // Security API surface
    'apps/web/src/app/api/security/platform-status/route.ts',
    'apps/web/src/app/api/security/toggle/route.ts',
    'apps/web/src/app/api/security/emergency-override/route.ts',
    'apps/web/src/app/api/security/emergency-override/disable/route.ts',
    'apps/web/src/app/api/security/emergency-status/route.ts',
    'apps/web/src/app/api/security/auth-code/route.ts',
    'apps/web/src/app/api/security/file-integrity/route.ts',
    'apps/web/src/app/api/security/events/route.ts',
    'apps/web/src/app/api/emergency/overrides/route.ts',

    // Licensing
    ...getLicenseProtectedFilePaths(),
  ];
}

/** Paths that exist on disk from the current list. */
export function getExistingProtectedPaths(): string[] {
  return getProtectedFilePaths().filter((rel) => fs.existsSync(resolveProtectedPath(rel)));
}

export function resolveProtectedPath(relativePath: string): string {
  return path.join(getMonorepoRoot(), relativePath);
}

export function hashFileContent(content: string): string {
  return crypto.createHash('sha256').update(content).digest('hex');
}

export function snapshotFile(relativePath: string): FileBaseline | null {
  const fullPath = resolveProtectedPath(relativePath);
  if (!fs.existsSync(fullPath)) return null;
  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  return {
    hash: hashFileContent(content),
    size: stat.size,
    mtimeMs: stat.mtimeMs,
  };
}

export function snapshotAllProtectedFiles(): Record<string, FileBaseline> {
  const baselines: Record<string, FileBaseline> = {};
  for (const rel of getProtectedFilePaths()) {
    const snap = snapshotFile(rel);
    if (snap) baselines[rel] = snap;
  }
  return baselines;
}

export function checkFileIntegrity(
  relativePath: string,
  baseline: FileBaseline
): IntegrityResult {
  const fullPath = resolveProtectedPath(relativePath);
  if (!fs.existsSync(fullPath)) {
    return {
      ok: false,
      relativePath,
      reason: 'file_missing',
    };
  }

  const stat = fs.statSync(fullPath);
  const content = fs.readFileSync(fullPath, 'utf8');
  const hash = hashFileContent(content);

  if (hash !== baseline.hash) {
    return {
      ok: false,
      relativePath,
      reason: 'hash_mismatch',
      details: { expectedHash: baseline.hash, currentHash: hash },
    };
  }

  if (stat.size !== baseline.size) {
    return {
      ok: false,
      relativePath,
      reason: 'size_mismatch',
      details: { expectedSize: baseline.size, currentSize: stat.size },
    };
  }

  return { ok: true };
}
