/** Public marketing demo credentials — intentionally readable for live-demo flows. */
export const PUBLIC_DEMO_PASSWORD = 'Demo@2026!';

export type PublicDemoStaffLogin = {
  username: string;
  roleLabel: string;
  modules: string;
};

export type PublicDemoLoginProduct = {
  product: string;
  label: string;
  username: string;
  password: string;
  returnUrl: string;
  autoEnableShopDemo: boolean;
  staffLogins?: PublicDemoStaffLogin[];
};

/** Fixed showcase MSP client id — must match seed-showcase RRMS demo row. */
export const RRMS_SHOWCASE_CLIENT_ID = 'a1111111-1111-4111-8111-111111111111';

export const RRMS_DEMO_LOGIN_URL = '/login?demo=rrms&autostart=1&returnUrl=/rrsp';

export const RRMS_DEMO_SHOP_SLUG = 'rrmsrepairdemo';

const RRMS_OWNER_USERNAME = 'rrms-demo@rrmsrepair.demo';

export const PUBLIC_DEMO_LOGINS: Record<string, PublicDemoLoginProduct> = {
  rrms: {
    product: 'rrms',
    label: 'RRMS Repair Demo Shop',
    username: RRMS_OWNER_USERNAME,
    password: PUBLIC_DEMO_PASSWORD,
    returnUrl: '/rrsp',
    autoEnableShopDemo: true,
    staffLogins: [
      {
        username: `bench@${RRMS_DEMO_SHOP_SLUG}`,
        roleLabel: 'Bench Tech',
        modules: 'tickets, parts',
      },
      {
        username: `intake@${RRMS_DEMO_SHOP_SLUG}`,
        roleLabel: 'Intake',
        modules: 'tickets, customers, orders',
      },
      {
        username: `counter@${RRMS_DEMO_SHOP_SLUG}`,
        roleLabel: 'Front desk',
        modules: 'POS, accounting',
      },
    ],
  },
};

export function getPublicDemoLogin(product: string): PublicDemoLoginProduct | null {
  const key = String(product || '').trim().toLowerCase();
  return PUBLIC_DEMO_LOGINS[key] ?? null;
}

export function isRrmsDemoUser(username: string): boolean {
  const u = String(username || '').trim().toLowerCase();
  if (u === RRMS_OWNER_USERNAME.toLowerCase()) return true;
  const suffix = `@${RRMS_DEMO_SHOP_SLUG}`;
  return u.endsWith(suffix);
}
