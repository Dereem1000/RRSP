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

async function tick() {
  const state = getState();
  if (state.running) return;
  state.running = true;
  try {
    const { loadSlots } = await import('@/lib/developer-toolbox/store');
    const { runHealthChecks } = await import('@/lib/developer-toolbox/health');
    const slots = await loadSlots();
    const hasActive = slots.some((s) => s.enabled && s.host.trim());
    if (!hasActive) return;
    await runHealthChecks(slots);
  } catch (error) {
    console.error('[DEV TOOLBOX HEALTH]', error);
  } finally {
    state.running = false;
  }
}

export function startDeveloperToolboxHealthScheduler() {
  const state = getState();
  if (state.timer) return;

  const intervalMs = 60_000;
  state.timer = setInterval(() => {
    void tick();
  }, intervalMs);

  setTimeout(() => void tick(), 15_000);
  console.log(`[DEV TOOLBOX HEALTH] Scheduled every ${intervalMs / 1000}s`);
}
