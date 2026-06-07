# Caddy setup for computerdynamicstt.com + MultiServer demos

## Production setup (Cloudflare Tunnel — current)

This site uses **Cloudflare Tunnel**, not Caddy, for public HTTPS:

| Component | Port | Notes |
|-----------|------|-------|
| CD website (Express) | **3001** | Must bind `127.0.0.1` (not `localhost` IPv6-only) |
| Cloudflare Tunnel | → `http://127.0.0.1:3001` | `cloudflared-computerdynamics.yml` |
| MultiServer API | 5674 | |
| Demos | 8100+ | Must bind `127.0.0.1` (Vite `host: 127.0.0.1`) |

Start everything: `start-cloudflare-tunnel.bat` in the CD `working` folder.

**502 from Cloudflare** usually means tunnel origin is down or bound to `[::1]` only — use `127.0.0.1`.

## Optional: Caddy (alternative to tunnel origin routing)

Caddy is **not required** when Cloudflare Tunnel points directly to the Node app. Use Caddy only if you want it in front of local services on ports 80/443.

Default main backend port for this server: **3001** (not 8000):

```powershell
.\install-caddy.ps1 -MainPort 3001
```

## 1. Install Caddy (Windows)

1. Download from [caddyserver.com](https://caddyserver.com/download) (Windows amd64).
2. Put `caddy.exe` in `C:\caddy\` (or add to PATH).
3. Open PowerShell **as Administrator** if binding to ports 80/443.

## 2. Generate / update Caddyfile

From `e:\MultiServer\deploy`:

```powershell
.\install-caddy.ps1
```

This reads `e:\MultiServer\config.json` and writes `deploy\Caddyfile`.

Or copy the pre-built `Caddyfile` in this folder (update when you add systems in MultiServer).

## 3. Without Caddy (Express proxy on port 8000)

If traffic goes straight to the Computer Dynamics Node app (port **8000**), MultiServer **Sync website** installs `server/middleware/multiserver-demo-proxy.js` so `/demo/<slug>/` is proxied to the demo ports. **Restart the CD site** after sync (`npm start` in the `working` folder).

You still need each demo **Started** in MultiServer before opening `/demo/lawfirm/`, etc.

## 4. Before starting Caddy

| Service | How to run | Port |
|---------|------------|------|
| Computer Dynamics site | `npm start` in `F:\Computer Dynamics System\repair_workspace\repair_C.D_20251004_141630\working` | **8000** |
| MultiServer | `e:\MultiServer\launch.bat` | **5674** (API only) |
| Each demo | **Start** in MultiServer GUI | 8100, 8110, 8120, 8130, … |

## 5. Run Caddy

```powershell
cd e:\MultiServer\deploy
caddy validate --config Caddyfile
caddy run --config Caddyfile
```

Production (background service):

```powershell
caddy start --config Caddyfile
```

## 6. Test URLs

| URL | Goes to |
|-----|---------|
| https://www.computerdynamicstt.com/ | CD website (:8000) |
| https://www.computerdynamicstt.com/demo/lawfirm/ | Law Firm demo (:8100) |
| https://www.computerdynamicstt.com/demo/autom-jsd-management/ | AutoM (:8110) |
| https://www.computerdynamicstt.com/demo/repair-restaurant/ | Restaurant (:8120) |
| https://www.computerdynamicstt.com/demo/repair-pos/ | POS (:8130) |
| https://www.computerdynamicstt.com/demos-manifest.json | MultiServer manifest |

DNS must point `computerdynamicstt.com` and `www.computerdynamicstt.com` to this machine. Caddy will get a Let's Encrypt certificate automatically on first HTTPS request.

## 7. After adding systems in MultiServer

1. **Sync website** (in MultiServer GUI).
2. Run `.\install-caddy.ps1` again (regenerates demo routes).
3. `caddy reload --config Caddyfile` (or restart Caddy).

## 8. If main site uses a different port

Edit `install-caddy.ps1` or pass:

```powershell
.\install-caddy.ps1 -MainPort 3000
```

Or change `reverse_proxy 127.0.0.1:8000` in the Caddyfile.
