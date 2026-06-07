# AutoM — Client installation

This package is a **compiled runtime** for your organization. Application source code is not included.

Build folder date and details: see `DISTRIBUTION-MANIFEST.json`.

---

## Requirements

- Windows Server or Windows 10/11
- Node.js 18 LTS or newer
- Network access to `https://www.computerdynamicstt.com` (license validation)

---

## Install steps

1. Copy this entire folder to the server (e.g. `C:\AutoM`).

2. Copy `.env.example` to `.env.local` and enter values provided by Computer Dynamics:
   - `AUTH_SECRET`, `AUTH_URL`, `NEXTAUTH_URL`
   - `LICENSE_RESPONSE_SECRET`

3. If the app shows **better-sqlite3 bindings** errors, run once in this folder:

   ```bat
   npm rebuild better-sqlite3
   ```

   (`node_modules` is usually included; only rebuild if you moved the folder to a new PC or see database errors.)

4. Double-click **`start.bat`** or run:

   ```bat
   set NODE_ENV=production
   npm run start
   ```

5. Open your configured public URL in a browser.

6. Activate your license at **`/activate-license`** using the serial number supplied by Computer Dynamics.

7. **First sign-in (empty database):** use the bootstrap admin credentials supplied by Computer Dynamics (`admin@autom.local` / default password). Change the password after login. No demo data is included.

---

## Support

License issues, new serials, or deactivation: contact Computer Dynamics.

Do not redistribute this software to third parties. Licensing is enforced per machine.
