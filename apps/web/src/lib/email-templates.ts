import { getCompanySettings } from '@/lib/company-settings';
import { getEmailConfig } from '@/lib/email';
import { prepareEmailLogo, type BrandedEmailContent } from '@/lib/email-logo';
import { getConfiguredSiteUrl, isUsablePublicOrigin, normalizeSiteBaseUrl } from '@/lib/site-url';
import type { Attachment } from 'nodemailer/lib/mailer';

export type EmailBrand = {
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  companyEmail: string;
  companyLogo: string;
  closingMessage: string;
};

export async function getEmailBrand(): Promise<EmailBrand> {
  const [company, email] = await Promise.all([getCompanySettings(), getEmailConfig()]);
  return {
    companyName: company.companyName,
    companyAddress: company.companyAddress,
    companyPhone: company.companyPhone || email.companyPhone,
    companyWebsite: company.companyWebsite,
    companyEmail: email.fromEmail || email.user,
    companyLogo: company.companyLogo,
    closingMessage: company.closingMessage,
  };
}

export function resolveLogoUrl(logo: string | undefined | null, origin?: string): string | null {
  if (!logo) return null;
  if (logo.startsWith('data:') || logo.startsWith('http://') || logo.startsWith('https://')) {
    return logo;
  }
  const base =
    getConfiguredSiteUrl() ||
    (isUsablePublicOrigin(origin) ? normalizeSiteBaseUrl(origin) : null) ||
    'http://localhost:3000';
  const path = logo.startsWith('/') ? logo : `/${logo}`;
  return `${base}${path}`;
}

