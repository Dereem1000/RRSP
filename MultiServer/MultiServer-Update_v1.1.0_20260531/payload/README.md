# MultiServer — Demo Host Manager

**Version 1.1.0**

Python GUI to run **multiple demo systems** from one control panel. Each system points at its **project folder** — usually a `working` subfolder, or the app root (e.g. `E:\AutoM.System`). Nothing is hardcoded.

## Quick start

1. Install Python 3.10+ and [Node.js](https://nodejs.org/) (for Next/React demos).
2. Double-click **`launch.bat`** or run:

   ```bat
   pip install -r requirements.txt
   python run.py
   ```

3. Click **Add system** → **Browse** → select the **project folder**:
   - Law Firm / POS / etc.: `…\repair_workspace\…\working`
   - Law Firm **PM2 deployment** (no root `package.json`): folder with `ecosystem.config.js` (e.g. `lawfirm-deployment-…`)
   - AutoM dev: `E:\AutoM.System` (repo root with `src/`)
   - AutoM deploy: `E:\AutoM.System\distributions\AutoM-Deploy_…` (compiled package)
4. Click **Auto-detect** to fill stack type and ports.
5. **Start** the system, then **Open demo** (or use the public URL on your website).

## Supported stacks (auto-detected)

| Pattern | Type | Typical start |
|--------|------|----------------|
| `package.json` + client + server | `nodejs-split` | `npm run dev` |
| Next.js source tree (`src/app`) | `nextjs` | `npm run dev -p <port>` |
| Deploy / distribution (`.next`, no `src`) | `nextjs-dist` | `npm run start -p <port>` |
| `app.py` + `requirements.txt` | `python-flask` | `python app.py` |
| `ecosystem.config.js` (PM2) | `pm2-ecosystem` | `pm2 start` (Law Firm deploy, etc.) |
| Custom command | `custom` | Your command in the dialog |

## Ports and clash prevention

MultiServer does **not** use port 3000. Port clashes are handled in four layers:

| Layer | What it does |
|--------|----------------|
| **Reserved control port** | **5674** (configurable) — MultiServer HTTP API only (`/demos-manifest.json`, `/health`). Never assigned to demos. |
| **High demo range** | Each system gets a **block** in **8100–8990** (step 10 by default): e.g. UI `8100`, API `8101`, next system `8110`/`8111`. |
| **Registry** | While adding/editing, ports are checked against **other systems** in `config.json` and against **5674**. |
| **Before start** | Socket bind test — refuses start if the port is already taken by another process. |

**Auto-detect** reads each app’s defaults (3000, 5000, 6001, etc.) for reference but **assigns** ports from the 8100+ pool so six demos can run together.

**Client + server stacks** (Law Firm, POS, Webstore) start with `cross-env` so UI and API get **different** ports in one command (a single `PORT=` would clash internally).

### MultiServer control API (port 5674)

Your website can load demos without exporting a file:

```text
http://127.0.0.1:5674/demos-manifest.json
http://127.0.0.1:5674/health
```

### Port fields per system

- **Client / UI port** — React or Next dev UI.
- **API / server port** — Backend (split stacks only).
- **Demo port** — URL used for “Open demo” (usually same as client).
- **Extra ports** — Optional (e.g. HTTPS PWA).
- **Ngrok tunnel** — Per-system checkbox in Add/Edit. Auto-detects `start-ngrok.bat` in the project root (filename configurable in **Settings**). Tunnels the **demo port** assigned by MultiServer, not hardcoded ports inside project scripts.

### ngrok

1. Install [ngrok](https://ngrok.com/download) and add your authtoken.
2. **Settings** → **Ngrok bat filename** (default `start-ngrok.bat`) — used to detect projects that support tunnels.
3. When adding a system, check **Start ngrok tunnel with this system** if the project has a ngrok script (CRM: `E:\CRM\start-ngrok.bat`).
4. On **Start**, MultiServer waits for the demo port, then runs `ngrok http <demo_port>`. Each tunnel gets its own local inspector port (4040+).
5. The public URL is **opened in your browser** automatically when the tunnel is ready (and **Open demo** uses the ngrok URL while the tunnel is running).

Use **Ngrok bat override** only if you need a custom script; set `%PORT%` or `%MULTISERVER_DEMO_PORT%` in that script to match the demo port.

Use **Reassign all ports** on the toolbar to rebuild the whole 8100+ map after adding many systems.

## Website integration

1. **Settings** → set **Public domain** (e.g. `https://www.computerdynamicstt.com`) and **URL path prefix** (e.g. `/demo`).
2. Each system gets a slug → public URL:  
   `https://yourdomain.com/demo/law-firm`
3. **Export manifest** → `demos-manifest.json` for your site:

   ```json
   {
     "demos": [
       {
         "name": "Law Firm",
         "slug": "law-firm",
         "local_url": "http://localhost:8100/",
         "public_url": "https://yourdomain.com/demo/law-firm/"
       }
     ]
   }
   ```

4. **Proxy snippets** — Caddy/nginx examples to route `/demo/<slug>` to `127.0.0.1:<demo_port>`.

## Computer Dynamics website ([computerdynamicstt.com](https://www.computerdynamicstt.com))

Layout at the CD workspace root:

```text
working/                 ← CD workspace root (sibling of MultiServer)
  MultiServer/
  server/                ← Express intranet (:8000), loads demo proxy from server/middleware/
  public/                ← marketing HTML + synced demos-manifest.json
```

Marketing pages (`auto-system.html`, `restaurant-management-learn-more.html`, etc.) can open live demos on your domain:

1. **Settings** → set **Public domain** to `https://www.computerdynamicstt.com`
2. **CD website public folder** defaults to `…/public` when MultiServer sits at the workspace root
3. Click **Sync website** — writes `demos-manifest.json`, `demo-pages.json`, `js/multiserver-demos.js`, and `server/middleware/multiserver-demo-proxy.js`
4. **Restart the CD Express server** (`server/index.js`) so `/demo/<slug>/` proxy routes register
5. Configure **Caddy** — see [`deploy/README-CADDY.md`](deploy/README-CADDY.md) and [`deploy/Caddyfile`](deploy/Caddyfile), or **Proxy snippets → Caddy (full Caddyfile)** in the GUI.
6. **Start** demos in MultiServer before visitors click **Open Live Demo**

Product pages already include the script; they show **Open Live Demo** next to **Request Demo** when the demo is running.

| Website page | MultiServer slug |
|----------------|------------------|
| `document-management.html` | `lawfirm` |
| `auto-system.html` | `autom-jsd-management` |
| `restaurant-management-learn-more.html` | `repair-restaurant-20250902-024625` |
| `pos-system-learn-more.html` | `repair-pos-20250827-204309-old-bakery` |
| `distribution-system.html` | `distribution` (add matching system in MultiServer) |

## Config

Stored in `config.json` next to the app (editable only through the GUI). Logs go to `logs/<system-id>.log`.

## Updating an existing install

Build or use a dated update package under `distributions/`:

```powershell
powershell -ExecutionPolicy Bypass -File scripts\build-update-package.ps1
```

The exclusion list lives in **`distributions/update-preserves.json`** (also copied into each update package). The payload never includes `config.json`, exported manifests, **`deploy/Caddyfile`** (ports/slugs from the build machine), or `logs/`. On the target machine, run **`apply-update.bat`** pointing at your install folder, then regenerate Caddy if needed:

```powershell
cd deploy
powershell -ExecutionPolicy Bypass -File install-caddy.ps1
```

See **`README-UPDATE.md`** inside the package for full steps.

## Requirements

- Windows (batch launcher); GUI uses tkinter (included with Python).
- `psutil` for reliable process stop on Windows (`pip install -r requirements.txt`).
- Each demo’s own dependencies (npm/pip) installed in its **working** folder.
