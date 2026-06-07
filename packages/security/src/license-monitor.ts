import { Op } from 'sequelize';
import { Client, SecurityEvent, SystemConfig } from '@cd-v2/database';
import { logSecurityEvent } from './events';
import { isLicenseDbAvailable } from './license-paths';
import { whereCreatedSince } from './sequelize-time';

const ACTIVATION_BURST_THRESHOLD = 10;
const VALIDATION_FAIL_THRESHOLD = 50;
const WINDOW_MINUTES = 5;

export async function runLicenseIntegrityChecks(): Promise<{ alerts: number }> {
  if (!isLicenseDbAvailable()) {
    return { alerts: 0 };
  }

  const db = await import('./license-db');
  let alerts = 0;

  const expiredActive = await db.countExpiredButActive();
  if (expiredActive > 0) {
    const fixed = await db.deactivateExpiredActiveLicenses();
    if (fixed.deactivated > 0) {
      const created = await logSecurityEvent({
        eventType: 'license_integrity',
        severity: 'low',
        description: `Auto-deactivated ${fixed.deactivated} expired license(s) still marked active`,
        details: {
          pattern: 'expired_but_active_auto_fixed',
          count: fixed.deactivated,
          serials: fixed.serials,
        },
        skipDedup: true,
      });
      if (created) alerts++;
    }

    const remaining = await db.countExpiredButActive();
    if (remaining > 0) {
      const stale = await db.queryExpiredButActiveLicenses();
      const created = await logSecurityEvent({
        eventType: 'license_integrity',
        severity: 'high',
        description: `${remaining} license(s) marked active but past expiration`,
        details: {
          pattern: 'expired_but_active',
          count: remaining,
          licenses: stale,
        },
      });
      if (created) alerts++;
    }
  }

  const recentActivations = await db.countRecentActivations(WINDOW_MINUTES);
  if (recentActivations >= ACTIVATION_BURST_THRESHOLD) {
    const created = await logSecurityEvent({
      eventType: 'suspicious_license_activity',
      severity: 'high',
      description: `License activation burst: ${recentActivations} new activations in ${WINDOW_MINUTES} minutes`,
      details: { pattern: 'activation_burst', count: recentActivations },
    });
    if (created) alerts++;
  }

  const failedValidations = await db.countRecentValidationFailures(WINDOW_MINUTES);
  if (failedValidations >= VALIDATION_FAIL_THRESHOLD) {
    const created = await logSecurityEvent({
      eventType: 'suspicious_license_activity',
      severity: 'medium',
      description: `High failed license validations: ${failedValidations} in ${WINDOW_MINUTES} minutes`,
      details: { pattern: 'validation_fail_burst', count: failedValidations },
    });
    if (created) alerts++;
  }

  const mspMismatches = await runMspLicenseConsistencyCheck();
  alerts += mspMismatches;

  return { alerts };
}

async function runMspLicenseConsistencyCheck(): Promise<number> {
  const db = await import('./license-db');
  let alerts = 0;
  const licenses = await db.queryLicenseActivations();
  const mspIds = new Set(
    licenses.map((l) => l.msp_client_id).filter((id): id is string => Boolean(id))
  );

  if (mspIds.size === 0) return 0;

  const clients = await Client.findAll({
    where: { id: { [Op.in]: [...mspIds] } },
    attributes: ['id', 'name', 'email', 'isActive'],
  });
  const clientMap = new Map(clients.map((c) => [c.id, c]));

  for (const lic of licenses) {
    if (!lic.msp_client_id) continue;
    const client = clientMap.get(lic.msp_client_id);
    if (!client) {
      const created = await logSecurityEvent({
        eventType: 'license_msp_mismatch',
        severity: 'medium',
        description: `License serial ${lic.serial_number} references unknown MSP client ${lic.msp_client_id}`,
        details: { serial: lic.serial_number, mspClientId: lic.msp_client_id },
      });
      if (created) alerts++;
      continue;
    }

    if (!client.isActive && lic.is_active) {
      const created = await logSecurityEvent({
        eventType: 'license_msp_mismatch',
        severity: 'medium',
        description: `Active license ${lic.serial_number} for inactive MSP client ${client.name}`,
        details: { serial: lic.serial_number, clientId: client.id },
      });
      if (created) alerts++;
    }
  }

  return alerts;
}

export async function getLicenseMonitoringSummary() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where24h = { ...whereCreatedSince(since24h), isActive: true };

  const [integrity, suspicious, mismatch, apiOffline] = await Promise.all([
    SecurityEvent.count({ where: { ...where24h, eventType: 'license_integrity' } }),
    SecurityEvent.count({ where: { ...where24h, eventType: 'suspicious_license_activity' } }),
    SecurityEvent.count({ where: { ...where24h, eventType: 'license_msp_mismatch' } }),
    SecurityEvent.count({ where: { ...where24h, eventType: 'license_api_offline' } }),
  ]);

  const dbAvailable = isLicenseDbAvailable();
  let licenseCount = 0;
  let activeCount = 0;
  if (dbAvailable) {
    const db = await import('./license-db');
    const rows = await db.queryLicenseActivations();
    licenseCount = rows.length;
    activeCount = rows.filter((r) => {
      if (!r.is_active) return false;
      if (!r.expiration_date) return true;
      return new Date(r.expiration_date) > new Date();
    }).length;
  }

  return {
    dbAvailable,
    licenseCount,
    activeLicenseCount: activeCount,
    events24h: {
      integrity,
      suspicious,
      mismatch,
      apiOffline,
    },
  };
}

