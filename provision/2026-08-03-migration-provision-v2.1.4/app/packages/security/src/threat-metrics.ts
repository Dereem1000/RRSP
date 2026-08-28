import { Op } from 'sequelize';
import { SecurityEvent, SystemConfig } from '@cd-v2/database';
import { getFeatureSnapshot } from './features';
import { loadBlockedIps, SecurityHttpKeys } from './http-guard';
import { whereCreatedSince } from './sequelize-time';

const INTRUSION_TYPES = [
  'threat_detected',
  'intrusion_detected',
  'bot_detected',
  'sql_injection',
  'xss_attempt',
  'path_traversal',
  'ip_blocked',
];

export async function getThreatMetrics() {
  const since24h = new Date(Date.now() - 24 * 60 * 60 * 1000);
  const where24h = { ...whereCreatedSince(since24h), isActive: true };
  const features = await getFeatureSnapshot();
  const blocked = await loadBlockedIps();

  const [intrusionEvents, botDetected, botBlocked, rateLimited, repairAttempts, repairSuccess] =
    await Promise.all([
      SecurityEvent.count({
        where: { ...where24h, eventType: { [Op.in]: INTRUSION_TYPES } },
      }),
      SecurityEvent.count({ where: { ...where24h, eventType: 'bot_detected' } }),
      SecurityEvent.count({ where: { ...where24h, eventType: 'ip_blocked' } }),
      SecurityEvent.count({ where: { ...where24h, eventType: 'rate_limited' } }),
      SecurityEvent.count({ where: { ...where24h, eventType: 'file_repair_attempted' } }),
      SecurityEvent.count({ where: { ...where24h, eventType: 'file_repair_succeeded' } }),
    ]);

  const intrusionEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.intrusionEnabled, true)) !== false;
  const botEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.botEnabled, true)) !== false;
  const captchaEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.botCaptchaEnabled, false)) === true;
  const repairEnabled =
    (await SystemConfig.getConfig<boolean>(SecurityHttpKeys.repairEnabled, false)) === true;

  return {
    features,
    intrusion: {
      enabled: intrusionEnabled,
      threats24h: intrusionEvents,
      blockedIps: blocked.length,
      rateLimited24h: rateLimited,
    },
    bot: {
      enabled: botEnabled,
      detected24h: botDetected,
      blocked24h: botBlocked,
      captchaEnabled,
      turnstileConfigured: Boolean(process.env.TURNSTILE_SECRET_KEY?.trim()),
    },
    activity: {
      suspicious24h: features.activityMonitor.suspicious24h,
      failedLogins24h: features.activityMonitor.failedLogins24h,
    },
    repair: {
      enabled: repairEnabled,
      attempted24h: repairAttempts,
      succeeded24h: repairSuccess,
    },
    blockedIps: blocked,
    license: await (async () => {
      const { checkLicenseApiHealth } = await import('./license-health');
      const { getLicenseMonitoringSummary } = await import('./license-monitor');
      const [apiHealth, summary] = await Promise.all([
        checkLicenseApiHealth({ logOffline: false, retries: 2, retryDelayMs: 1500 }),
        getLicenseMonitoringSummary(),
      ]);
      return { ...apiHealth, ...summary };
    })(),
  };
}
