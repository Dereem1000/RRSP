#!/usr/bin/env node
/**
 * Mini dock security checks for production preflight.
 * When Mini is docked, MINI_API_TOKEN + MINI_PUBLIC_MODE must be set on Mini's install.
 */
import fs from 'node:fs';
import path from 'node:path';

/**
 * @param {string} root - CD v2 monorepo root
 * @param {{ fail: (msg: string) => void, warn: (msg: string) => void, isTracked?: (rel: string) => boolean }} hooks
 */
export function checkMiniDockSecurity(root, { fail, warn, isTracked = () => false }) {
  const dockPath = path.join(root, 'data', 'mini-dock.json');
  if (!fs.existsSync(dockPath)) {
    return { docked: false };
  }

  if (isTracked('data/mini-dock.json')) {
    fail('data/mini-dock.json is tracked in git — it contains the Mini API token and must stay local-only.');
  }

  let config;
  try {
    config = JSON.parse(fs.readFileSync(dockPath, 'utf8'));
  } catch {
    fail('data/mini-dock.json is invalid JSON — re-save Mini settings in the portal.');
    return { docked: false };
  }

  if (!config.docked) {
    return { docked: false };
  }

  const installPath = String(config.installPath || '').trim();
  const port = Number(config.port) || 8876;
  const publicUrl = String(config.publicUrl || '').trim();
  const dockToken = String(config.apiToken || '').trim();

  if (!installPath) {
    fail('Mini is docked but installPath is missing in data/mini-dock.json.');
    return { docked: true };
  }

  if (!fs.existsSync(path.join(installPath, 'dashboard.py'))) {
    fail(`Mini is docked but dashboard.py was not found at ${installPath}`);
  }

  if (!fs.existsSync(path.join(installPath, 'start_mini_headless.bat'))) {
    fail(`Mini is docked but start_mini_headless.bat was not found at ${installPath}`);
  }

  if (!dockToken || dockToken.length < 32) {
    fail('Mini is docked but mini-dock.json has no valid apiToken — open Settings → Integrations → Mini and Save again.');
  }

  const miniEnvPath = path.join(installPath, 'runtime', 'local.env');
  if (!fs.existsSync(miniEnvPath)) {
    fail(
      `Mini is docked but ${miniEnvPath} is missing — Save Mini dock settings to write MINI_API_TOKEN and MINI_PUBLIC_MODE.`
    );
    return { docked: true };
  }

  const miniEnv = parseEnvFile(miniEnvPath);
  const miniToken = String(miniEnv.MINI_API_TOKEN || '').trim();
  const publicMode = String(miniEnv.MINI_PUBLIC_MODE || '').trim().toLowerCase();

  if (!miniToken || miniToken.length < 32) {
    fail('Mini runtime/local.env is missing MINI_API_TOKEN (32+ chars) — required before public exposure.');
  } else if (looksPlaceholder(miniToken)) {
    fail('Mini MINI_API_TOKEN looks like a placeholder — regenerate in Settings → Integrations → Mini.');
  }

  if (!['1', 'true', 'yes', 'on'].includes(publicMode)) {
    fail('Mini runtime/local.env must set MINI_PUBLIC_MODE=1 when docked for production / Cloudflare.');
  }

  if (dockToken && miniToken && dockToken !== miniToken) {
    fail('Mini API token mismatch — data/mini-dock.json and Mini runtime/local.env differ. Re-save Mini dock settings.');
  }

  if (config.startWithCd === false) {
    warn('Mini is docked but startWithCd is false — start-production.bat will not auto-start Mini unless you enable it in Settings.');
  }

  const tunnelConfigPath = path.join(root, 'cloudflared-computerdynamics.yml');
  if (fs.existsSync(tunnelConfigPath)) {
    const tunnelText = fs.readFileSync(tunnelConfigPath, 'utf8');
    if (!/mini\.computerdynamicstt\.com/i.test(tunnelText)) {
      fail('cloudflared-computerdynamics.yml is missing mini.computerdynamicstt.com ingress → :8876.');
    } else if (!/:8876/.test(tunnelText)) {
      warn('cloudflared config mentions mini hostname but verify service points to http://127.0.0.1:8876.');
    }
  } else {
    warn('cloudflared-computerdynamics.yml not found — add mini.computerdynamicstt.com route when using Cloudflare tunnel.');
  }

  if (publicUrl && !/^https:\/\//i.test(publicUrl)) {
    warn(`Mini publicUrl should be HTTPS for production (got ${publicUrl}).`);
  }

  if (publicUrl && !publicUrl.includes('mini.')) {
    warn(`Mini publicUrl (${publicUrl}) does not look like the mini subdomain — external systems may use the wrong host.`);
  }

  return { docked: true, installPath, port, publicUrl };
}

function parseEnvFile(envPath) {
  const env = {};
  for (const line of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq === -1) continue;
    const key = trimmed.slice(0, eq).trim();
    let value = trimmed.slice(eq + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    env[key] = value;
  }
  return env;
}

function looksPlaceholder(value) {
  const v = String(value ?? '').trim();
  if (!v) return true;
  return /^(changeme|secret|your-|placeholder|test)$/i.test(v) || v.length < 32;
}
