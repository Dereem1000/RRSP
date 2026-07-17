import { getEmailMonitoringConfig } from '@/lib/order-email-monitoring';
import { runEmailMonitoringCheckWithNotifications } from '@/lib/order-email-monitoring-run';

const globalKey = '__cd_orderEmailMonitorScheduler';

type SchedulerState = {
  timer: ReturnType<typeof setInterval> | null;
  running: boolean;
};

function getState(): SchedulerState {
  const g = globalThis as typeof globalThis & { [globalKey]?: SchedulerState };
  if (!g[globalKey]) {
    g[globalKey] = { timer: null, running: false };
  }
  return g[globalKey]!;
}

async function tick() {
  const state = getState();
  if (state.running) return;
  state.running = true;
  try {
    const config = await getEmailMonitoringConfig();
    if (!config.enabled) return;
    await runEmailMonitoringCheckWithNotifications();
  } catch (error) {
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

  void reschedule().then(() => tick());
}

export function refreshOrderEmailMonitoringScheduler() {
  void reschedule();
}
