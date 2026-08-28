# MultiServer â€” update to v1.2.2 (2026-08-13)

Updates MultiServer application code on an existing install. Does **not** replace `config.json`, demo manifests, logs, or `deploy/Caddyfile`.

## What is new

- Detect Law Firm provision installs at the extracted live root (`provision-ecosystem.config.js`)
- Do not treat a provision package or `package/app` as the running worktree â€” `install-provision.bat` extracts `app/` flat onto the install root
- Point MultiServer at folders like `...\Platforms\Document.M LawFirm`

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

## Option A â€” apply script (Windows PowerShell)

From this folder:

```powershell
.\apply-update.ps1 -InstallRoot "C:\Users\User\Documents\MultiServer"
```

## After update

1. Start with `launch.bat`.
2. Edit Law Firm â†’ Browse to the extracted live root (e.g. `...\Platforms\Document.M LawFirm`) â†’ Auto-detect.
3. If you use Caddy, regenerate: `powershell -File deploy\install-caddy.ps1`

