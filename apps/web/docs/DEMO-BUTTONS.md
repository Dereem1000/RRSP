# Live demo buttons (MultiServer + v2 website)

Marketing pages show an **Open Live Demo** button (injected by `public/js/multiserver-demos.js`) next to Request Demo / WhatsApp. It opens the product demo at `/demo/<slug>/` via the Next.js proxy.

## Setup

1. **MultiServer** — `MultiServer/launch.bat` → add/start each demo system.
2. **Website path** — MultiServer **Settings** should use:
   `F:/Computer Dynamics System v2/apps/web/public`  
   (already set in `MultiServer/config.json` as `website_public_dir`.)
3. **Sync website** — In MultiServer: **Sync website** (writes `demos-manifest.json`, `demo-pages.json`, and refreshes `js/multiserver-demos.js`).
4. **Start v2 web** — `npm run dev` in `apps/web` (port 3000).
5. Open a learn-more page, e.g. `/document-management.html`, and click **Open Live Demo**.

## Page → demo slug (`demo-pages.json`)

| Page | Slug |
|------|------|
| `document-management.html` | `lawfirm` |
| `restaurant-management-learn-more.html` | `repair-restaurant` |
| `pos-system-learn-more.html` | `pos-2026-05-27-demo` |
| `auto-system.html` | `autom-jsd-management` |
| `distribution-system.html` | `distribution` |

Add systems in MultiServer and run **Sync website** after changing slugs or ports.

## Local URLs

- Website: `http://localhost:3000`
- Live demo: `http://localhost:3000/demo/<slug>/`
- MultiServer API: `http://localhost:5674`

Auto and distribution demos appear once those systems are added in MultiServer with matching slugs.

## Troubleshooting blank demo page

Vite demos (lawfirm) ship with relative assets (`./index.*.js`). If Next.js strips the trailing slash on `/demo/lawfirm/`, the browser requests `/demo/index.js` (404) and you see an empty page.

**Fix:** the demo proxy rewrites assets to `/demo/<slug>/index.*` and `skipTrailingSlashRedirect` is enabled in `next.config.ts`. **Restart the Next.js dev server** after updating.

Also confirm in MultiServer: demo status is **Running**, and `http://127.0.0.1:8100/` loads directly in the browser.

## Troubleshooting POS demo 404 on `/static/...`

The POS demo is a Create React App build. Its HTML references `/static/js/main.*.js` at the site root. Through the proxy that must be `/demo/pos-2026-05-27-demo/static/...`.

**Fix:** proxy injects `<base href="/demo/<slug>/">` into demo HTML. Restart Next.js, then in MultiServer **Stop** and **Start** the POS demo, and open `http://localhost:3000/demo/pos-2026-05-27-demo/`.

Direct checks when the demo is running:

- `http://127.0.0.1:8120/` — POS web UI (static build)
- `http://127.0.0.1:8121/health` — API (if exposed)

If you see **Cannot GET /** on port 8120, the demo was started API-only. In MultiServer **Stop** the POS system, **Start** again (MultiServer now launches UI + API on two ports).
