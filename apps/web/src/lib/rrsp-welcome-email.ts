import { getActivationFeatures } from '@/lib/license-constants';
import {
  escapeHtml,
  getEmailBrand,
  infoRow,
  infoTable,
  paragraph,
  primaryButton,
  renderEmailLayout,
} from '@/lib/email-templates';
import { buildRrmsShopLoginUrl } from '@/lib/rrsp-shop-login-shared';
import { parseRrspShopStaffSettings } from '@/lib/rrsp-shop-staff';
import {
  getRrspModules,
  RRSP_MODULE_LABELS,
  RRSP_MODULES,
  type RrspModule,
} from '@/lib/rrsp';

export const RRMS_LEARN_MORE_URL = 'https://www.computerdynamicstt.com/rrms-learn-more.html';

export type WelcomeEmailVariant = 'portal' | 'rrsp-full' | 'rrsp-marketplace';

const RRSP_MODULE_WELCOME_BLURB: Record<RrspModule, string> = {
  tickets: 'Create and manage repair tickets — open, in progress, and resolved jobs.',
  orders: 'Track parts and materials orders tied to repair work.',
  parts: 'Manage inventory in My Stock and access the parts marketplace.',
  sales: 'Record and track shop sales.',
  clients: 'Manage customer profiles, billing, and notes.',
  accounting: 'Create and manage invoices and quotes.',
  pos: 'Counter sales and checkout with POS inventory.',
};

type WelcomeEmailCommon = {
  contactPerson?: string | null;
  username: string;
  tempPassword: string;
  portalUrl: string;
  servicePlanData?: unknown;
  companyName?: string | null;
  clientName?: string | null;
  origin?: string;
  test?: boolean;
};

function resolveRrmsWelcomeLogin(options: WelcomeEmailCommon) {
  const { shopLoginSlug } = parseRrspShopStaffSettings(options.servicePlanData, {
    companyName: options.companyName,
    name: options.clientName,
  });
  const signInUrl = buildRrmsShopLoginUrl(options.portalUrl, shopLoginSlug);
  return { signInUrl, shopLoginSlug };
}

export function resolveWelcomeEmailVariant(
  features?: unknown,
  servicePlanData?: unknown
): WelcomeEmailVariant {
  if (!getActivationFeatures(features).includes('rrsp')) return 'portal';

  const modules = getRrspModules(servicePlanData);
  const enabled = RRSP_MODULES.filter((module) => modules[module] === true);
  if (enabled.length === 1 && enabled[0] === 'parts') {
    return 'rrsp-marketplace';
  }
  return 'rrsp-full';
}

export function getEnabledRrspModulesForWelcome(servicePlanData?: unknown): RrspModule[] {
  const modules = getRrspModules(servicePlanData);
  const enabled = RRSP_MODULES.filter((module) => modules[module] === true);
  return enabled.length > 0 ? enabled : [...RRSP_MODULES];
}

function welcomeCredentialsSection(
  signInUrl: string,
  username: string,
  tempPassword: string,
  shopLoginSlug?: string
) {
  const rows = [
    infoRow(
      'Sign-in URL',
      `<a href="${escapeHtml(signInUrl)}" style="color:#4f46e5;font-weight:600;">${escapeHtml(signInUrl)}</a>`
    ),
    infoRow('Username', `<strong>${escapeHtml(username)}</strong>`),
    infoRow(
      'Temporary password',
      `<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">${escapeHtml(tempPassword)}</code>`
    ),
  ];
  if (shopLoginSlug) {
    rows.push(
      infoRow(
        'Staff sign-in format',
        `<code style="background:#f1f5f9;padding:2px 6px;border-radius:4px;">username@${escapeHtml(shopLoginSlug)}</code>`
      )
    );
  }
  return infoTable(rows.join(''));
}

function welcomePasswordNoticeHtml() {
  return `<div style="margin:16px 0;padding:14px 16px;background:#eef2ff;border-radius:10px;color:#3730a3;font-size:14px;"><strong>Important:</strong> You will be prompted to set a new password on your first login.</div>`;
}

function rrspModuleListHtml(modules: RrspModule[]) {
  const items = modules
    .map(
      (module) =>
        `<li><strong>${escapeHtml(RRSP_MODULE_LABELS[module])}</strong> — ${escapeHtml(RRSP_MODULE_WELCOME_BLURB[module])}</li>`
    )
    .join('');
  return `<ul style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">${items}</ul>`;
}

