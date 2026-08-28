/** SystemConfig keys used by the v2 security platform (category: security). */
export const SecurityConfigKeys = {
  monitoringEnabled: 'ai_security_enabled',
  monitoringIntervalMs: 'security_monitor_interval_ms',
  threatLevel: 'security_threat_level',
  workerHeartbeat: 'security_worker_last_heartbeat',
  workerPid: 'security_worker_pid',
  workerVersion: 'security_worker_version',
  workerChecks: 'security_worker_checks_total',
  workerLastError: 'security_worker_last_error',
  emergencyActive: 'emergency_override_active',
  emergencyExpires: 'emergency_override_expires',
  emergencyAuthHash: 'emergency_auth_code_hash',
  fileBaselines: 'security_file_baselines',
  fileBaselinesVersion: 'security_file_baselines_version',
} as const;

export const SECURITY_WORKER_VERSION = '2.1.0';
export const DEFAULT_MONITOR_INTERVAL_MS = 60_000;
export const WORKER_STALE_MULTIPLIER = 2.5;
