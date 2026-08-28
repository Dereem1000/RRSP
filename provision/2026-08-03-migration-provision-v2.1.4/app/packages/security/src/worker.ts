import {
  testConnection,
  closeConnection,
  isDbPauseRequested,
  reopenConnection,
  releaseConnectionIfPaused,
  waitForDbAvailable,
} from '@cd-v2/database';
import {
  DEFAULT_MONITOR_INTERVAL_MS,
  SECURITY_WORKER_VERSION,
  SecurityConfigKeys,
} from './config-keys';
import { SystemConfig } from '@cd-v2/database';
import { runMonitorCycle, ensureFileBaselines } from './monitoring';

export type SecurityWorkerOptions = {
  intervalMs?: number;
  runOnce?: boolean;
};

let timer: ReturnType<typeof setInterval> | null = null;
let pausePoll: ReturnType<typeof setInterval> | null = null;
let shuttingDown = false;
let dbPaused = false;

async function applyDbPauseState(): Promise<void> {
  if (isDbPauseRequested()) {
    if (!dbPaused) {
      await releaseConnectionIfPaused();
      await closeConnection();
      dbPaused = true;
      console.log('[cd-security] DB paused for demo/file replace');
    } else {
      await releaseConnectionIfPaused();
    }
    return;
  }
  if (dbPaused) {
    await reopenConnection();
    dbPaused = false;
    console.log('[cd-security] DB resumed after demo/file replace');
  }
}

export async function startSecurityWorker(options: SecurityWorkerOptions = {}) {
  // Don't die on a leftover db-pause.lock from a crashed demo toggle.
  await waitForDbAvailable();
  await testConnection();

  const intervalMs =
    options.intervalMs ??
    (await SystemConfig.getConfig<number>(
      SecurityConfigKeys.monitoringIntervalMs,
      DEFAULT_MONITOR_INTERVAL_MS
    )) ??
    DEFAULT_MONITOR_INTERVAL_MS;

  await SystemConfig.setConfig(
    SecurityConfigKeys.monitoringIntervalMs,
    intervalMs,
    'number',
    'security'
  );

  console.log(
    `[cd-security] Worker v${SECURITY_WORKER_VERSION} starting (interval ${intervalMs}ms)`
  );

  await ensureFileBaselines();

  const tick = async () => {
    if (shuttingDown) return;
    await applyDbPauseState();
    if (dbPaused || isDbPauseRequested()) return;
    await runMonitorCycle();
  };

  await tick();

  if (options.runOnce) {
    console.log('[cd-security] Single cycle complete');
    return;
  }

  pausePoll = setInterval(() => {
    applyDbPauseState().catch((err) => console.error('[cd-security] pause poll error', err));
  }, 1000);

  timer = setInterval(() => {
    tick().catch((err) => console.error('[cd-security] tick error', err));
  }, intervalMs);

  const shutdown = async () => {
    if (shuttingDown) return;
    shuttingDown = true;
    if (timer) clearInterval(timer);
    if (pausePoll) clearInterval(pausePoll);
    console.log('[cd-security] Worker stopped');
    process.exit(0);
  };

  process.on('SIGINT', shutdown);
  process.on('SIGTERM', shutdown);
}

export function stopSecurityWorker() {
  shuttingDown = true;
  if (timer) clearInterval(timer);
  if (pausePoll) clearInterval(pausePoll);
}
