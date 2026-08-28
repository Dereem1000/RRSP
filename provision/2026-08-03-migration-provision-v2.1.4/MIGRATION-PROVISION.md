# Computer Dynamics v2 — Migration provision

This package moves a **live** install to another machine (not a fresh customer seed).

## Prerequisites on target machine

- Node.js 20+
- Python 3 (license API)
- Optional: cloudflared for public tunnel

## Install

1. Copy this entire folder to the target machine.
2. Run:

```bat
install-migration-provision.bat "D:\Apps\ComputerDynamicsV2" "%CD%"
```

3. Review `.env` (created from migrated secrets if none existed).
4. Update `cloudflared-computerdynamics.yml` / tunnel credentials for this host.
5. Run `start-production.bat`.

## Notes

- Live database: data/computer_dynamics.live.db
- Mini dock config (`data/mini-dock.json`) is included if present — update Mini path on new PC.
- This package contains production secrets; store and transfer securely.

## Source

Built from: F:\Computer Dynamics System v2
Version: 2.1.4