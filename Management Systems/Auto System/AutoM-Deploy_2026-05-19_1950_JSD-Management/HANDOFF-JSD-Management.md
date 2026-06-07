# JSD Management — vendor handoff (do not leave on client server)

**Package:** `AutoM-Deploy_2026-05-19_1950_JSD-Management`  
**Built:** 2026-05-19 19:50 — see `DISTRIBUTION-MANIFEST.json`

## Install (no domain yet)

1. Copy folder to server (e.g. `C:\AutoM-JSD`).
2. Copy `deploy-secrets-offline\jsd-management.deploy.env` → `.env.local` (secure channel).
3. `start.bat` → open **http://localhost:6001** (incognito or clear cookies first).
4. `/activate-license` with Computer Dynamics serial.
5. Sign in: **admin@autom.local** / **Cdynamics1** (creates admin if DB empty). Change password after.

## Other PC

```bat
npm rebuild better-sqlite3
```

## Domain later

Update `AUTH_URL` / `NEXTAUTH_URL` to HTTPS public URL, reverse proxy to 6001, restart.
