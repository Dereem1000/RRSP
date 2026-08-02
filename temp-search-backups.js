const sqlite3 = require('sqlite3');
const fs = require('fs');

const dbs = [
  'F:\\Computer Dynamics System v2\\data\\computer_dynamics.recovered-1784316596888.db',
  'F:\\Computer Dynamics System v2\\data\\computer_dynamics.restored-1784316422927.db',
  'F:\\Computer Dynamics System v2\\data\\showcase\\computer_dynamics.db',
];

const needle = 'lic-8ee4f64d';

for (const dbPath of dbs) {
  if (!fs.existsSync(dbPath)) continue;
  const db = new sqlite3.Database(dbPath);
  db.all(
    `SELECT la.serial_number, cr.company_name, cr.contact_person, cr.email, cr.msp_client_id
     FROM license_activation la JOIN company_registration cr ON la.company_id = cr.id
     WHERE lower(la.serial_number) = ?`,
    [needle],
    (err, rows) => {
      console.log(dbPath, JSON.stringify(rows));
      db.close();
    }
  );
}

// Also search license db backups if any
const licenseDb = 'F:\\Computer Dynamics System v2\\license_activation_system_new\\instance\\license_system.db';
const db2 = new sqlite3.Database(licenseDb);
db2.all('SELECT serial_number FROM license_activation', (e, all) => {
  const partial = all?.filter(r => (r.serial_number||'').toLowerCase().includes('8ee4'));
  console.log('Partial 8ee4 in license db:', partial);
  db2.close();
});
