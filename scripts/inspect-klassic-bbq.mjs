import sqlite3 from 'sqlite3';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const licenseDb = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');
const portalDb = path.join(root, 'data', 'computer_dynamics.db');
const altLicenseDb = path.join(root, 'license_activation_system_new', 'license_system.db');

function openDb(p) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(p, (err) => (err ? reject(err) : resolve(db)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

console.log('=== DB file existence ===');
console.log('Primary license DB:', licenseDb, fs.existsSync(licenseDb));
console.log('Alt license DB (cwd):', altLicenseDb, fs.existsSync(altLicenseDb));

const lic = await openDb(licenseDb);
const portal = await openDb(portalDb);

console.log('\n=== company_registration ===');
for (const c of await all(lic, 'SELECT * FROM company_registration ORDER BY company_name')) {
  console.log(c);
}

console.log('\n=== license_activation ===');
for (const l of await all(
  lic,
  `SELECT la.*, cr.company_name, cr.msp_client_id, cr.email
   FROM license_activation la
   LEFT JOIN company_registration cr ON cr.id = la.company_id
   ORDER BY cr.company_name`
)) {
  console.log({
    id: l.id,
    company: l.company_name,
    msp: l.msp_client_id,
    email: l.email,
    serial: l.serial_number,
    active: l.is_active,
    exp: l.expiration_date,
  });
}

console.log('\n=== Portal Klassic / BBQ ===');
for (const c of await all(
  portal,
  `SELECT id, company_name, name, email, features, service_level FROM clients
   WHERE company_name LIKE '%Klassic%' OR company_name LIKE '%BBQ%'
      OR name LIKE '%Klassic%' OR name LIKE '%BBQ%'`
)) {
  console.log(c);
}

// Email fallback simulation (portal logic)
console.log('\n=== Email fallback matches ===');
const clients = await all(
  portal,
  `SELECT id, company_name, email FROM clients
   WHERE company_name LIKE '%Klassic%' OR company_name LIKE '%BBQ%'`
);
for (const client of clients) {
  const byMsp = await all(lic, 'SELECT id, company_name, msp_client_id FROM company_registration WHERE msp_client_id = ?', [
    client.id,
  ]);
  const byEmail = await all(lic, 'SELECT id, company_name, msp_client_id FROM company_registration WHERE email = ?', [
    client.email,
  ]);
  const licRows = await all(
    lic,
    `SELECT la.id, la.serial_number, la.is_active, cr.company_name
     FROM license_activation la
     JOIN company_registration cr ON cr.id = la.company_id
     WHERE cr.msp_client_id = ? OR cr.email = ?`,
    [client.id, client.email]
  );
  console.log('\nClient:', client.company_name, client.id);
  console.log('  by msp_client_id:', byMsp);
  console.log('  by email:', byEmail);
  console.log('  licenses (portal query):', licRows);
}

if (fs.existsSync(altLicenseDb)) {
  console.log('\n=== ALT DB company_registration (if separate) ===');
  const alt = await openDb(altLicenseDb);
  console.log(await all(alt, 'SELECT id, company_name, msp_client_id FROM company_registration'));
  console.log(await all(alt, 'SELECT id, company_id, serial_number FROM license_activation'));
  alt.close();
}

lic.close();
portal.close();
