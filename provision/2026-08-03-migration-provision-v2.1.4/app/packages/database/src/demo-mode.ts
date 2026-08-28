import { AsyncLocalStorage } from 'async_hooks';
import { isDemoSandboxActive } from './demo-sandbox';

const demoModeBypass = new AsyncLocalStorage<boolean>();

let demoModeCache: boolean | null = null;

export function runWithDemoModeBypass<T>(fn: () => T | Promise<T>): T | Promise<T> {
  return demoModeBypass.run(true, fn);
}

export function isDemoModeBypassActive(): boolean {
  return demoModeBypass.getStore() === true;
}

export function isDemoModeActive(): boolean {
  if (process.env.DEMO_MODE === 'true') return true;
  if (isDemoSandboxActive()) return true;
  return demoModeCache === true;
}

export function setDemoModeCache(value: boolean): void {
  demoModeCache = value;
}

export function getDemoModeCache(): boolean | null {
  return demoModeCache;
}
