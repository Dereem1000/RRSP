#!/usr/bin/env node
import { checkMiniDockSecurity } from '../../mini-preflight.mjs';
import {
  WEAK_JWT,
  looksPlaceholder,
  loadEnvFile,
  readText,
  fileExists,
  isTracked,
} from '../lib/utils.mjs';

const TRACKED_SENSITIVE = [
  '.env',
  'cloudflared-computerdynamics.yml',
  'data/mini-dock.json',
  'scripts/tmp-login.json',
  'Management Systems/POS System/POS-2026-05-27-Demo/server/sessions/.session_secret',
];

export async function runSecretsChecks(ctx) {
  const checkId = 'secrets';
  const { root } = ctx;
  let issues = 0;

  const hooks = {
    fail: (msg) => {
      issues += 1;
      ctx.finding({
        severity: 'critical',
        category: 'secrets',
        title: 'Sensitive file or secret exposure',
        description: msg,
        remediation:
          'Remove the file from git history if committed, add to .gitignore, and rotate any exposed secrets.',
        evidence: msg,
        checkId: `${checkId}-tracked`,
      });
    },
    warn: (msg) => {
      issues += 1;
      ctx.finding({
        severity: 'medium',
        category: 'secrets',
        title: 'Secret configuration warning',
        description: msg,
        remediation: 'Review the flagged configuration and move secrets to secure local-only storage.',
        evidence: msg,
        checkId: `${checkId}-warn`,
      });
    },
    isTracked: (rel) => isTracked(root, rel),
  };

  for (const rel of TRACKED_SENSITIVE) {
    if (isTracked(root, rel)) {
      hooks.fail(`Tracked in git (must be local-only): ${rel}`);
    }
  }

  checkMiniDockSecurity(root, hooks);

  const { exists, env } = loadEnvFile(root);
  if (!exists) {
    ctx.finding({
      severity: 'critical',
      category: 'secrets',
      title: '.env file missing',
      description: 'No .env file found at the project root.',
      remediation: 'Copy .env.example to .env and configure production secrets before deploy.',
      checkId: `${checkId}-env-missing`,
    });
    issues += 1;
  } else {
    const jwt = env.JWT_SECRET?.trim() ?? '';
    if (!jwt || WEAK_JWT.has(jwt)) {
      ctx.finding({
        severity: 'critical',
        category: 'secrets',
        title: 'Weak or default JWT_SECRET',
        description: 'JWT_SECRET is missing or uses a known development default.',
        remediation:
          'Generate a random 32+ character secret: node -e "console.log(require(\'crypto\').randomBytes(48).toString(\'hex\'))"',
        checkId: `${checkId}-jwt-weak`,
      });
      issues += 1;
    } else if (jwt.length < 32) {
      ctx.finding({
        severity: 'high',
        category: 'secrets',
        title: 'JWT_SECRET too short',
        description: `JWT_SECRET is ${jwt.length} characters; minimum recommended is 32.`,
        remediation: 'Regenerate JWT_SECRET with at least 32 random characters.',
        checkId: `${checkId}-jwt-length`,
      });
      issues += 1;
    }

    if (env.EMERGENCY_AUTH_CODE?.trim() && env.EMERGENCY_AUTH_CODE.trim().length < 16) {
      ctx.finding({
        severity: 'high',
        category: 'secrets',
        title: 'Weak emergency authorization code',
        description: 'EMERGENCY_AUTH_CODE is set but shorter than 16 characters.',
        remediation: 'Use a long random authorization code or configure bcrypt hash via Settings → Security.',
        checkId: `${checkId}-emergency-code`,
      });
      issues += 1;
    }

    if (env.MSP_API_TOKEN?.trim()) {
      ctx.finding({
        severity: 'low',
        category: 'secrets',
        title: 'MSP_API_TOKEN in .env',
        description: 'MSP API token is stored in .env instead of portal Settings → Integrations.',
        remediation: 'Prefer managing the token in the portal DB; remove MSP_API_TOKEN from .env unless required.',
        checkId: `${checkId}-msp-env`,
      });
      issues += 1;
    }

    if (env.WIPAY_ENABLED === 'true') {
      if (looksPlaceholder(env.WIPAY_API_KEY)) {
        ctx.finding({
          severity: 'high',
          category: 'secrets',
          title: 'WiPay API key missing or placeholder',
          description: 'WIPAY_ENABLED=true but WIPAY_API_KEY is empty or still a placeholder.',
          remediation: 'Set a valid WiPay API key in .env or disable WIPAY_ENABLED until configured.',
          checkId: `${checkId}-wipay`,
        });
        issues += 1;
      }
    }
  }

  if (fileExists(root, 'scripts/tmp-login.json')) {
    ctx.finding({
      severity: 'critical',
      category: 'secrets',
      title: 'Test credentials file present',
      description: 'scripts/tmp-login.json exists and may contain test credentials.',
      remediation: 'Delete scripts/tmp-login.json immediately.',
      checkId: `${checkId}-tmp-login`,
    });
    issues += 1;
  }

  const tunnelConfig = readText(root, 'cloudflared-computerdynamics.yml');
  if (tunnelConfig && /YOUR_TUNNEL/i.test(tunnelConfig)) {
    ctx.finding({
      severity: 'high',
      category: 'secrets',
      title: 'Cloudflare tunnel config has placeholders',
      description: 'cloudflared-computerdynamics.yml still contains YOUR_TUNNEL placeholder values.',
      remediation: 'Configure the tunnel with real credentials before exposing production traffic.',
      checkId: `${checkId}-tunnel-placeholder`,
    });
    issues += 1;
  }

  ctx.recordCheck(
    checkId,
    'Secrets & credential hygiene',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? 'No secret blockers' : `${issues} issue(s)`
  );
}
