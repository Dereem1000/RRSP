# MultiServer — update to v{{VERSION}} ({{BUILD_DATE}})

Updates MultiServer application code on an existing install. Does **not** replace `config.json`, demo manifests, logs, or `deploy/Caddyfile`.

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

1. Extract `MultiServer-Update_v{{VERSION}}_{{BUILD_ID}}.zip`
2. Run `apply-update.bat` and point it at your install root

## After update

1. Start with `launch.bat` — title bar should show **v{{VERSION}}**.
2. For each **pm2-ecosystem** demo (Law Firm, Medical Records): Edit → **Auto-detect** → confirm **Extra ports** = `demo_port + 1`.
3. **Stop** and **Start** each PM2 demo so `.multiserver/ecosystem.config.js` regenerates with the new vault ports.
4. If you use Caddy, regenerate: `powershell -File deploy\install-caddy.ps1`
