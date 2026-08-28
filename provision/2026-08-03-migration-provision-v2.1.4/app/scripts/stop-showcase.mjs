#!/usr/bin/env node
/**
 * Stop showcase web on ports 3001–3010 (Next.js started via start-showcase-web.mjs).
 */
import { execSync, spawnSync } from 'child_process';
import { isShowcaseOnPort } from './pick-showcase-port.mjs';

function findListenerPid(port) {
  if (process.platform === 'win32') {
    try {
      const out = execSync(`netstat -ano -p tcp | findstr :${port}`, { encoding: 'utf8' });
      for (const line of out.split('\n')) {
        if (!/LISTENING/i.test(line)) continue;
        const parts = line.trim().split(/\s+/);
        const pid = Number(parts[parts.length - 1]);
        if (pid > 0) return pid;
      }
    } catch {
      return null;
    }
    return null;
  }

  try {
    const out = execSync(`lsof -ti tcp:${port} -sTCP:LISTEN`, { encoding: 'utf8' }).trim();
    const pid = Number(out.split('\n')[0]);
    return pid > 0 ? pid : null;
  } catch {
    return null;
  }
}

function killProcessTree(pid) {
  if (!pid || pid <= 0) return false;
  if (process.platform === 'win32') {
    const result = spawnSync('taskkill', ['/PID', String(pid), '/T', '/F'], {
      stdio: 'ignore',
      shell: true,
    });
    return result.status === 0;
  }
  try {
    process.kill(pid, 'SIGTERM');
    return true;
  } catch {
    return false;
  }
}

async function main() {
  let stopped = 0;

  for (let port = 3001; port <= 3010; port += 1) {
    if (!(await isShowcaseOnPort(port))) continue;

    const pid = findListenerPid(port);
    if (!pid) {
      console.warn(`Showcase detected on :${port} but could not find listener PID.`);
      continue;
    }

    console.log(`Stopping showcase on :${port} (PID ${pid})...`);
    if (killProcessTree(pid)) {
      stopped += 1;
      console.log(`Stopped showcase on :${port}.`);
    } else {
      console.warn(`Failed to stop showcase on :${port} (PID ${pid}).`);
    }
  }

  if (!stopped) {
    console.log('No showcase instance found on ports 3001–3010.');
  }
}

main().catch((err) => {
  console.error(err instanceof Error ? err.message : err);
  process.exit(1);
});
