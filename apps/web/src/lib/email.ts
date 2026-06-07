import nodemailer from 'nodemailer';
import type { Attachment } from 'nodemailer/lib/mailer';
import { SystemConfig } from '@cd-v2/database';
import {
  escapeHtml,
  getEmailBrand,
  infoRow,
  infoTable,
  paragraph,
  primaryButton,
  renderEmailLayout,
} from '@/lib/email-templates';

export { buildPortalUrl } from '@/lib/site-url';

export type EmailConfig = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  companyName: string;
  companyPhone: string;
  companyWebsite: string;
};

let transporter: nodemailer.Transporter | null = null;
let isConfigured = false;

export async function getEmailConfig(): Promise<EmailConfig> {
  const [enabled, host, port, secure, user, password, fromName, fromEmail, companyName, companyPhone, companyWebsite] =
    await Promise.all([
      SystemConfig.getConfig<boolean>('email_enabled', false),
      SystemConfig.getConfig<string>('email_host', ''),
      SystemConfig.getConfig<number>('email_port', 587),
      SystemConfig.getConfig<boolean>('email_secure', false),
      SystemConfig.getConfig<string>('email_user', ''),
      SystemConfig.getConfig<string>('email_password', ''),
      SystemConfig.getConfig<string>('email_from_name', 'Computer Dynamics'),
      SystemConfig.getConfig<string>('email_from_email', ''),
      SystemConfig.getConfig<string>('email_company_name', 'Computer Dynamics'),
      SystemConfig.getConfig<string>('email_company_phone', '+1-868-316-8851'),
      SystemConfig.getConfig<string>('email_company_website', ''),
    ]);

  return {
    enabled: Boolean(enabled),
    host: host ?? '',
    port: Number(port) || 587,
    secure: Boolean(secure),
    user: user ?? '',
    password: password ?? '',
    fromName: fromName ?? 'Computer Dynamics',
    fromEmail: fromEmail ?? user ?? '',
    companyName: companyName ?? 'Computer Dynamics',
    companyPhone: companyPhone ?? '+1-868-316-8851',
    companyWebsite: companyWebsite ?? '',
  };
}

export async function initializeEmail(): Promise<boolean> {
  try {
    const config = await getEmailConfig();
    if (!config.enabled || !config.host || !config.user || !config.password) {
      isConfigured = false;
      transporter = null;
      return false;
    }

    transporter = nodemailer.createTransport({
      host: config.host,
      port: config.port,
      secure: config.secure,
      auth: { user: config.user, pass: config.password },
      tls: { rejectUnauthorized: false },
    });

    await transporter.verify();
    isConfigured = true;
    return true;
  } catch (error) {
    console.error('[EMAIL] Failed to initialize:', error);
    isConfigured = false;
    transporter = null;
    return false;
  }
}

export async function sendEmail({
  to,
  subject,
  html,
  attachments = [],
}: {
  to: string;
  subject: string;
  html: string;
  attachments?: Attachment[];
}): Promise<boolean> {
  if (!isConfigured) {
    const ready = await initializeEmail();
    if (!ready) return false;
  }

  try {
    const config = await getEmailConfig();
    const result = await transporter!.sendMail({
      from: `"${config.fromName}" <${config.fromEmail}>`,
      to,
      subject,
      html,
      attachments,
    });
    console.log(`[EMAIL] Sent to ${to}: ${result.messageId}`);
    return true;
  } catch (error) {
    console.error('[EMAIL] Send failed:', error);
    return false;
  }
}

export async function buildWelcomeEmailHtml({
  contactPerson,
  username,
  tempPassword,
  portalUrl,
  origin,
  test,
}: {
  contactPerson?: string | null;
  username: string;
  tempPassword: string;
  portalUrl: string;
  origin?: string;
  test?: boolean;
}) {
  const brand = await getEmailBrand();
  const name = escapeHtml(contactPerson || 'Valued Client');

  const bodyHtml = [
    paragraph(`Dear ${name},`),
    paragraph('Your client portal account has been created. You can now access your IT services online.'),
    infoTable(
      [
        infoRow('Portal URL', `<a href="${escapeHtml(portalUrl)}" style="color:#4f46e5;font-weight:600;">${escapeHtml(portalUrl)}</a>`),
        infoRow('Username', `<strong>${escapeHtml(username)}</strong>`),
        infoRow('Temporary password', `<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(tempPassword)}</code>`),
      ].join('')
    ),
    `<div style="margin:16px 0;padding:14px 16px;background:#eef2ff;border-radius:10px;color:#3730a3;font-size:14px;"><strong>Important:</strong> You will be prompted to set a new password on your first login.</div>`,
    paragraph('<strong>What you can do in the portal</strong>'),
    `<ul style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
      <li>View and manage support tickets</li>
      <li>Access invoices and payment information</li>
      <li>Monitor service usage</li>
      <li>Update your profile</li>
    </ul>`,
    primaryButton('Open client portal', portalUrl),
  ].join('');

  const prefix = test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin,
    eyebrow: 'Client portal',
    title: 'Welcome to your client portal',
    preheader: `Your ${brand.companyName} portal account is ready`,
    bodyHtml,
  });
  return {
    subject: `${prefix}Welcome to ${brand.companyName} — Your Client Portal Access`,
    ...rendered,
  };
}

export async function sendClientWelcomeEmail({
  to,
  contactPerson,
  username,
  tempPassword,
  portalUrl,
  origin,
}: {
  to: string;
  contactPerson?: string | null;
  username: string;
  tempPassword: string;
  portalUrl: string;
  origin?: string;
}) {
  const { subject, html, attachments } = await buildWelcomeEmailHtml({
    contactPerson,
    username,
    tempPassword,
    portalUrl,
    origin,
  });

  return sendEmail({ to, subject, html, attachments });
}

export async function testEmailConnection() {
  const ready = await initializeEmail();
  if (!ready) {
    return { success: false, message: 'Email service is disabled or not configured' };
  }
  return { success: true, message: 'Email connection verified' };
}
