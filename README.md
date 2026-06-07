# Computer Dynamics System v2

Next.js rebuild of the Computer Dynamics MSP intranet. Uses the **same SQLite database** as v1 — copy lives in `data/computer_dynamics.db`.

The **license activation system** (Python GUI + API + `license_system.db`) is also bundled under `license_activation_system_new/` so the v2 folder is self-contained.

## Stack

| Layer | Technology |
|-------|------------|
| **App** | Next.js 15 (App Router) + TypeScript |
| **UI** | Tailwind CSS v4 + Lucide icons |
| **Database** | Sequelize + SQLite (`@cd-v2/database`) |

Single app on **port 3000** — pages and API routes together (no separate Express server required).

## Quick start

```bat
cd "Computer Dynamics System v2"
npm install
npm run db:verify
start.bat
```

`start.bat` stops old processes, starts the **portal + security worker + license API** (`npm run dev:all`) in a background window, waits for health checks (including worker heartbeat), then starts the **Cloudflare tunnel** (if `cloudflared` and `cloudflared-computerdynamics.yml` are present).

```bat
stop.bat
```

For local dev without the tunnel, use `npm run dev:all` in a terminal instead (portal + **security worker** + license API).

**Security worker:** AI monitoring and emergency bypass require `npm run security:worker` (included in `dev:all`). See [docs/SECURITY.md](docs/SECURITY.md).

## Project structure

```
Computer Dynamics System v2/
├── apps/web/              Next.js app (UI + /api routes)
├── packages/database/     Sequelize models (v1-compatible)
├── packages/security/     Security worker + shared logic (@cd-v2/security)
├── data/                  computer_dynamics.db (your data)
├── license_activation_system_new/   License GUI, API, license_system.db
└── docs/                  DATABASE_MIGRATION.md, SECURITY.md, …
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js dev server with Turbopack (:3000) |
| `npm run dev:all` | Portal (Turbopack) + security worker + license API |
| `npm run security:worker` | Background security monitoring process |
| `npm run security:worker:once` | Run one monitor cycle (smoke test) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run db:verify` | Test SQLite connection |
| `npm run clean -w @cd-v2/web` | Remove stale `.next` (use if dev shows ENOENT on `/api/health`) |

Admins see a **floating Security badge** on all portal pages (bottom-right). A red count appears when issues are detected; click opens **Settings → Security** (`/settings?tab=security`).

## Database

`.env` points at the local copy:

```env
DATABASE_PATH=./data/computer_dynamics.db
LICENSE_DB_PATH=./license_activation_system_new/instance/license_system.db
JWT_SECRET=supersecretkey
MSP_API_TOKEN=your-sync-token
```

Copy the whole `v2` folder to another PC (including `data/` and `license_activation_system_new/instance/`), run `npm install`, then `npm run dev`.

## License activation system

The Python license tools live in `license_activation_system_new/`:

```bat
cd license_activation_system_new
pip install -r requirements.txt
run_gui.bat
```

In the GUI **MSP** tab, set:
- **API URL:** `http://localhost:3000/api/msp`
- **Token:** same value as `MSP_API_TOKEN` in `.env`

The Next.js app reads licenses from `LICENSE_DB_PATH` (same SQLite file the GUI uses). **Portal status does not require the API server** — it reads the DB directly. The license API on port 5001 is for external products (POS, restaurant apps) calling validate endpoints at runtime.

## Cloudflare Tunnel (production domain)

v2 replaces v1 on your domain. The tunnel sends traffic to **port 3000** (Next.js) and **port 5001** (license API).

| Hostname | Local service |
|----------|----------------|
| `www.computerdynamicstt.com` | Next.js `:3000` (portal + `/api/license/*` proxy) |
| `computerdynamicstt.com` | Next.js `:3000` |
| `api.computerdynamicstt.com` | Flask license API `:5001` (POS production URL) |

**Start (stop v1 tunnel first if it is running):**

```bat
cd "Computer Dynamics System v2"
start-cloudflare-tunnel.bat
```

This launches the portal, license API, and Cloudflare tunnel. Config: `cloudflared-computerdynamics.yml` (same tunnel credentials as v1).

**Stop:**

```bat
stop-cloudflare-tunnel.bat
```

**Test after startup:**

- `https://www.computerdynamicstt.com/api/health`
- `https://www.computerdynamicstt.com/api/license/status`
- `https://api.computerdynamicstt.com/api/license/status`

If `api.computerdynamicstt.com` fails, add a CNAME in Cloudflare DNS pointing to your tunnel.

## Legacy `apps/api`

The old Express API is kept for reference but is **no longer used**. All routes are in `apps/web/src/app/api/`.
