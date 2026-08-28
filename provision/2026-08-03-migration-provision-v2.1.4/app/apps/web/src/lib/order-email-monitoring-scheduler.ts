import { getEmailMonitoringConfig } from '@/lib/order-email-monitoring';
import { runEmailMonitoringCheckWithNotifications } from '@/lib/order-email-monitoring-run';
import {
  isDbPauseRequested,
  releaseConnectionIfPaused,
  reopenConnection,
} from '@cd-v2/database';

const globalKey = '__cd_orderEmailMonitorScheduler';

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null;
  pausePoll: ReturnType<typeof setInterval> | null;
  running: boolean;
  dbPaused: boolean;
};

function getState(): SchedulerState {
  const g = globalThis as typeof globalThis & { [globalKey]?: SchedulerState };
  if (!g[globalKey]) {
    g[globalKey] = { timer: null, pausePoll: null, running: false, dbPaused: false };
  }
  return g[globalKey]!;
}

async function syncWebDbPauseState(): Promise<void> {
  const state = getState();
  if (isDbPauseRequested()) {
    await releaseConnectionIfPaused();
    state.dbPaused = true;
    return;
  }
  if (state.dbPaused) {
    await reopenConnection();
    state.dbPaused = false;
  }
}

async function tick() {
  const state = getState();
  if (state.running) return;
  await syncWebDbPauseState();
  if (state.dbPaused || isDbPauseRequested()) return;

  state.running = true;
  try {
    const config = await getEmailMonitoringConfig();
    if (!config.enabled) return;
    await runEmailMonitoringCheckWithNotifications();
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('temporarily unavailable during demo mode switch')) return;
    console.error('[ORDER EMAIL MONITOR]', error);
  } finally {
    state.running = false;
  }
}

async function reschedule() {
  const state = getState();
  const config = await getEmailMonitoringConfig();
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }
  if (!config.enabled) return;

  const intervalMs = Math.max(60_000, Number(config.checkInterval) || 300_000);
  state.timer = setInterval(() => {
    void tick();
  }, intervalMs);
  console.log(`[ORDER EMAIL MONITOR] Scheduled every ${Math.round(intervalMs / 1000)}s`);
}

export function startOrderEmailMonitoringScheduler() {
  const g = globalThis as typeof globalThis & { __cd_orderEmailMonitorStarted?: boolean };
  if (g.__cd_orderEmailMonitorStarted) return;
  g.__cd_orderEmailMonitorStarted = true;

  const state = getState();
  if (!state.pausePoll) {
    state.pausePoll = setInterval(() => {
      void syncWebDbPauseState().catch((err) =>
        console.error('[ORDER EMAIL MONITOR] pause sync error', err)
      );
    }, 1000);
  }

  void reschedule().then(() => tick());
}

export function refreshOrderEmailMonitoringScheduler() {
  void reschedule();
}
