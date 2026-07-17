#!/usr/bin/env node

/**
 * Optional live probes against a running portal (local or production URL).
 * Set AUDIT_BASE_URL or pass --base-url=https://...
 */

export async function runLiveChecks(ctx) {
  const checkId = 'live-probes';
  const baseUrl = (ctx.options.baseUrl || '').replace(/\/$/, '');

  if (ctx.options.skipLive || !baseUrl) {
    ctx.recordCheck(
      checkId,
      'Live endpoint probes',
      'skipped',
      ctx.options.skipLive ? '--skip-live' : 'no AUDIT_BASE_URL'
    );
    return;
  }

  let issues = 0;

  try {
    const healthRes = await fetch(`${baseUrl}/api/health`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    const health = await healthRes.json().catch(() => null);

    if (healthRes.status !== 200) {
      ctx.finding({
        severity: 'high',
        category: 'live',
        title: 'Health endpoint not healthy',
        description: `GET ${baseUrl}/api/health returned HTTP ${healthRes.status}.`,
        remediation: 'Ensure portal is running and database is reachable.',
        checkId: `${checkId}-health-status`,
      });
      issues += 1;
    } else if (health?.showcase === true) {
      ctx.finding({
        severity: 'critical',
        category: 'live',
        title: 'Live instance reports showcase/demo mode',
        description: 'Health payload has showcase:true — this may be a demo deployment.',
        remediation: 'Do not use showcase instance for production; verify DEMO_MODE env.',
        checkId: `${checkId}-showcase`,
      });
      issues += 1;
    } else {
      const worker = health?.security?.worker;
      if (worker === 'offline' || worker === 'unknown') {
        ctx.finding({
          severity: 'high',
          category: 'live',
          title: 'Security worker offline (live check)',
          description: `Health reports security.worker=${worker}.`,
          remediation: 'Start security worker alongside the portal.',
          evidence: health?.security,
          checkId: `${checkId}-worker-offline`,
        });
        issues += 1;
      } else if (worker === 'stale') {
        ctx.finding({
          severity: 'medium',
          category: 'live',
          title: 'Security worker heartbeat stale (live check)',
          description: 'Health reports security.worker=stale.',
          remediation: 'Investigate worker process; restart npm run security:worker.',
          evidence: health?.security,
          checkId: `${checkId}-worker-stale`,
        });
        issues += 1;
      }

      const license = health?.license?.api;
      if (license === 'offline' || license === 'error') {
        ctx.finding({
          severity: 'medium',
          category: 'live',
          title: 'License API offline (live check)',
          description: `Health reports license.api=${license}.`,
          remediation: 'Start license API on port 5001 and verify LICENSE_DB_PATH.',
          evidence: health?.license,
          checkId: `${checkId}-license-offline`,
        });
        issues += 1;
      }
    }

    const loginRes = await fetch(`${baseUrl}/api/auth/login`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'User-Agent': 'cd-security-audit/1.0',
        Accept: 'application/json',
        'X-Forwarded-For': '203.0.113.199',
      },
      body: JSON.stringify({
        username: 'audit-probe-invalid-user',
        password: 'audit-probe-wrong-password',
      }),
      signal: AbortSignal.timeout(15_000),
    });

    if (loginRes.status !== 401 && loginRes.status !== 403 && loginRes.status !== 429) {
      ctx.finding({
        severity: 'high',
        category: 'live',
        title: 'Login endpoint unexpected response',
        description: `Invalid login probe returned HTTP ${loginRes.status} (expected 401/403/429).`,
        remediation: 'Verify auth route rejects invalid credentials and guard middleware is active.',
        checkId: `${checkId}-login-response`,
      });
      issues += 1;
    }

    const protectedRes = await fetch(`${baseUrl}/api/users`, {
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(15_000),
    });
    if (protectedRes.status === 200) {
      ctx.finding({
        severity: 'critical',
        category: 'live',
        title: 'Protected API accessible without auth',
        description: 'GET /api/users returned 200 without session cookie.',
        remediation: 'Ensure admin API routes require authentication middleware.',
        checkId: `${checkId}-unauth-api`,
      });
      issues += 1;
    }
  } catch (err) {
    ctx.finding({
      severity: 'medium',
      category: 'live',
      title: 'Live probes could not complete',
      description: err instanceof Error ? err.message : String(err),
      remediation: `Verify ${baseUrl} is reachable or omit AUDIT_BASE_URL for offline-only audit.`,
      checkId: `${checkId}-error`,
    });
    issues += 1;
  }

  ctx.recordCheck(
    checkId,
    'Live endpoint probes',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? `Probed ${baseUrl}` : `${issues} issue(s) at ${baseUrl}`
  );
}
