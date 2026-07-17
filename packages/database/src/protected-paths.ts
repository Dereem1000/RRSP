/** License-related paths monitored for integrity and included in full backups. */
export function getLicenseProtectedFilePaths(): string[] {
  return [
    'license_activation_system_new/license_api_server.py',
    'license_activation_system_new/license_validator.py',
    'license_activation_system_new/license_response_signature.py',
    'license_activation_system_new/models.py',
    'apps/web/src/lib/license-api-proxy.ts',
    'apps/web/src/lib/license-service.ts',
    'apps/web/src/lib/license-constants.ts',
    'apps/web/src/app/api/license/validate/route.ts',
    'apps/web/src/app/api/license/status/route.ts',
    'apps/web/src/app/api/license/info/route.ts',
    'packages/security/src/license-monitor.ts',
    'packages/security/src/license-health.ts',
    'packages/security/src/license-db.ts',
  ];
}

/** Critical paths relative to monorepo root — integrity monitor + full backup (app/). */
export function getProtectedFilePaths(): string[] {
  return [
    // Monorepo / ops
    'package.json',
    'start.bat',
    'stop.bat',

    // Database layer
    'packages/database/src/connection.ts',
    'packages/database/src/models/User.ts',
    'packages/database/src/models/SystemConfig.ts',
    'packages/database/src/models/EmergencyOverride.ts',
    'packages/database/src/models/SecurityEvent.ts',

    // Security package (worker + domain logic)
    'packages/security/package.json',
    'packages/security/src/worker.ts',
    'packages/security/src/worker-cli.ts',
    'packages/security/src/monitoring.ts',
    'packages/security/src/emergency.ts',
    'packages/security/src/auth.ts',
    'packages/security/src/events.ts',
    'packages/security/src/protected-files.ts',
    'packages/security/src/activity-monitor.ts',
    'packages/security/src/intrusion-scan.ts',
    'packages/security/src/features.ts',
    'packages/security/src/sequelize-time.ts',
    'packages/security/src/file-repair.ts',
    'packages/security/src/http-guard.ts',

    // Portal auth + middleware
    'apps/web/src/lib/auth.ts',
    'apps/web/src/lib/jwt.ts',
    'apps/web/src/middleware.ts',

    // Security API surface
    'apps/web/src/app/api/security/platform-status/route.ts',
    'apps/web/src/app/api/security/toggle/route.ts',
    'apps/web/src/app/api/security/emergency-override/route.ts',
    'apps/web/src/app/api/security/emergency-override/disable/route.ts',
    'apps/web/src/app/api/security/emergency-status/route.ts',
    'apps/web/src/app/api/security/auth-code/route.ts',
    'apps/web/src/app/api/security/file-integrity/route.ts',
    'apps/web/src/app/api/security/events/route.ts',
    'apps/web/src/app/api/emergency/overrides/route.ts',

    // Licensing
    ...getLicenseProtectedFilePaths(),
  ];
}

/** Extra paths in full backups (recovery) but not integrity-monitored. */
export function getBackupOnlyPaths(): string[] {
  return [
    'packages/database/src/models/Backup.ts',
    'packages/database/src/protected-paths.ts',
    'packages/backup/package.json',
    'packages/backup/src/create.ts',
    'packages/backup/src/restore.ts',
    'packages/backup/src/extract-file.ts',
    'packages/backup/src/paths.ts',
    'packages/backup/src/scheduler.ts',
  ];
}

/** All repo-relative paths stored under app/ in full backup ZIPs. */
export function getBackupAppPaths(): string[] {
  const seen = new Set<string>();
  const paths: string[] = [];
  for (const rel of [...getProtectedFilePaths(), ...getBackupOnlyPaths()]) {
    if (!seen.has(rel)) {
      seen.add(rel);
      paths.push(rel);
    }
  }
  return paths;
}
