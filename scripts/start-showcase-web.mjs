#!/usr/bin/env node
/**
 * Showcase portal only — Next.js on a free port (default 3001).
 * Does NOT start license API or security worker (main start.bat already runs those).
 */
import fs from 'fs';
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import { pickShowcasePort } from './pick-showcase-port.mjs';

const scriptRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/** Prefer sibling showcase copy when started from the main v2 folder. */
function resolveShowcaseRoot() {
  const sibling = path.resolve(scriptRoot, '..', 'Computer Dynamics System v2 - Showcase');
  const siblingDb = path.join(sibling, 'data', 'computer_dynamics.db');
  const localDb = path.join(scriptRoot, 'data', 'computer_dynamics.db');

  if (scriptRoot !== sibling && fs.existsSync(siblingDb)) {
    return { root: sibling, dbPath: siblingDb };
  }
  if (fs.existsSync(localDb)) {
    return { root: scriptRoot, dbPath: localDb };
  }
  return { root: scriptRoot, dbPath: localDb };
}

async function registerDock(port, showcaseRoot) {
  process.env.SHOWCASE_PORT = String(port);
  process.env.CD_V2_ROOT = showcaseRoot;
  const script = path.join(showcaseRoot, 'scripts', 'register-showcase-dock.mjs');
  if (!fs.existsSync(script)) {
    console.warn('Skipping dock registration — register-showcase-dock.mjs not found');
    return;
  }
  const code = await runNodeScript(script, showcaseRoot);
  if (code !== 0) process.exit(code ?? 1);
}

function runNodeScript(scriptPath, showcaseRoot) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [scriptPath], {
      cwd: showcaseRoot,
      env: { ...process.env, CD_V2_ROOT: showcaseRoot },
      stdio: 'inherit',
      shell: false,
    });
    child.on('close', (code) => resolve(code ?? 0));
  });
}

/** @type {import('child_process').ChildProcess | null} */
let webChild = null;
let shuttingDown = false;

function hasProductionBuild(showcaseRoot) {
  return fs.existsSync(path.join(showcaseRoot, 'apps', 'web', '.next', 'BUILD_ID'));
}

function killProcessTree(pid) {
  if (!pid || pid <= 0) return;
  if (process.platform === 'win32') {
    spawn('taskkill', ['/PID', String(pid), '/T', '/F'], { stdio: 'ignore', shell: true });
    return;
  }
  try {
    process.kill(-pid, 'SIGTERM');
  } catch {
    try {
      process.kill(pid, 'SIGTERM');
    } catch {
      /* already exited */
    }
  }
}

function shutdown() {
  if (shuttingDown) return;
  shuttingDown = true;
  if (webChild?.pid) {
    console.log('\nStopping showcase...');
    killProcessTree(webChild.pid);
  }
  setTimeout(() => process.exit(0), 500);
}

function resolveNpmCli(showcaseRoot) {
  const candidates = [
    path.join(showcaseRoot, 'node_modules', 'npm', 'bin', 'npm-cli.js'),
    path.join(path.dirname(process.execPath), 'node_modules', 'npm', 'bin', 'npm-cli.js'),
  ];
  for (const candidate of candidates) {
    if (fs.existsSync(candidate)) return candidate;
  }
  throw new Error(
    'npm-cli.js not found. Install Node.js npm or run: npm install npm -w @cd-v2/web'
  );
}

function runShowcaseWeb(port, showcaseRoot, dbPath) {
  const production = hasProductionBuild(showcaseRoot);
  const script = production ? 'start:showcase' : 'dev:showcase';
  const npmCli = resolveNpmCli(showcaseRoot);

  if (!production) {
    console.warn('No production build found — running dev mode (slower, may show compile errors).');
    console.warn('Run: npm run build');
  } else {
    console.log('Using production build (.next).');
  }

  console.log('Press Ctrl+C here to stop showcase (or run stop-showcase.bat).');

  webChild = spawn(process.execPath, [npmCli, 'run', script, '-w', '@cd-v2/web'], {
    cwd: showcaseRoot,
    env: {
      ...process.env,
      CD_V2_ROOT: showcaseRoot,
      DATABASE_PATH: dbPath,
      LICENSE_DB_PATH: path.join(
        showcaseRoot,
        'license_activation_system_new/instance/license_system.db'
      ),
      PORT: String(port),
      DEMO_MODE: 'true',
      SHOWCASE_PORT: String(port),
    },
    stdio: 'inherit',
    shell: false,
  });

  webChild.on('close', (code) => {
    if (!shuttingDown) process.exit(code ?? 0);
  });
}

process.on('SIGINT', shutdown);
process.on('SIGTERM', shutdown);
if (process.platform === 'win32') {
  process.on('SIGHUP', shutdown);
}

async function main() {
  const { root: showcaseRoot, dbPath } = resolveShowcaseRoot();

  if (!fs.existsSync(dbPath)) {
    console.error('Showcase database not found:', dbPath);
    console.error('Run create-showcase-copy.bat first, then:');
    console.error('  node scripts/init-showcase-database.mjs data/computer_dynamics.db');
    process.exit(1);
  }

  const forced = process.env.SHOWCASE_PORT?.trim();
  let port;
  let alreadyRunning = false;

  if (forced) {
    const n = Number(forced);
    const picked = await pickShowcasePort(n, n);
    port = picked.port;
    alreadyRunning = picked.alreadyRunning;
  } else {
    const picked = await pickShowcasePort();
    port = picked.port;
    alreadyRunning = picked.alreadyRunning;
  }

  if (alreadyRunning) {
    console.log(`Showcase already running on http://127.0.0.1:${port}`);
    console.log('Stop the old window and restart if login uses the wrong database.');
    process.exit(0);
  }

  if (port !== 3001) {
    console.warn(
      `Port 3001 is in use — starting showcase on ${port}.`,
      'Point cloudflared demo ingress at this port if needed.'
    );
  }

  await registerDock(port, showcaseRoot);

  console.log(`Showcase root: ${showcaseRoot}`);
  console.log(`Database:    ${dbPath}`);
  console.log(`URL:         http://127.0.0.1:${port}`);
  console.log('Login:       demo / Demo@2026!');
  console.log('(Uses the main portal license API :5001 and security worker — start.bat must be running)');

  runShowcaseWeb(port, showcaseRoot, dbPath);
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
