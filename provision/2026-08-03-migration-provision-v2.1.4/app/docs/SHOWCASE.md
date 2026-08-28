# Showcase installation

A **showcase copy** is a separate folder with its own SQLite database pre-filled with fictional demo data. Use it for sales demos and customer walkthroughs without touching production data.

## Dual-run (same PC)

You run **both** portals on one machine:

| Stack | Command | Port | Public URL |
|-------|---------|------|------------|
| **Live** | `start.bat` (main v2 folder) | 3000 | `computerdynamicstt.com` |
| **Demo** | `start-showcase.bat` (showcase folder) | 3001 | `demo.computerdynamicstt.com` |

Showcase starts **only the Next.js app** on 3001 — it shares the main portal’s license API (`:5001`) and security worker from `start.bat`.

**Customers never use localhost.** The live login **Go to demo** button always links to `https://demo.computerdynamicstt.com/login`.

## Quick setup

From the main `Computer Dynamics System v2` folder:

```bat
create-showcase-copy.bat
```

Then:

```bat
cd "..\Computer Dynamics System v2 - Showcase"
npm install
```

Daily operation:

```bat
REM Window 1 — live site
start.bat

REM Window 2 — demo site (showcase folder)
start-showcase.bat
```

## Cloudflare tunnel (required for public demo link)

### 1. Tunnel ingress (local config)

Add to `cloudflared-computerdynamics.yml` (before the catch-all `404` rule):

```yaml
  - hostname: demo.computerdynamicstt.com
    service: http://127.0.0.1:3001
```

Restart the tunnel after saving (`stop.bat` then `start.bat`).

### 2. DNS record (Cloudflare — fixes NXDOMAIN)

The tunnel config alone is not enough. You need a **DNS route** for `demo`:

```bat
scripts\setup-demo-dns.bat
```

Or manually:

```bat
cloudflared tunnel route dns cdcb0769-874b-4923-aeed-a493e1a2b6af demo.computerdynamicstt.com
ipconfig /flushdns
```

Or in [Cloudflare DNS](https://dash.cloudflare.com) → **computerdynamicstt.com** → **DNS** → **Add record**:

| Type | Name | Target | Proxy |
|------|------|--------|-------|
| CNAME | `demo` | `cdcb0769-874b-4923-aeed-a493e1a2b6af.cfargotunnel.com` | Proxied |

**NXDOMAIN** means this DNS record is missing or your PC has not picked it up yet — run `ipconfig /flushdns` and wait a few minutes.

Verify: `nslookup demo.computerdynamicstt.com 1.1.1.1` should return Cloudflare IPs (104.21.x / 172.67.x).

Showcase `.env` should include:

```env
DEMO_MODE=true
NEXT_PUBLIC_SITE_URL=https://demo.computerdynamicstt.com
PORT=3001
```

Production `.env` does **not** need a demo URL override — the login page derives `https://demo.computerdynamicstt.com` from `NEXT_PUBLIC_SITE_URL`.

## Demo logins

| Role | Username | Password |
|------|----------|----------|
| Admin | `demo` | `Demo@2026!` |
| Technician | `tech` | `Demo@2026!` |
| Client portal | each client email (e.g. `ops@islandfresh.demo`) | `Demo@2026!` |

## What is included

- 5 fictional clients (POS, restaurant, auto, distribution, document features)
- Support tickets, procurement orders, sales pipeline, calendar events
- A sample quote and pinned notice board welcome message

## Reset demo data

Inside the showcase folder:

```bat
node scripts\init-showcase-database.mjs data\computer_dynamics.db
```

## Scripts

| Command | Description |
|---------|-------------|
| `create-showcase-copy.bat` | Copy project + seed demo database |
| `start-showcase.bat` | Demo web on **:3001** (dual-run with main) |
| `node scripts/init-showcase-database.mjs` | Wipe and re-seed demo data |

## Notes

- This is separate from **Settings → Demo mode** (sandbox snapshot on the live DB).
- If **Go to demo** fails in the browser, check: showcase running on 3001, tunnel ingress for `demo.computerdynamicstt.com`, and DNS CNAME for `demo`.
