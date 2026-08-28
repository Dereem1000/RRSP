import type archiver from 'archiver';
import fs from 'fs';
import path from 'path';

const SYSTEM_DATA_EXCLUDE = new Set(['backups', 'restore-temp', 'file-repair-snapshots']);

const SYSTEM_REPO_DIRS = ['apps', 'packages', 'scripts', 'docs', 'license_activation_system_new'];

const SYSTEM_ROOT_FILES = [
  'package.json',
  'package-lock.json',
  'start.bat',
  'stop.bat',
  '.env',
  '.env.local',
];

export function getSystemArchiveIgnorePatterns(): string[] {
  return [
    '**/node_modules/**',
    '**/.git/**',
    '**/.next/**',
    '**/dist/**',
    '**/.cursor/**',
    '**/coverage/**',
    '**/__pycache__/**',
    '**/*.pyc',
  ];
}

export function appendSystemDataArchive(archive: archiver.Archiver, repoRoot: string): void {
  const dataDir = path.join(repoRoot, 'data');
  if (!fs.existsSync(dataDir)) return;

  for (const ent of fs.readdirSync(dataDir, { withFileTypes: true })) {
    if (SYSTEM_DATA_EXCLUDE.has(ent.name)) continue;
    const abs = path.join(dataDir, ent.name);
    const zipName = `data/${ent.name}`;
    if (ent.isDirectory()) {
      archive.directory(abs, zipName);
    } else {
      archive.file(abs, { name: zipName });
    }
  }
}

export function appendSystemRepoArchive(archive: archiver.Archiver, repoRoot: string): void {
  const ignore = getSystemArchiveIgnorePatterns();
  for (const dir of SYSTEM_REPO_DIRS) {
    const abs = path.join(repoRoot, dir);
    if (fs.existsSync(abs)) {
      archive.glob('**/*', { cwd: abs, ignore, dot: true }, { prefix: `repo/${dir}` });
    }
  }
  for (const file of SYSTEM_ROOT_FILES) {
    const abs = path.join(repoRoot, file);
    if (fs.existsSync(abs)) {
      archive.file(abs, { name: `repo/${file}` });
    }
  }
}
