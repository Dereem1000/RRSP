# Security platform (v2)

Computer Dynamics v2 uses a **dedicated security worker** plus **admin controls** in the portal. This replaces the v1 model where monitoring lived only inside the legacy Express server.

## What it does

| Component | Purpose |
|-----------|---------|
| **Security worker** | Long-running Node process: file integrity, activity analysis, heartbeats |
| **Monitoring (config)** | `ai_security_enabled` — when off, worker only sends heartbeats |
| **Emergency bypass** | Time-limited pause of checks during incidents (audited) |
| **Authorization codes** | Gate bypass and “disable monitoring” actions |
| **HTTP guards** | Rate limits, IP block list, bot heuristics on login/API routes |
| **Auto-repair** | Optional restore of tampered files from latest backup (see [BACKUP.md](./BACKUP.md)) |

### Not customer-facing AI

“AI Security” here means **automated guardrails** (integrity + event analysis), not chat or ML models.

## Architecture

```
┌─────────────────────┐     ┌──────────────────────────┐
│  Next.js portal     │     │  @cd-v2/security-worker   │
│  Settings → Security│     │  (npm run security:worker)│
│  REST /api/security │     │  loop every 60s (default)  │
└──────────┬──────────┘     └─────────────┬────────────┘
           │                              │
           └──────────┬───────────────────┘
                      ▼
           ┌─────────────────────┐
           │  SQLite + models     │
           │  system_configs      │
           │  security_events     │
           │  emergency_overrides │
           └─────────────────────┘
```

Shared logic lives in **`packages/security`** (`@cd-v2/security`).

## Running the worker

From the v2 monorepo root:

```bash
# Worker only (recommended for production: run as a service)
npm run security:worker

# Single cycle (smoke test)
npm run security:worker:once

# Portal + worker + license API (development)
npm run dev:all
```

### Worker health (Settings UI)

| Health | Meaning |
|--------|---------|
| **online** | Heartbeat newer than ~2.5× interval |
| **stale** | Heartbeat old but not dead |
| **offline** | No heartbeat or very old |
| **disabled** | Monitoring turned off in config |

Heartbeats are stored in `system_configs`:

- `security_worker_last_heartbeat`
- `security_worker_version`
- `security_worker_checks_total`
- `security_worker_last_error`

## Monitor cycle (each tick)

1. Write heartbeat (+ increment check counter).
2. If monitoring disabled → stop.
3. Refresh emergency bypass state (expire old rows).
4. If bypass active → skip integrity/activity/IDS residual checks **and** HTTP bot/IDS/rate limits (Express `guardRequest`). **IP block list still applies.** Outbound high/critical alerts are also suppressed. Activating bypass clears blocked loopback IPs only (`::1`, `127.0.0.1`).
5. **File integrity** — SHA-256 baselines for critical v2 paths (stored in `security_file_baselines`). Optional auto-repair from backups when `security_repair_enabled` is true.
6. **Activity monitor** — brute-force / event-burst patterns from `security_events` (3 failed logins or 10 events / 5 min).
7. **Intrusion scan** — residual pattern match on recent event text (live HTTP IDS runs in Express `expressRequestGuard`).
8. **Auto-backup** — `maybeRunAutoBackup()` when scheduled (`autoBackupConfig`).
9. Update `security_threat_level` (`low` | `medium` | `high` | `critical`).

### Protected files (catalog `2.0.1`)

The worker monitors **source files** for the security platform (not `dist/` or `.next/`):

- Database: `User`, `SystemConfig`, `EmergencyOverride`, `SecurityEvent`, `connection.ts`
- Package `@cd-v2/security`: worker, monitoring, emergency, auth, IDS modules
- Portal: `auth.ts`, `jwt.ts`, `middleware.ts`, security/emergency API routes
- Ops: `start.bat`, `stop.bat`, root `package.json`

When the catalog version changes (`PROTECTED_FILES_VERSION` in `protected-files.ts`), the **next worker cycle auto-rebaselines** all paths and writes `security_file_baselines_version` — no false alerts after a platform upgrade.

After a **normal code deploy**, use **Settings → Rebaseline files** (S-CLS1) or expect `file_integrity` events until you do.

## Emergency bypass

**Use when:** locked out, false positives, or emergency maintenance — not for routine work.

1. Admin opens **Settings → Security → Activate bypass**.
2. Provides **reason**, **duration** (1–1440 minutes), and **authorization code**.
3. System creates `emergency_overrides` row and sets global flags:
   - `emergency_override_active`
   - `emergency_override_expires`
4. Worker skips integrity/activity checks until expiry or **End bypass**.
5. HTTP bot/IDS/rate limits pause; **manual/automated IP block list remains enforced**.

Authorization codes are **never stored in plain text** in override rows (masked as `***`).

### End bypass

- **End bypass** button → `POST /api/security/emergency-override/disable`
- Or wait for expiry (worker auto-revokes expired rows)

## Authorization codes

Valid sources (any one):

