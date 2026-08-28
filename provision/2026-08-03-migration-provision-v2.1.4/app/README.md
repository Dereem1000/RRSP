# Computer Dynamics System v2

Next.js rebuild of the Computer Dynamics MSP intranet. Uses the **same SQLite database** as v1 — copy lives in `data/computer_dynamics.db`.

The **license activation system** (Python GUI + API + `license_system.db`) is also bundled under `license_activation_system_new/` so the v2 folder is self-contained.

## Stack

| Layer | Technology |
|-------|------------|
| **App** | Next.js 15 (App Router) + TypeScript |
| **UI** | Tailwind CSS v4 + Lucide icons |
| **Database** | Sequelize + SQLite (`@cd-v2/database`) |

Single app on **port 3000** for UI — API requests are proxied to Express on port **4000** (`@cd-v2/api` + `packages/portal-services`).

## Quick start

```bat
cd "Computer Dynamics System v2"
npm install
npm run db:verify
start.bat
```

`start.bat` stops old processes, starts **portal + Express API + security worker + license API** (`npm run dev:all`) in a background window, waits for API and portal health checks (including worker heartbeat), then starts the **Cloudflare tunnel** (if `cloudflared` and `cloudflared-computerdynamics.yml` are present).

```bat
stop.bat
```

For local dev without the tunnel, use `npm run dev:all` in a terminal instead (portal + **Express API** + security worker + license API).

**Security worker:** AI monitoring and emergency bypass require `npm run security:worker` (included in `dev:all`). See [docs/SECURITY.md](docs/SECURITY.md).

## Project structure

```
Computer Dynamics System v2/
├── apps/web/              Next.js UI (pages; /api/* proxied to Express)
├── apps/api/              Express API server (port 4000)
├── packages/portal-services/  Ported API route handlers
├── packages/api-handlers/ Shared auth + route dispatch
├── packages/database/     Sequelize models (v1-compatible)
├── packages/security/     Security worker + shared logic (@cd-v2/security)
├── data/                  computer_dynamics.db (your data)
├── license_activation_system_new/   License GUI, API, license_system.db
└── docs/                  DATABASE_MIGRATION.md, SECURITY.md, …
```

## Scripts

| Command | Description |
|---------|-------------|
| `npm run dev` | Next.js UI (:3000) + Express API (:4000) |
| `npm run dev:all` | Portal + Express API + security worker + license API |
| `npm run security:worker` | Background security monitoring process |
| `npm run security:worker:once` | Run one monitor cycle (smoke test) |
| `npm run build` | Production build |
| `npm run start` | Production server |
| `npm run db:verify` | Test SQLite connection |
| `create-showcase-copy.bat` | Clone v2 with demo database (see [docs/SHOWCASE.md](docs/SHOWCASE.md)) |
| `npm run dev:showcase` | Showcase web only on **:3001** (runs beside main `dev:all`) |
| `npm run clean -w @cd-v2/web` | Remove stale `.next` (use if dev shows ENOENT on `/api/health`) |

**Ports:** UI `:3000`, Express API `:4000`, license API `:5001`, Mini `:8876` when docked. Set `CD_API_ORIGIN`, `CD_API_PORT`, and `CD_API_HOST` in `.env` (see `.env.example`).

Admins see a **floating Security badge** on all portal pages (bottom-right). A red count appears when issues are detected; click opens **Settings → Security** (`/settings?tab=security`).

## Database

`.env` points at the local copy:

```env
DATABASE_PATH=./data/computer_dynamics.db
LICENSE_DB_PATH=./license_activation_system_new/instance/license_system.db
JWT_SECRET=<your-strong-random-secret-min-32-chars>
```

Copy the whole `v2` folder to another PC (including `data/` and `license_activation_system_new/instance/`), run `npm install`, then `npm run dev`.

## MSP sync token (License GUI)

The token for **Load Clients** / MSP API sync is managed in the portal, not in `.env`:

1. Sign in as admin → **Settings → Integrations → License GUI sync token**
2. Click **Generate new token** (or paste an existing token and save)
3. In the License Activation GUI **MSP Integration** tab, set:
   - **API URL:** `http://localhost:3000/api/msp` (or your production URL)
   - **Token:** same value shown in Settings

Optional: set `MSP_API_TOKEN` in `.env` only if you need an environment override (it takes precedence over the portal value).

## Google reCAPTCHA (public forms)

Protects client signup, technician requests, demo requests, and login from bots when enabled.