export async function buildRrspFullWelcomeEmailHtml(
  options: WelcomeEmailCommon
) {
  const brand = await getEmailBrand();
  const name = escapeHtml(options.contactPerson || 'Valued Client');
  const enabledModules = getEnabledRrspModulesForWelcome(options.servicePlanData);
  const { signInUrl, shopLoginSlug } = resolveRrmsWelcomeLogin(options);

  const bodyHtml = [
    paragraph(`Dear ${name},`),
    paragraph(
      'Welcome to the <strong>Repair Report Service Platform (RRSP)</strong>. Your shop portal account has been created and is ready to use.'
    ),
    welcomeCredentialsSection(signInUrl, options.username, options.tempPassword, shopLoginSlug),
    welcomePasswordNoticeHtml(),
    shopLoginSlug
      ? paragraph(
          'Use the sign-in URL above for your shop portal. After you enable staff login under <strong>Business info</strong>, team members use the same URL with <strong>username@' +
            escapeHtml(shopLoginSlug) +
            '</strong> and the permissions you assign on the <strong>Staff</strong> tab.'
        )
      : '',
    paragraph('<strong>What you can do in RRSP</strong>'),
    paragraph('Based on your account setup, your shop has access to:'),
    rrspModuleListHtml(enabledModules),
    paragraph('<strong>Getting started</strong>'),
    `<ol style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
      <li>Sign in using the credentials above</li>
      <li>Set your new password when prompted</li>
      <li>Explore your enabled RRSP modules from the portal menu</li>
    </ol>`,
    primaryButton('Open shop sign-in page', signInUrl),
    paragraph(
      `If you need help with setup, training, or activation, contact ${escapeHtml(brand.companyName)} support.`
    ),
  ].join('');

  const prefix = options.test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin: options.origin,
    eyebrow: 'Repair Report Service Platform',
    title: 'Welcome to RRSP',
    preheader: 'Your repair shop portal is ready — sign in to get started',
    bodyHtml,
  });

  return {
    subject: `${prefix}Welcome to ${brand.companyName} — Your RRSP Portal Access`,
    ...rendered,
  };
}

export async function buildRrspMarketplaceWelcomeEmailHtml(options: WelcomeEmailCommon) {
  const brand = await getEmailBrand();
  const name = escapeHtml(options.contactPerson || 'Valued Client');
  const { signInUrl, shopLoginSlug } = resolveRrmsWelcomeLogin(options);
  const marketplaceUrl = signInUrl.includes('/login/shop/')
    ? signInUrl.replace(/\/login\/shop\/[^/?#]+/, '/rrsp/parts')
    : options.portalUrl.replace(/\/login\/?$/, '/rrsp/parts');

  const bodyHtml = [
    paragraph(`Dear ${name},`),
    paragraph(
      'Welcome to the <strong>RRMS Parts Marketplace</strong>. Your account has been set up for marketplace access — you can manage your shop inventory, list parts for sale, and request parts from other shops on the network.'
    ),
    welcomeCredentialsSection(signInUrl, options.username, options.tempPassword, shopLoginSlug),
    welcomePasswordNoticeHtml(),
    shopLoginSlug
      ? paragraph(
          'Sign in at your dedicated shop URL above. Enable staff login under <strong>Business info</strong> when you are ready for team members to use the same page with <strong>username@' +
            escapeHtml(shopLoginSlug) +
            '</strong>.'
        )
      : '',
    paragraph('<strong>What you can do</strong>'),
    `<ul style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
      <li><strong>My Stock</strong> — manage your shop inventory in one place</li>
      <li><strong>List for sale</strong> — choose which stock is available on the marketplace</li>
      <li><strong>Request parts</strong> — search, compare, and request parts you need for the bench</li>
      <li><strong>Fulfill orders</strong> — receive and process incoming marketplace orders</li>
      <li><strong>Delivery handled by Computer Dynamics</strong> — we collect and deliver; no self-pickup required</li>
    </ul>`,
    paragraph('<strong>Learn more about the full RRMS</strong>'),
    paragraph(
      `<a href="${escapeHtml(RRMS_LEARN_MORE_URL)}" style="color:#4f46e5;font-weight:600;">Repair Report Management System overview →</a>`
    ),
    `<div style="margin:16px 0;padding:14px 16px;background:#f8fafc;border-left:4px solid #6366f1;border-radius:0 10px 10px 0;color:#334155;font-size:14px;line-height:1.6;"><strong>A note about marketplace availability</strong><br /><br />We are actively growing the RRMS repair shop network. As more shops join and list inventory, the range of available parts will continue to expand. At this stage, marketplace listings may be limited — we appreciate your patience as the network is populated. Listing your own surplus stock helps other shops and strengthens the marketplace for everyone.</div>`,
    paragraph('<strong>Getting started</strong>'),
    `<ol style="margin:0 0 16px;padding-left:20px;color:#334155;font-size:14px;line-height:1.8;">
      <li>Sign in and set your new password</li>
      <li>Add or review your inventory in <strong>My Stock</strong></li>
      <li>List parts you are ready to sell</li>
      <li>Browse and request parts when you need them for a job</li>
    </ol>`,
    primaryButton('Open shop sign-in page', signInUrl),
    paragraph(
      `After sign-in, open the marketplace from your portal menu or go to <a href="${escapeHtml(marketplaceUrl)}" style="color:#4f46e5;font-weight:600;">${escapeHtml(marketplaceUrl)}</a>.`
    ),
    paragraph(
      `If you have questions about listing stock, buy requests, or delivery, contact ${escapeHtml(brand.companyName)} support.`
    ),
  ].join('');

  const prefix = options.test ? '[TEST] ' : '';
  const rendered = await renderEmailLayout({
    brand,
    origin: options.origin,
    eyebrow: 'Parts Marketplace',
    title: 'Welcome to the RRMS Marketplace',
    preheader:
      'Your marketplace access is ready — list stock, request parts, and let CD handle delivery',
    bodyHtml,
  });

  return {
    subject: `${prefix}Welcome to the RRMS Parts Marketplace — ${brand.companyName}`,
    ...rendered,
  };
}
