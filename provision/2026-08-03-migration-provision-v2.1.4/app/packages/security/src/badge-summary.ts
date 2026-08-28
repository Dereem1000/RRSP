import { getPlatformSecurityStatus, type PlatformSecurityStatus } from './monitoring';
import type { ThreatLevel, WorkerHealth } from './types';

export type SecurityBadgeIssue = {
  code: string;
  label: string;
};

export type SecurityBadgeSummary = {
  issueCount: number;
  threatLevel: ThreatLevel;
  workerHealth: WorkerHealth;
  licenseApi: string;
  bypassActive: boolean;
  securityScore: number;
  monitoringEnabled: boolean;
  issues: SecurityBadgeIssue[];
};

export function buildSecurityBadgeSummary(platform: PlatformSecurityStatus): SecurityBadgeSummary {
  const issues: SecurityBadgeIssue[] = [];

  if (!platform.monitoring.enabled) {
    issues.push({ code: 'monitoring_disabled', label: 'Security monitoring disabled' });
  }

  if (platform.worker.health === 'offline') {
    issues.push({ code: 'worker_offline', label: 'Security worker offline' });
  } else if (platform.worker.health === 'stale') {
    issues.push({ code: 'worker_stale', label: 'Security worker not responding' });
  }

  if (platform.monitoring.threatLevel === 'critical') {
    issues.push({ code: 'threat_critical', label: 'Critical threat level' });
  } else if (platform.monitoring.threatLevel === 'high') {
    issues.push({ code: 'threat_high', label: 'High threat level' });
  } else if (platform.monitoring.threatLevel === 'medium') {
    issues.push({ code: 'threat_medium', label: 'Elevated threat level' });
  }

  if (platform.license.status === 'offline') {
    issues.push({ code: 'license_api_offline', label: 'License API offline' });
  }

  const bypassActive = platform.emergency.isActive && !platform.emergency.isExpired;

  if (!bypassActive) {
    if (platform.features.fileIntegrity.enabled && platform.features.fileIntegrity.lastIssues24h > 0) {
      issues.push({
        code: 'file_integrity',
        label: `${platform.features.fileIntegrity.lastIssues24h} file integrity issue(s) (24h)`,
      });
    }
    if (platform.features.licenseMonitoring.suspicious24h > 0) {
      issues.push({
        code: 'license_suspicious',
        label: `${platform.features.licenseMonitoring.suspicious24h} license alert(s) (24h)`,
      });
    }
  }

  const recentCritical = platform.recentEvents.filter(
    (e) => e.severity === 'critical' || e.severity === 'high'
  );
  if (recentCritical.length > 0 && issues.length === 0) {
    issues.push({
      code: 'recent_events',
      label: `${recentCritical.length} recent high-severity event(s)`,
    });
  }

  return {
    issueCount: issues.length,
    threatLevel: platform.monitoring.threatLevel,
    workerHealth: platform.worker.health,
    licenseApi: platform.license.status,
    bypassActive,
    securityScore: platform.securityScore,
    monitoringEnabled: platform.monitoring.enabled,
    issues,
  };
}

export async function getSecurityBadgeSummary(): Promise<SecurityBadgeSummary> {
  const platform = await getPlatformSecurityStatus();
  return buildSecurityBadgeSummary(platform);
}
