import { isDbPauseRequested, releaseConnectionIfPaused } from '@cd-v2/database';

const globalKey = '__cd_devToolboxHealthScheduler';

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

function isDemoPauseError(error: unknown): boolean {
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('temporarily unavailable during demo mode switch');
}

async function tick() {
  const state = getState();
  if (state.running) return;
  if (isDbPauseRequested()) {
    await releaseConnectionIfPaused();
    return;
  }
  state.running = true;
  try {
    const { loadSlots } = await import('@/lib/developer-toolbox/store');
    const { runHealthChecks } = await import('@/lib/developer-toolbox/health');
    const slots = await loadSlots();
    if (isDbPauseRequested()) return;
    const hasActive = slots.some((s) => s.enabled && s.host.trim());
    if (!hasActive) return;
    await runHealthChecks(slots);
  } catch (error) {
    if (isDemoPauseError(error)) return;
    console.error('[DEV TOOLBOX HEALTH]', error);
  } finally {
    state.running = false;
  }
}

export function startDeveloperToolboxHealthScheduler() {
  const state = getState();
  // Allow HMR to replace an older tick that still logged pause errors.
  if (state.timer) {
    clearInterval(state.timer);
    state.timer = null;
  }

  const intervalMs = 60_000;
  state.timer = setInterval(() => {
    void tick();
  }, intervalMs);

  setTimeout(() => void tick(), 15_000);
  console.log(`[DEV TOOLBOX HEALTH] Scheduled every ${intervalMs / 1000}s`);
}
