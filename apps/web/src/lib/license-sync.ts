import type { Client } from '@cd-v2/database';
import {
  ACTIVATION_FEATURES,
  FEATURE_TO_LICENSE_KEY,
  getActivationFeatures,
  mapServiceLevelToLicense,
  type ActivationFeature,
} from '@/lib/license-constants';
import {
  generateCompanySerial,
  generateLicenseSerial,
} from '@/lib/license-serial';
import { all, get, run, withLicenseDb } from '@/lib/license-service';

function buildLicenseFeaturesForFeature(mspFeature: ActivationFeature): Record<string, boolean> {
  const licenseKey = FEATURE_TO_LICENSE_KEY[mspFeature];
  const base: Record<string, boolean> = {
    inventory_management: true,
    advanced_reporting: true,
    api_access: true,
    multi_location: true,
    pos_systems: false,
    restaurant_management: false,
    document_management: false,
    ecommerce_websites: false,
    auto_system: false,
    distribution_system: false,
    reporting_analytics: false,
    customer_management: false,
  };
  if (licenseKey in base) base[licenseKey] = true;
  return base;
}

export async function syncClientToLicenseSystem(client: Client) {
  const activationFeatures = getActivationFeatures(client.features);
  if (activationFeatures.length === 0) {
    return { success: false, message: 'No activation features selected — nothing to sync' };
  }

  const serviceConfig = mapServiceLevelToLicense(client.serviceLevel);
  const now = new Date().toISOString();
  const exp = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

  return withLicenseDb(async (db) => {
    type CompanyRef = { id: number; serial_number: string };

    let company: CompanyRef | undefined = (await get(
      db,
      `SELECT id, serial_number FROM company_registration WHERE msp_client_id = ?`,
      [client.id]
    )) as CompanyRef | undefined;

    if (!company) {
      const serial = generateCompanySerial(client.id);
      const { lastID } = await run(
        db,
        `INSERT INTO company_registration (company_name, contact_person, email, phone, address, serial_number, msp_client_id, registration_date, created_at, is_verified)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
        [
          client.companyName || client.name,
          client.contactPerson || client.name,
          client.email,
          client.phone ?? '',
          client.address ?? '',
          serial,
          client.id,
          now,
          now,
        ]
      );
      company = { id: lastID, serial_number: serial };
    } else {
      await run(
        db,
        `UPDATE company_registration SET company_name = ?, contact_person = ?, email = ?, phone = ?, address = ? WHERE id = ?`,
        [
          client.companyName || client.name,
          client.contactPerson || client.name,
          client.email,
          client.phone ?? '',
          client.address ?? '',
          company.id,
        ]
      );
    }

    const existing = (await all(
      db,
      `SELECT id, serial_number, features FROM license_activation WHERE company_id = ?`,
      [company.id]
    )) as Array<{ id: number; serial_number: string; features: string | null }>;

    const created: number[] = [];
    const updated: number[] = [];

    for (const mspFeature of activationFeatures) {
      const licenseFeatures = buildLicenseFeaturesForFeature(mspFeature);
      const licenseKey = FEATURE_TO_LICENSE_KEY[mspFeature];
      const match = existing.find((row) => {
        if (!row.features) return false;
        try {
          const f = JSON.parse(row.features) as Record<string, boolean>;
          return Boolean(f[licenseKey]);
        } catch {
          return false;
        }
      });

      if (match) {
        await run(
          db,
          `UPDATE license_activation SET license_type = ?, max_users = ?, service_level = ?, features = ?, updated_at = ? WHERE id = ?`,
          [
            serviceConfig.licenseType,
            serviceConfig.maxUsers,
            client.serviceLevel ?? 'basic',
            JSON.stringify(licenseFeatures),
            now,
            match.id,
          ]
        );
        updated.push(match.id);
      } else if (existing.some((row) => {
        if (!row.features) return false;
        try {
          const f = JSON.parse(row.features) as Record<string, boolean>;
          return Boolean(f[licenseKey]);
        } catch {
          return false;
        }
      })) {
        // Company already has a license for this system (may be bound to a device).
        // Issue extra device licenses from the License GUI — do not auto-create duplicates.
      } else {
        const licenseSerial = generateLicenseSerial({
          mspFeature,
          mspClientId: client.id,
          deviceSeat: 1,
        });
        const { lastID } = await run(
          db,
          `INSERT INTO license_activation (serial_number, company_id, license_type, service_level, max_users, features, activation_date, expiration_date, is_active, created_at, updated_at)
           VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0, ?, ?)`,
          [
            licenseSerial,
            company.id,
            serviceConfig.licenseType,
            client.serviceLevel ?? 'basic',
            serviceConfig.maxUsers,
            JSON.stringify(licenseFeatures),
            now,
            exp,
            now,
            now,
          ]
        );
        created.push(lastID);
      }
    }

    return {
      success: true,
      message: `Synced ${activationFeatures.length} feature(s) to license system`,
      companyId: company.id,
      licensesCreated: created.length,
      licensesUpdated: updated.length,
      pendingActivation: created.length,
    };
  });
}

export function clientHasActivationFeatures(client: { features?: unknown }) {
  return getActivationFeatures(client.features).length > 0;
}

export { ACTIVATION_FEATURES };
