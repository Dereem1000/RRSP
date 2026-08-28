import { Client } from '@cd-v2/database';
import path from 'path';
import sqlite3 from 'sqlite3';
import { getMonorepoRoot } from '@cd-v2/database';

/**
 * Fix for license-msp mismatch:
 * Activates MSP client "JOHANN JOHN ANTHONY DOO" who has an active license
 * Serial: CD-LIC-AUTO-1C556303-01CAC5CCE7EB464A
 */

interface LicenseRow {
  id: number;
  serial_number: string;
  is_active: number;
  msp_client_id: string | null;
  company_name: string;
}

async function openLicenseDb(): Promise<sqlite3.Database> {
  const v2Root = getMonorepoRoot();
  const dbPath = path.join(v2Root, 'license_activation_system_new', 'instance', 'license_system.db');

  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(dbPath, (err) => {
      if (err) reject(new Error(`License DB not found at ${dbPath}: ${err.message}`));
      else resolve(db);
    });
  });
}

function queryLicenseDb(db: sqlite3.Database, sql: string, params: unknown[] = []): Promise<LicenseRow[]> {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve((rows as LicenseRow[]) ?? [])));
  });
}

async function main() {
  try {
    console.log('🔍 Finding license with serial: CD-LIC-AUTO-1C556303-01CAC5CCE7EB464A');

    const licenseDb = await openLicenseDb();

    // Query for the license
    const licenses = await queryLicenseDb(
      licenseDb,
      `
        SELECT la.id, la.serial_number, la.is_active, cr.msp_client_id, cr.company_name
        FROM license_activation la
        JOIN company_registration cr ON la.company_id = cr.id
        WHERE la.serial_number = ?
      `,
      ['CD-LIC-AUTO-1C556303-01CAC5CCE7EB464A']
    );

    if (licenses.length === 0) {
      console.error('❌ License not found');
      process.exit(1);
    }

    const license = licenses[0];
    console.log(`✅ Found license: ${license.serial_number}`);
    console.log(`   Active: ${license.is_active === 1 ? 'Yes' : 'No'}`);
    console.log(`   Company: ${license.company_name}`);
    console.log(`   MSP Client ID: ${license.msp_client_id}`);

    if (!license.msp_client_id) {
      console.error('❌ License has no MSP client ID');
      process.exit(1);
    }

    // Find and update the client
    console.log(`\n🔍 Finding MSP Client with ID: ${license.msp_client_id}`);
    const client = await Client.findByPk(license.msp_client_id);

    if (!client) {
      console.error(`❌ MSP Client not found: ${license.msp_client_id}`);
      process.exit(1);
    }

    console.log(`✅ Found MSP Client: ${client.name}`);
    console.log(`   Email: ${client.email}`);
    console.log(`   Current Status: isActive = ${client.isActive}`);

    if (client.isActive) {
      console.log('\n✓ Client is already active. No action needed.');
      process.exit(0);
    }

    // Update the client to be active
    console.log(`\n⚙️  Activating MSP client...`);
    await client.update({ isActive: true });
    console.log(`✅ Successfully activated MSP client: ${client.name}`);

    console.log('\n📊 Final State:');
    const updated = await Client.findByPk(license.msp_client_id);
    console.log(`   Client: ${updated?.name}`);
    console.log(`   isActive: ${updated?.isActive}`);
    console.log(`   License: ${license.serial_number}`);
    console.log(`   License Active: ${license.is_active === 1 ? 'Yes' : 'No'}`);

    console.log('\n✨ Mismatch resolved! The next security scan will confirm.');

    licenseDb.close();
  } catch (error) {
    console.error('❌ Error:', error instanceof Error ? error.message : String(error));
    process.exit(1);
  }
}

main();
