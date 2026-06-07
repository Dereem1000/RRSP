# MultiServer Update Package

| Field | Value |
|--------|--------|
| **Version** | 1.1.0 |
| **Build date** | 2026-05-31 |
| **Build ID** | 20260531 |
| **Package type** | Update (existing installs) |

## What this package does

Updates an **existing** MultiServer installation to **v1.1.0**. Application code is replaced; **instance-specific files on the target machine are never overwritten**.

See **`update-preserves.json`** in this folder for the full exclusion list and why each item is preserved.

### Never overwritten (preserved on target)

| File / folder | Why |
|---------------|-----|
| **`config.json`** | Your systems, ports, slugs, ngrok flags ??? unique per machine |
| **`logs/`** | Demo run logs |
| **`demos-manifest.json`** | Exported copy for your website (if saved in install folder) |
| **`demo-pages.json`** | Website demo page map (if synced locally) |
| **`deploy/Caddyfile`** | Generated from **your** `config.json` (ports and slugs). Regenerate after update with `deploy/install-caddy.ps1` |
| **`config.json.bak-*`** | Automatic backups from prior updates |
| **`.git/`, `distributions/`** | Local repo / local update packages |

The **payload contains application code only** ??? not config, manifests, Caddy routes, or logs. The build script verifies those files are absent before zipping.

Your `config.json` is backed up before apply, then **migrated** (new default fields added only ??? existing values are not replaced).

## Quick apply (Windows)

1. **Stop** MultiServer and any running demos.
2. Extract this folder anywhere.
3. Double-click **`apply-update.bat`**  
   ??? or run:

   ```bat
   apply-update.bat "E:\MultiServer"
   ```

4. Start MultiServer again with `launch.bat`.
5. If you use Caddy:

   ```powershell
   cd E:\MultiServer\deploy
   powershell -ExecutionPolicy Bypass -File install-caddy.ps1
   ```

## What's new in v1.1.0

- **ngrok tunnels** ??? per-system checkbox; auto-opens public URL when ready
- **Monolith detection** ??? apps like CRM (single Express server) no longer treated as split client/server
- **ngrok v2 support** ??? works without `--web-addr` flag
- **Version info** ??? shown in window title, status bar, `/health`, and manifest

## Manual apply

1. Back up `config.json`.
2. Copy everything from `payload/` into your MultiServer folder.
3. Do **not** copy from another machine: `config.json`, `demos-manifest.json`, `demo-pages.json`, `deploy/Caddyfile`, or `logs/`.
4. Run:

   ```bat
   python scripts\migrate_config.py config.json
   pip install -r requirements.txt
   ```

## Verify after update

- Window title shows **MultiServer v1.1.0**
- `http://127.0.0.1:5674/health` returns `"version": "1.1.0"`
- Your systems and ports in the GUI are unchanged

## Rollback

Restore `config.json` from `config.json.bak-*` if needed. To roll back code, restore from a previous MultiServer folder backup or git checkout.

