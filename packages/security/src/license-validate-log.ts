import { logSecurityEvent } from './events';

/** Log validation proxy outcomes from Next.js (no license DB dependency). */
export async function logLicenseValidateAttempt(input: {
  ip: string;
  serial?: string;
  success: boolean;
  blocked?: boolean;
  message?: string;
}) {
  if (input.blocked) {
    await logSecurityEvent({
      eventType: 'license_validate_blocked',
      severity: 'medium',
      description: `License validate blocked for ${input.serial ?? 'unknown serial'}`,
      ipAddress: input.ip,
      details: { serial: input.serial, message: input.message },
    });
    return;
  }

  await logSecurityEvent({
    eventType: input.success ? 'license_validate_success' : 'license_validate_failed',
    severity: input.success ? 'low' : 'medium',
    description: `License validate ${input.success ? 'ok' : 'failed'}: ${input.serial ?? '—'}`,
    ipAddress: input.ip,
    outcome: input.success ? 'allowed' : 'blocked',
    details: { serial: input.serial, message: input.message },
  });
}
