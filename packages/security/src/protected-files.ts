import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { getMonorepoRoot, getProtectedFilePaths } from '@cd-v2/database';

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
 * 2.1.1 — shared catalog with backup app/ paths (+ file-repair, http-guard).
 */
export const PROTECTED_FILES_VERSION = '2.1.1';

export { getProtectedFilePaths } from '@cd-v2/database';

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
