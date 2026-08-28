# MultiServer — Demo Host Manager

**Version 1.2.2**

Native desktop GUI (CustomTkinter) to run **multiple demo systems** from one control panel. Each system points at its **project folder** — usually a `working` subfolder, or the app root (e.g. `E:\AutoM.System`). Nothing is hardcoded.

## Quick start

1. Install Python 3.10+ and [Node.js](https://nodejs.org/) (for Next/React demos).
2. Double-click **`launch.bat`** or run:

   ```bat
   pip install -r requirements.txt
   python run.py
   ```

3. Click **Add** → **Browse** → select the **project folder**.
4. Click **Auto-detect** to fill stack type and ports.
5. **Start** the system, then **Open demo**.

## What’s new in 1.2.2

- Detect Law Firm **provision installs** at the extracted live root (`provision-ecosystem.config.js`), e.g. `...\Platforms\Document.M LawFirm`
- Do not treat a provision package or `app/` as the running worktree — `install-provision.bat` extracts `app/` flat onto the install root

## What’s new in 1.2.1

- **Host mode** — optional toggle to dedicate the PC to MultiServer (closes other user apps, boosts demo priority)

## What’s new in 1.2.0

- Modern dark desktop UI (grouped Systems / Runtime / Tools actions)
- **Host + per-demo CPU/RAM** monitoring (process trees via `psutil`)
- Load warnings when the machine or a demo is under pressure
- **Mini integration** — connect MultiServer to Mini (`system_key: multiserver`) so CDynamics can push/pull product updates from the Update Library

## Host mode (resource squeeze)

**Settings → General → Host mode**

When ON (and after confirmation):

- Closes other **user** apps (browsers, Office, chat, games, etc.)
- Keeps Windows cores, Explorer, networking, MultiServer, Python/Node demos, ngrok/Caddy
- Raises MultiServer + demo process priority
- Re-runs cleanup about every 60 seconds while enabled
- Optional: stop SysMain / Windows Search (`host_mode_stop_services`)

Admin/UAC is recommended so more apps can be closed. Turning Host mode OFF does **not** restart apps you closed.

## Resource monitoring

The header strip shows host CPU, RAM used/total, and how much MultiServer-managed demos consume vs the rest of the machine. The system list has **CPU** / **RAM** columns; the detail panel shows each demo’s share of MultiServer load. Thresholds are under **Settings → General**.

Local snapshot API: `http://127.0.0.1:5674/resources.json`

## Mini integration (updates from CDynamics)

MultiServer implements a **Python** Mini client (the Node `integration-kit` is for Express apps).

1. **Settings → Support / Mini**
2. Set **Company name** and **Mini dashboard URL** (e.g. `https://mini.computerdynamicstt.com`). Callback URL uses **Settings → Public domain** (`https://www.computerdynamicstt.com`) — same CD-domain pattern as CRM/AutoM.
3. **Public routing** (pick what you use):
   - **Cloudflare tunnel** (`www.computerdynamicstt.com` → portal `:3000`): portal proxies `/api/integrations/mini/*` and `/resources.json` to MultiServer `:5674` (`apps/web/src/app/api/integrations/mini/…`). Restart the portal after updates.
   - **Local Caddy**: regenerate `deploy/Caddyfile` (`deploy/install-caddy.ps1`) so `/api/integrations/mini/*` and `/resources.json` reverse-proxy to `:5674`, then `caddy reload`.
4. **Connect** → on Mini, **External Systems → Connected Systems → Accept**.
5. Register Deploy Source in Mini Update Library on `MultiServer/deploy` with project key **`multiserver`**.
6. **Check updates** / **Apply update**, or enable **Auto update**. Manual apply still works from a local deploy folder.

Inbound Mini routes on the control API:

- `GET /api/integrations/mini/health`
- `POST /api/integrations/mini/connection-status`
- `POST /api/integrations/mini/apply-update`
- `POST /api/integrations/mini/integration-kit/apply-update`

`config.json` (including the `mini` section) is **never** overwritten by updates.

## Supported stacks (auto-detected)

| Pattern | Type | Typical start |
|--------|------|----------------|
| `package.json` + client + server | `nodejs-split` | `npm run dev` |
| Next.js source tree (`src/app`) | `nextjs` | `npm run dev -p <port>` |
| Deploy / distribution (`.next`, no `src`) | `nextjs-dist` | `npm run start -p <port>` |
| `app.py` + `requirements.txt` | `python-flask` | `python app.py` |
| `ecosystem.config.js` (PM2) | `pm2-ecosystem` | `pm2 start` |
| Custom command | `custom` | Your command in the dialog |

## Ports and clash prevention

MultiServer does **not** use port 3000. Control API stays on **5674**. Demos use **8100–8990**.

### Control API

```text
http://127.0.0.1:5674/demos-manifest.json
http://127.0.0.1:5674/health
http://127.0.0.1:5674/resources.json
```

## Updating an existing install

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-update-package.ps1
```

Produces:

- `distributions/MultiServer-Update_v…/` — offline zip + `apply-update.bat`
- `deploy/YYYY-MM-DD-vX.Y.Z/` — Mini Update Library layout (`app/`, `apply-update.ps1`, `UPDATE.md`)

Preserves live in **`distributions/update-preserves.json`**.

## Requirements

- Windows (batch launcher); GUI uses **CustomTkinter** + tkinter.
- `psutil`, `customtkinter` (`pip install -r requirements.txt`).
- Each demo’s own dependencies installed in its project folder.
