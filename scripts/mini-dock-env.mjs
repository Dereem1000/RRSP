#!/usr/bin/env node
/**
 * Reads data/mini-dock.json and prints batch-friendly lines for start.bat:
 *   MINI_DOCKED=1
 *   MINI_INSTALL_PATH=E:\Mini 2026
 *   MINI_PORT=8876
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const dockPath = path.join(root, 'data', 'mini-dock.json');

function emit(key, value) {
  process.stdout.write(`${key}=${value}\n`);
}

if (!fs.existsSync(dockPath)) {
  emit('MINI_DOCKED', '0');
  process.exit(0);
}

try {
  const config = JSON.parse(fs.readFileSync(dockPath, 'utf8'));
  const docked = config.docked && config.startWithCd !== false;
  emit('MINI_DOCKED', docked ? '1' : '0');
  emit('MINI_INSTALL_PATH', config.installPath || '');
  emit('MINI_PORT', String(config.port || 8876));
} catch {
  emit('MINI_DOCKED', '0');
}