1. **Settings → Integrations → Google reCAPTCHA**
2. Enter your **site key** and **secret key** (v1 default site key is pre-filled if unset)
3. Enable **Require CAPTCHA on public forms**
4. In [Google reCAPTCHA admin](https://www.google.com/recaptcha/admin), add your domains: `computerdynamicstt.com`, `www.computerdynamicstt.com`, and optionally `localhost` / `127.0.0.1` for testing production keys locally.

**Local dev:** When you open the portal at `http://localhost:3000` or `http://127.0.0.1:3000`, the app automatically uses Google's test CAPTCHA keys so the widget works without editing your production keys.

Public HTML pages (`client-registration.html`, `request-technician.html`, `mobile-repair.html`, `restaurant-management-learn-more.html`) load the widget via `/api/public/captcha-config` or `/js/public-captcha.js`.

## License activation system

The Python license tools live in `license_activation_system_new/`:

```bat
cd license_activation_system_new
pip install -r requirements.txt
run_gui.bat
```

In the GUI **MSP** tab, set:
- **API URL:** `http://localhost:3000/api/msp`
- **Token:** same value as in portal **Settings → Integrations → License GUI sync token**

The Next.js app reads licenses from `LICENSE_DB_PATH` (same SQLite file the GUI uses). **Portal status does not require the API server** — it reads the DB directly. The license API on port 5001 is for external products (POS, restaurant apps) calling validate endpoints at runtime.

## Cloudflare Tunnel (production domain)

v2 replaces v1 on your domain. The tunnel sends traffic to **port 3000** (Next.js) and **port 5001** (license API).

| Hostname | Local service |
|----------|----------------|
| `www.computerdynamicstt.com` | Next.js `:3000` (portal + `/api/license/*` proxy) |
| `computerdynamicstt.com` | Next.js `:3000` |
| `api.computerdynamicstt.com` | Flask license API `:5001` (POS production URL) |
| `demo.computerdynamicstt.com` | Showcase portal `:3001` (`start-showcase.bat` — see [docs/SHOWCASE.md](docs/SHOWCASE.md)) |
| `mini.computerdynamicstt.com` | Mini assistant API `:8876` (Bearer `MINI_API_TOKEN` required) |

**Production with docked Mini:**

```bat
start-production.bat
```

Runs `npm run preflight:production` first. When Mini is docked, preflight **requires**:

- `MINI_API_TOKEN` and `MINI_PUBLIC_MODE=1` in Mini's `runtime/local.env`
- Matching token in `data/mini-dock.json` (written by Settings → Integrations → Mini)
- `mini.computerdynamicstt.com` ingress in `cloudflared-computerdynamics.yml`

Production then starts Mini via `start_mini_headless.bat` before the Cloudflare tunnel.

**Tunnel only** (when portal + license API are already running):

```bat
cd "Computer Dynamics System v2"
start-cloudflare-tunnel.bat
```

Starts only the Cloudflare tunnel. Config: `cloudflared-computerdynamics.yml` (same tunnel credentials as v1). For the full stack use `start.bat`.

**Stop tunnel only** (portal + license API keep running):

```bat
stop-cloudflare-tunnel.bat
```

For full shutdown use `stop.bat`.

**Test after startup:**

- `https://www.computerdynamicstt.com/api/health`
- `https://www.computerdynamicstt.com/api/license/status`
- `https://api.computerdynamicstt.com/api/license/status`
- `https://mini.computerdynamicstt.com/api/health`

If `api.computerdynamicstt.com` or `mini.computerdynamicstt.com` fail, add a **Public Hostname** on tunnel `computerdynamics-tunnel` (Cloudflare Zero Trust or `cloudflared tunnel route dns`) matching the hostnames in `cloudflared-computerdynamics.yml`.

## Express API (`apps/api`)

All `/api/*` routes run on **Express** (`@cd-v2/api` on port **4000**). Business logic lives in `packages/portal-services` (ported from former Next route handlers) with shared auth/dispatch in `packages/api-handlers`. Security admin routes use the dedicated `@cd-v2/security` handlers in `api-handlers`.

- **Dev:** `npm run dev` starts Next (UI, port 3000) and Express API (port 4000) together.
- **Proxy:** Next rewrites `/api/:path*` to Express — public URLs stay `https://computerdynamicstt.com/api/*`.
- **Env:** `CD_API_ORIGIN=http://127.0.0.1:4000`, `CD_API_PORT=4000` (optional; defaults shown).
- **Production:** `npm run start:production` runs Next + Express API + security worker + license API concurrently.
