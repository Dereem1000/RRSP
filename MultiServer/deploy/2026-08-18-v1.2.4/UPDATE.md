# MultiServer — update to v1.2.4 (2026-08-18)

Updates MultiServer application code on an existing install. Does **not** replace `config.json`, demo manifests, logs, or `deploy/Caddyfile`.

## What is new in v1.2.4

- **Fix:** PM2 vault no longer stays on port **3333** when `extra_ports` is empty — vault uses `demo_port + 1` so Law Firm and Medical Records can run together
- **Fix:** Auto-detect and Assign ports now populate `extra_ports` for `pm2-ecosystem` stacks
- Port validation catches duplicate vault assignments before start

## What is preserved (never overwritten)

| Path | Purpose |
|------|---------|
| `config.json` | Systems, ports, slugs |
| `demos-manifest.json` / `demo-pages.json` | Website demo map |
| `deploy/Caddyfile` | Local reverse-proxy config |
| `logs/` | Demo run logs |

## Before you start

1. Stop MultiServer and any running demos.
2. Backup `config.json` if you keep a copy outside the install.

## Option A — apply script (Windows PowerShell)

From this folder:

```powershell
.\apply-update.ps1 -InstallRoot "C:\Users\User\Documents\MultiServer"
```

## Option B — zip package

Use `F:\Computer Dynamics System v2\MultiServer\distributions\MultiServer-Update_v1.2.4_20260818.zip` — extract and run `apply-update.bat`.

## After update

1. Start with `launch.bat` — title bar should show **v1.2.4**.
2. Edit **Document.M Lawfirm** and **Medical Records.M** → **Auto-detect** → confirm Extra ports (e.g. `8141`, `8151`).
3. **Stop** both, then **Start** Law Firm first, then Medical Records.
4. Verify `.multiserver/ecosystem.config.js` in each platform folder has no `3333` references.
