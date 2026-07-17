#!/usr/bin/env node
/**
 * Block until the Express API health endpoint responds, then run the given command.
 * Used so Next.js does not accept traffic before /api/* can be proxied.
 */
import { spawn } from 'child_process';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(repoRoot, '.env') });

const apiOrigin = (process.env.CD_API_ORIGIN || 'http://127.0.0.1:4000').replace(/\/$/, '');
const healthUrl = `${apiOrigin}/api/health/live`;
const maxWaitMs = Number(process.env.CD_API_WAIT_MS || 360_000);
const pollMs = Number(process.env.CD_API_WAIT_POLL_MS || 2_000);

async function waitForApi() {
  const started = Date.now();
  let lastError = 'starting';

  while (Date.now() - started < maxWaitMs) {
    try {
      const response = await fetch(healthUrl, { signal: AbortSignal.timeout(15_000) });
      if (response.ok) {
        console.log(`[wait-for-api] Express API ready at ${healthUrl}`);
        return;
      }
      lastError = `HTTP ${response.status}`;
    } catch (error) {
      lastError = error instanceof Error ? error.message : String(error);
    }

    const elapsed = Math.round((Date.now() - started) / 1000);
    console.log(`[wait-for-api] Waiting for Express API (${elapsed}s) — ${lastError}`);
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }

  console.error(`[wait-for-api] Timed out after ${Math.round(maxWaitMs / 1000)}s waiting for ${healthUrl}`);
  process.exit(1);
}

const args = process.argv.slice(2);
if (args.length === 0) {
  console.error('Usage: node scripts/wait-for-api.mjs <command> [args...]');
  process.exit(1);
}

await waitForApi();

const [command, ...commandArgs] = args;
const child = spawn(command, commandArgs, {
  cwd: repoRoot,
  env: process.env,
  stdio: 'inherit',
  shell: process.platform === 'win32',
});

child.on('exit', (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 0);
});

child.on('error', (error) => {
  console.error('[wait-for-api] Failed to start portal command:', error);
  process.exit(1);
});
