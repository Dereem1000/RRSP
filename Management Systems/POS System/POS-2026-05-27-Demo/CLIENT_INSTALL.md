# POS System - Client Package

Package: 2026-05-27_04
Built: 2026-05-27T04:31:01.263Z

## Requirements
- Windows PC with Node.js 18+ (https://nodejs.org/)
- Port 8000 available (or set PORT before starting)

## Install
1. Copy this folder to the target computer.
2. Run `setup-deployment.bat` once.
3. Copy `.env.example` to `.env` and adjust settings if needed.
4. Run `start-production.bat`.

## License
Activate using the license key provided by your vendor.

If you see a **decryption** or **secure license file** error after moving the POS to another PC or reinstalling Windows:
1. Stop the POS server.
2. Delete `server\license.encrypted` (and `server\license.json` if present).
3. Start the server again and enter the same license serial on this computer.

The local license file is encrypted for this machine only; it is separate from activation in License Studio.

## Support
Contact your POS vendor for updates and support. Source code is not included in this package.
