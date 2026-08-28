import { SystemConfig } from '@cd-v2/database';
import { SecurityConfigKeys } from './config-keys';

const ALERT_EMAIL_KEY = 'security_alert_email';
const ALERT_WEBHOOK_KEY = 'security_alert_webhook_url';

export type SecurityAlertPayload = {
  eventType: string;
  severity: 'high' | 'critical';
  description: string;
  ipAddress?: string | null;
  userId?: number | null;
  createdAt: string;
};

function shouldAlert(severity: string): severity is 'high' | 'critical' {
  return severity === 'high' || severity === 'critical';
}

/** Skip noisy / expected operational events from outbound alerts. */
function shouldSkipAlert(eventType: string): boolean {
  return (
    eventType === 'emergency_override' ||
    eventType === 'system_change' ||
    eventType === 'license_validate_success' ||
    eventType === 'login_attempt'
  );
}

async function postWebhook(url: string, payload: SecurityAlertPayload): Promise<void> {
  await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      source: 'cd-v2-security',
      text: `[${payload.severity.toUpperCase()}] ${payload.eventType}: ${payload.description}`,
      ...payload,
    }),
    signal: AbortSignal.timeout(8_000),
  });
}

async function sendAlertEmail(to: string, payload: SecurityAlertPayload): Promise<void> {
  const [enabled, host, port, secure, user, password, fromName, fromEmail] = await Promise.all([
    SystemConfig.getConfig<boolean>('email_enabled', false),
    SystemConfig.getConfig<string>('email_host', ''),
    SystemConfig.getConfig<number>('email_port', 587),
    SystemConfig.getConfig<boolean>('email_secure', false),
    SystemConfig.getConfig<string>('email_user', ''),
    SystemConfig.getConfig<string>('email_password', ''),
    SystemConfig.getConfig<string>('email_from_name', 'Computer Dynamics Security'),
    SystemConfig.getConfig<string>('email_from_email', ''),
  ]);

  if (!enabled || !host || !user || !password) return;

  // nodemailer is available via the monorepo (apps/web); avoid hard package dep if missing.
  let nodemailer: typeof import('nodemailer');
  try {
    nodemailer = require('nodemailer') as typeof import('nodemailer');
  } catch {
    return;
  }

  const transporter = nodemailer.createTransport({
    host,
    port: Number(port) || 587,
    secure: Boolean(secure),
    auth: { user, pass: password },
  });

  const from = fromEmail?.trim() || user;
  await transporter.sendMail({
    from: `"${fromName || 'CD Security'}" <${from}>`,
    to,
    subject: `[Security ${payload.severity.toUpperCase()}] ${payload.eventType}`,
    text: [
      payload.description,
      '',
      `Type: ${payload.eventType}`,
      `Severity: ${payload.severity}`,
      payload.ipAddress ? `IP: ${payload.ipAddress}` : null,
      payload.userId != null ? `User ID: ${payload.userId}` : null,
      `At: ${payload.createdAt}`,
    ]
      .filter(Boolean)
      .join('\n'),
  });
}

/**
 * Fire-and-forget outbound notification for high/critical security events.
 * Configure via:
 * - env `SECURITY_ALERT_WEBHOOK_URL` / SystemConfig `security_alert_webhook_url`
 * - env `SECURITY_ALERT_EMAIL` / SystemConfig `security_alert_email` (uses portal SMTP settings)
 */
export async function maybeNotifySecurityAlert(input: {
  eventType: string;
  severity: string;
  description: string;
  ipAddress?: string | null;
  userId?: number | null;
}): Promise<void> {
  if (!shouldAlert(input.severity) || shouldSkipAlert(input.eventType)) return;

  // While emergency bypass is active, suppress outbound alerts (local maintenance / false positives).
  const bypass = await SystemConfig.getConfig<boolean>(SecurityConfigKeys.emergencyActive, false);
  if (bypass) {
    const expires = await SystemConfig.getConfig<string>(SecurityConfigKeys.emergencyExpires, '');
    if (!expires || new Date(expires) > new Date()) return;
  }

  const payload: SecurityAlertPayload = {
    eventType: input.eventType,
    severity: input.severity,
    description: input.description,
    ipAddress: input.ipAddress,
    userId: input.userId,
    createdAt: new Date().toISOString(),
  };

  const webhook =
    process.env.SECURITY_ALERT_WEBHOOK_URL?.trim() ||
    (await SystemConfig.getConfig<string>(ALERT_WEBHOOK_KEY, ''))?.trim() ||
    '';
  const email =
    process.env.SECURITY_ALERT_EMAIL?.trim() ||
    (await SystemConfig.getConfig<string>(ALERT_EMAIL_KEY, ''))?.trim() ||
    '';

  const tasks: Promise<void>[] = [];
  if (webhook) {
    tasks.push(
      postWebhook(webhook, payload).catch((err) => {
        console.error('[security-alert] webhook failed:', err instanceof Error ? err.message : err);
      })
    );
  }
  if (email) {
    tasks.push(
      sendAlertEmail(email, payload).catch((err) => {
        console.error('[security-alert] email failed:', err instanceof Error ? err.message : err);
      })
    );
  }

  if (tasks.length) await Promise.all(tasks);
}