/** Encode URL for HTML attribute without breaking cid:, data:, or query strings. */
function encodeAttrUrl(url: string): string {
  return url.replace(/"/g, '&quot;');
}

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function contactLine(brand: EmailBrand): string {
  const parts: string[] = [];
  if (brand.companyPhone) parts.push(`Phone: ${escapeHtml(brand.companyPhone)}`);
  if (brand.companyEmail) {
    parts.push(
      `Email: <a href="mailto:${escapeHtml(brand.companyEmail)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(brand.companyEmail)}</a>`
    );
  }
  if (brand.companyWebsite) {
    const url = brand.companyWebsite.startsWith('http')
      ? brand.companyWebsite
      : `https://${brand.companyWebsite}`;
    parts.push(
      `Web: <a href="${escapeHtml(url)}" style="color:#4f46e5;text-decoration:none;">${escapeHtml(brand.companyWebsite.replace(/^https?:\/\//, ''))}</a>`
    );
  }
  return parts.join(' &nbsp;|&nbsp; ');
}

function logoBlock(brand: EmailBrand, logoUrl: string | null): string {
  if (logoUrl) {
    return `<img src="${encodeAttrUrl(logoUrl)}" alt="${escapeHtml(brand.companyName)}" width="180" style="display:block;max-width:180px;max-height:72px;height:auto;margin:0 auto 12px;border:0;" />`;
  }
  return `<div style="font-size:22px;font-weight:700;color:#1e293b;letter-spacing:-0.02em;">${escapeHtml(brand.companyName)}</div>`;
}

type LayoutOptions = {
  brand: EmailBrand;
  origin?: string;
  eyebrow: string;
  title: string;
  preheader?: string;
  bodyHtml: string;
  footerNote?: string;
};

export async function renderEmailLayout({
  brand,
  origin,
  eyebrow,
  title,
  preheader,
  bodyHtml,
  footerNote = 'This is an automated message from your service provider. Please do not reply directly to this email.',
}: LayoutOptions): Promise<BrandedEmailContent> {
  const logo = await prepareEmailLogo(brand.companyLogo);
  const logoUrl = logo.imgSrc;
  const attachments: Attachment[] = logo.attachment ? [logo.attachment] : [];
  const addressHtml = brand.companyAddress
    ? `<div style="margin-top:6px;color:#64748b;font-size:13px;line-height:1.5;">${escapeHtml(brand.companyAddress).replace(/\n/g, '<br />')}</div>`
    : '';
  const contactHtml = contactLine(brand)
    ? `<div style="margin-top:8px;color:#64748b;font-size:13px;line-height:1.5;">${contactLine(brand)}</div>`
    : '';

  return {
    html: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>${escapeHtml(title)}</title>
  ${preheader ? `<meta name="description" content="${escapeHtml(preheader)}" />` : ''}
</head>
<body style="margin:0;padding:0;background:#f1f5f9;font-family:Arial,Helvetica,sans-serif;color:#334155;line-height:1.6;">
  ${preheader ? `<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${escapeHtml(preheader)}</div>` : ''}
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr>
      <td align="center">
        <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:640px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;overflow:hidden;">
          <tr>
            <td style="padding:28px 32px 20px;text-align:center;background:linear-gradient(180deg,#f8fafc 0%,#ffffff 100%);border-bottom:1px solid #e2e8f0;">
              ${logoBlock(brand, logoUrl)}
              <div style="font-size:12px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">${escapeHtml(eyebrow)}</div>
              <div style="margin-top:8px;font-size:20px;font-weight:700;color:#0f172a;">${escapeHtml(title)}</div>
            </td>
          </tr>
          <tr>
            <td style="padding:28px 32px;">
              ${bodyHtml}
            </td>
          </tr>
          <tr>
            <td style="padding:0 32px 28px;">
              ${brand.closingMessage ? `<p style="margin:0 0 16px;color:#475569;font-size:14px;">${escapeHtml(brand.closingMessage)}</p>` : ''}
              <div style="padding:18px 20px;background:#f8fafc;border:1px solid #e2e8f0;border-radius:12px;text-align:center;">
                <div style="font-size:14px;font-weight:700;color:#0f172a;">${escapeHtml(brand.companyName)}</div>
                ${addressHtml}
                ${contactHtml}
                <div style="margin-top:14px;font-size:11px;color:#94a3b8;">${escapeHtml(footerNote)}</div>
              </div>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>`,
    attachments,
  };
}

export function infoRow(label: string, value: string): string {
  return `<tr>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#64748b;font-size:13px;font-weight:600;width:38%;vertical-align:top;">${escapeHtml(label)}</td>
    <td style="padding:10px 0;border-bottom:1px solid #f1f5f9;color:#0f172a;font-size:14px;vertical-align:top;">${value}</td>
  </tr>`;
}

export function infoTable(rows: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0 8px;border:1px solid #e2e8f0;border-radius:12px;overflow:hidden;">
    <tr><td style="padding:4px 16px;background:#f8fafc;">${rows}</td></tr>
  </table>`;
}

export function primaryButton(label: string, href: string, note?: string): string {
  return `<div style="text-align:center;margin:24px 0 8px;">
    <a href="${escapeHtml(href)}" style="display:inline-block;background:#4f46e5;color:#ffffff;padding:14px 28px;text-decoration:none;border-radius:10px;font-size:15px;font-weight:700;">${escapeHtml(label)}</a>
    ${note ? `<p style="margin:10px 0 0;font-size:12px;color:#64748b;">${escapeHtml(note)}</p>` : ''}
  </div>`;
}

export function statusBadge(label: string, color: string): string {
  return `<span style="display:inline-block;padding:4px 10px;border-radius:999px;background:${color};color:#ffffff;font-size:12px;font-weight:700;text-transform:uppercase;">${escapeHtml(label)}</span>`;
}

export function highlightBox(html: string): string {
  return `<div style="margin:16px 0;padding:16px;background:#f8fafc;border-left:4px solid #4f46e5;border-radius:0 10px 10px 0;color:#334155;font-size:14px;">${html}</div>`;
}

export function paragraph(text: string): string {
  return `<p style="margin:0 0 14px;color:#334155;font-size:15px;">${text}</p>`;
}