1. **Environment:** `EMERGENCY_AUTH_CODE` in `.env`
2. **Database:** `emergency_auth_code_hash` (bcrypt), set in **Settings → Set master auth code** (S-CLS1 only)

Clearance rules:

- **S-CLS3** — cannot authorize bypass or disable monitoring
- **S-CLS2 / S-CLS1** — can activate bypass (with valid code)
- **S-CLS1** — required to disable monitoring (also requires `developer_mode=true`)

## Disabling monitoring

Stricter than bypass:

- `developer_mode` must be `true` in `system_configs`
- User must be **S-CLS1**
- Valid authorization code

This sets `ai_security_enabled` to `false`. The worker keeps running but only sends heartbeats.

## API reference (admin)

| Method | Path | Description |
|--------|------|-------------|
| GET | `/api/security/platform-status` | Full platform status |
| GET | `/api/security/ai-status` | Legacy shape + `platform` |
| POST | `/api/security/toggle` | Enable/disable monitoring |
| POST | `/api/security/auth-code` | Set master auth hash (S-CLS1) |
| GET | `/api/security/emergency-status` | Bypass state |
| POST | `/api/security/emergency-override` | Activate bypass |
| POST | `/api/security/emergency-override/disable` | End all bypasses |
| GET | `/api/emergency/overrides` | History |
| POST | `/api/emergency/overrides/:id/deactivate` | Revoke one |
| DELETE | `/api/emergency/overrides/:id` | Delete record |

## Configuration keys

| Key | Type | Default | Description |
|-----|------|---------|-------------|
| `ai_security_enabled` | boolean | true | Monitoring on/off |
| `security_monitor_interval_ms` | number | 60000 | Worker interval |
| `security_threat_level` | string | low | Last computed level |
| `security_file_baselines` | json | — | SHA-256 baselines |
| `emergency_override_active` | boolean | false | Global bypass flag |
| `emergency_override_expires` | string | — | ISO expiry |
| `emergency_auth_code_hash` | string | — | Bcrypt master code |
| `security_worker_*` | various | — | Worker telemetry |

## Events (`security_events`)

Common `event_type` values from v2 worker:

- `file_integrity` — protected file changed
- `suspicious_activity` — brute-force / burst patterns
- `emergency_override` — bypass start/end
- `system_change` — monitoring toggled
- `monitor_cycle_error` — worker failure
- `data_access` — audited read of sensitive API data (clients, backups, users, tickets, settings)
- `data_exfiltration_suspected` — bulk response, backup download volume, or burst of sensitive reads

Events use **5-minute deduplication** for identical type+description (except explicit `skipDedup` actions).

### Data leak guard

- **Live audit** — after successful Express API responses, classifies sensitive routes and writes `data_access` events (record/byte counts in `details`).
- **Heuristics** — raises **`data_exfiltration_suspected`** (critical, outbound alert) when:
  - Response size ≥ **4 MB** (default; includes backup ZIP downloads),
  - Large list payloads on high-risk routes,
  - **≥ 30** sensitive accesses in **5 minutes** per user/IP (worker + live).
- **Auto-block** — when `data_leak_auto_block_ip` is true (default), blocks **client** or **anonymous** actors on exfiltration alerts; staff users are alerted but not IP-blocked by default.
- **Toggles (S-CLS1)** — `data_leak_guard_enabled`, `data_leak_auto_block_ip` via Settings → Security or `POST /api/security/module-toggles`.

## Windows quick start (`start.bat`)

`start.bat` runs `npm run dev:all`, which starts:

- Next.js portal (`:3000`)
- Security worker (`@cd-v2/security`)
- License API (`:5001`)

It waits for `/api/health` to report a worker status of `online`, `stale`, or `disabled` (monitoring off). Use `stop.bat` to shut down all three.

## Production deployment

1. Run **web** and **security worker** as separate processes (Windows Service, systemd, PM2, etc.).
2. Set `EMERGENCY_AUTH_CODE` or configure master hash via Settings.
3. Do **not** expose worker port — it has no HTTP server.
4. Ensure `DATABASE_PATH` / `CD_V2_ROOT` point at the same SQLite file as the portal.
5. Keep `developer_mode` **false** in production unless you need to disable monitoring.

## HTTP request guards

- **Express `/api` middleware** — `expressRequestGuard` on every API route (after body parsers): IP block list, rate limits, **live Intrusion IDS** (path/query/body), and bot heuristics. Health endpoints are skipped.
- **Next middleware** — reads `data/security_blocked_ips.json` for fast IP blocks on `/api/*`.
- **Login / public forms / license validate** — honeypot + optional Cloudflare Turnstile when `TURNSTILE_SECRET_KEY` is set; login honeypot returns 401 (does not fingerprint via 403).
- **Settings** — threat metrics, blocked IP list, module toggles (`intrusion_detection_enabled`, `bot_detection_enabled`, `security_repair_enabled`).

### Intrusion IDS (live)

When `intrusion_detection_enabled` is true, each guarded request is scanned for SQL injection, XSS, path traversal, and common probe paths (`wp-admin`, `.env`, etc.). Hits are logged as `sql_injection` / `xss_attempt` / `path_traversal` / `intrusion_detected` and blocked with HTTP 403. The security worker still runs a residual scan over recent event text.

### Bot detection

When `bot_detection_enabled` is true, requests are scored (User-Agent, Accept-Language, path signals, honeypot). Score ≥ 0.7 is blocked (`bot_detected`); ≥ 0.9 also adds the IP to the block list. Explicit `bot`/`crawler`/`spider` user-agents are blocked on their own; plain `curl`/`wget` need a second signal so product installers keep working. **Loopback IPs (`::1`, `127.0.0.1`) are never permanently blocked.**

### Outbound alerts

High/critical events (except routine `login_attempt` / `system_change` / `emergency_override`) can notify outside the UI:

- `SECURITY_ALERT_WEBHOOK_URL` or SystemConfig `security_alert_webhook_url` — JSON POST
- `SECURITY_ALERT_EMAIL` or SystemConfig `security_alert_email` — uses portal SMTP (`email_*` settings)

Alerts are suppressed while emergency bypass is active.

## Backup & recovery

System recovery and ZIP restores live on **Settings → Backup**, powered by `@cd-v2/backup`. See [BACKUP.md](./BACKUP.md).

## License system monitoring

The worker monitors licensing alongside the intranet:

| Check | Module | Events |
|-------|--------|--------|
| File integrity | `license-paths` in protected catalog `2.0.2` | `file_integrity` |
| Flask API health | `license-health.ts` → `GET :5001/health` | `license_api_offline` |
| License DB anomalies | `license-monitor.ts` | `license_integrity`, `suspicious_license_activity` |
| MSP ↔ license consistency | `license-monitor.ts` | `license_msp_mismatch` |
| Validate abuse | Next `/api/license/validate` + `license_validation_log` | `license_validate_*`, rate limits |

Settings → Security shows a **License system** card. `/api/health` includes `license.api` status.

Disable all license checks with `LICENSE_MONITORING_ENABLED=false` in `.env`.

## Migrating from v1

- Same SQLite tables: `emergency_overrides`, `security_events`, `system_configs`.
- Legacy keys `ai_security_enabled`, `emergency_override_*` are still used.
- v1 Express `ai_security_core.js` can be stopped when the v2 worker is running to avoid duplicate checks.
- Re-baseline: delete `security_file_baselines` from `system_configs` if you intentionally deploy new builds (otherwise you may get integrity alerts).

## Troubleshooting

| Issue | Action |
|-------|--------|
| Worker **offline** in UI | Run `npm run security:worker` |
| Invalid authorization | Set `EMERGENCY_AUTH_CODE` or master hash in Settings |
| Integrity alerts after deploy | Expected if protected files changed; review events or refresh baselines |
| Bypass not pausing checks | Confirm worker is running and `emergency_override_active` is true |

## Security audit suite

Two-step security review for production:

| Step | Command | What it does |
|------|---------|--------------|
| **1 — Config audit** | `npm run audit:security` | Secrets, DB config, npm audit, filesystem (offline) |
| **2 — Pentest** | `npm run audit:security:pentest` | Simulated web attacks against live production URL |
| **Both** | `npm run audit:security:full` | Runs Step 1 then Step 2 |

```bash
# Full 2-step review (recommended before/after production deploy)
npm run audit:security:full

# Or run steps separately
npm run audit:security
npm run audit:security:pentest -- --base-url=https://www.computerdynamicstt.com

# Windows shortcut (runs full 2-step)
run-security-audit.bat
```

### Step 1 — Configuration audit

Offline hygiene checks. No HTTP attacks.

| Output | Location |
|--------|----------|
| Full JSON report | `data/security-audit-reports/audit-<timestamp>.json` |
| Human-readable | `data/security-audit-reports/latest.md` |

### Step 2 — Production penetration test

Anonymous attacker probes against your live portal (default: `NEXT_PUBLIC_SITE_URL` or `https://www.computerdynamicstt.com`):

- Bot detection, brute-force login, honeypot, rate limiting
- SQL injection and XSS probes on login
- Unauthorized access to `/api/users`, settings, security, backup, MSP APIs
- Public form honeypot on client signup
- Dashboard redirect without session

| Output | Location |
|--------|----------|
| Pentest JSON | `data/security-audit-reports/pentest-<timestamp>.json` |
| Pentest report | `data/security-audit-reports/latest-pentest.md` |

Set `PENTEST_BASE_URL` to override the production target. Use RFC5737 test IPs only — safe for repeated runs.

Related: `npm run preflight:production` (deploy blockers), `npm run test:security:external` (local dev wrapper for Step 2).

## Package layout

```
packages/security/src/
  auth.ts           — authorization validation
  emergency.ts      — bypass state machine
  events.ts         — logging + dedup
  protected-files.ts — integrity baselines
  activity-monitor.ts — DB pattern checks
  monitoring.ts     — status API + cycle
  worker.ts         — process loop
  worker-cli.ts     — CLI entry
```
