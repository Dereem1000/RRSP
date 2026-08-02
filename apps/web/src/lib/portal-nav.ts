import {
  Briefcase,
  Bot,
  Boxes,
  CalendarDays,
  LayoutDashboard,
  Package,
  PieChart,
  Receipt,
  Settings,
  ShoppingCart,
  Store,
  Target,
  Ticket,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';
import { RRSP_MODULE_HREF, RRSP_MODULE_LABELS, type RrspModule } from '@/lib/rrsp';

export type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  /** Shown in the mobile bottom tab bar for this role (max 4 per role). */
  mobileTab?: Partial<Record<'admin' | 'technician' | 'client', boolean>>;
  /** Optional section heading before this item (RRSP block). */
  section?: string;
};

export const PORTAL_NAV: PortalNavItem[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    icon: LayoutDashboard,
    roles: ['admin', 'technician', 'client'],
    mobileTab: { admin: true, technician: true, client: true },
  },
  {
    href: '/tickets',
    label: 'Tickets',
    icon: Ticket,
    roles: ['admin', 'technician', 'client'],
    mobileTab: { admin: true, technician: true, client: true },
  },
  {
    href: '/billing',
    label: 'Billing',
    icon: Receipt,
    roles: ['client'],
    mobileTab: { client: true },
  },
  {
    href: '/orders',
    label: 'Orders',
    icon: Package,
    roles: ['admin', 'technician', 'client'],
    mobileTab: { admin: true, client: true },
  },
  {
    href: '/parts',
    label: 'Parts',
    icon: Store,
    // Staff only — clients see Shop parts under /rrsp/parts when RRSP + parts module is on.
    roles: ['admin', 'technician'],
  },
  {
    href: '/pos',
    label: 'POS',
    icon: ShoppingCart,
    roles: ['admin', 'technician'],
    mobileTab: { admin: true, technician: true },
  },
  {
    href: '/sales',
    label: 'Sales',
    icon: Target,
    roles: ['admin', 'technician'],
  },
  {
    href: '/calendar',
    label: 'Calendar',
    icon: CalendarDays,
    roles: ['admin', 'technician'],
    mobileTab: { technician: true },
  },
  {
    href: '/clients',
    label: 'Clients',
    icon: Users,
    roles: ['admin', 'technician'],
    mobileTab: { admin: true },
  },
  {
    href: '/msp',
    label: 'MSP',
    icon: Briefcase,
    roles: ['admin', 'technician'],
  },
  {
    href: '/msp/systems',
    label: 'Management Systems',
    icon: Boxes,
    roles: ['admin', 'technician'],
  },
  {
    href: '/accounting',
    label: 'Accounting',
    icon: PieChart,
    roles: ['admin', 'technician'],
  },
  {
    href: '/developer-toolbox',
    label: 'Developer Toolbox',
    icon: Wrench,
    roles: ['admin'],
  },
  {
    href: '/settings',
    label: 'Settings',
    icon: Settings,
    roles: ['admin'],
  },
];

const RRSP_NAV_ICONS: Record<RrspModule, LucideIcon> = {
  tickets: Ticket,
  orders: Package,
  parts: Store,
  sales: Target,
  clients: Users,
  accounting: PieChart,
  pos: ShoppingCart,
};

export const PORTAL_NAV_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tickets': 'Tickets',
  '/billing': 'Billing',
  '/orders': 'Orders',
  '/parts': 'Parts',
  '/pos': 'POS',
  '/pos/inventory': 'POS Inventory',
  '/rrsp/pos/inventory': 'Shop POS Inventory',
  '/sales': 'Sales',
  '/calendar': 'Calendar',
  '/clients': 'Clients',
  '/msp': 'MSP',
  '/msp/systems': 'Management Systems',
  '/accounting': 'Accounting',
  '/developer-toolbox': 'Developer Toolbox',
  '/mini': 'Mini',
  '/settings': 'Settings',
  '/settings/security/events': 'Security events',
  ...Object.fromEntries(
    (Object.keys(RRSP_MODULE_HREF) as RrspModule[]).map((m) => [
      RRSP_MODULE_HREF[m],
      RRSP_MODULE_LABELS[m],
    ])
  ),
};

type PortalRole = 'admin' | 'technician' | 'client';

function isPortalRole(role: string): role is PortalRole {
  return role === 'admin' || role === 'technician' || role === 'client';
}

export function getPortalNavLabel(
  href: string,
  role: string,
  options?: { clientTickets?: boolean; clientOrders?: boolean },
): string {
  if (PORTAL_NAV_LABELS[href]?.startsWith('Shop') || href.startsWith('/rrsp/')) {
    return PORTAL_NAV_LABELS[href] ?? href.replace(/^\//, '');
  }
  if (role === 'client' && href === '/tickets' && options?.clientTickets !== false) {
    return 'My tickets';
  }
  if (role === 'client' && href === '/orders' && options?.clientOrders !== false) {
    return 'My orders';
  }
  return PORTAL_NAV_LABELS[href] ?? href.replace(/^\//, '');
}

export function getPortalNavForRole(
  role: string,
  options?: {
    miniDockActive?: boolean;
    rrsp?: { featureEnabled?: boolean; enabled: boolean; modules: string[] } | null;
  },
): PortalNavItem[] {
  let visible = PORTAL_NAV.filter((item) => item.roles.includes(role));

  // RRSP: keep legacy CD support pages; append shop module links under /rrsp/*
  if (role === 'client' && options?.rrsp?.featureEnabled && options.rrsp.enabled) {
    const rrspItems: PortalNavItem[] = [];
    for (const module of options.rrsp.modules as RrspModule[]) {
      const href = RRSP_MODULE_HREF[module];
      if (!href) continue;
      rrspItems.push({
        href,
        label: RRSP_MODULE_LABELS[module],
        icon: RRSP_NAV_ICONS[module],
        roles: ['client'],
        section: rrspItems.length === 0 ? 'RRSP' : undefined,
      });
    }
    // Insert RRSP block after billing (or after orders if billing missing)
    const billingIdx = visible.findIndex((i) => i.href === '/billing');
    const ordersIdx = visible.findIndex((i) => i.href === '/orders');
    const at =
      billingIdx >= 0
        ? billingIdx + 1
        : ordersIdx >= 0
          ? ordersIdx + 1
          : visible.length;
    visible = [...visible.slice(0, at), ...rrspItems, ...visible.slice(at)];
  }

  const miniItem =
    role === 'admin' && options?.miniDockActive
      ? [{ href: '/mini', label: 'Mini', icon: Bot, roles: ['admin'] as string[] }]
      : [];
  return [...visible.slice(0, -1), ...miniItem, ...visible.slice(-1)];
}

export function getMobilePrimaryNav(
  role: string,
  options?: {
    miniDockActive?: boolean;
    rrsp?: { featureEnabled?: boolean; enabled: boolean; modules: string[] } | null;
  },
): PortalNavItem[] {
  const nav = getPortalNavForRole(role, options);
  const portalRole = isPortalRole(role) ? role : null;
  const primary = nav.filter((item) => portalRole && item.mobileTab?.[portalRole]);
  return primary.slice(0, 4);
}

/** Allowed roles for a portal path (exact or nested under a nav href). RRSP shop routes use /rrsp/*. */
export function getPortalRouteRoles(pathname: string): string[] | null {
  const path = pathname.split('?')[0] || '/';
  if (path.startsWith('/rrsp/')) return null;

  const exact = PORTAL_NAV.find((item) => item.href === path);
  if (exact) return exact.roles;

  const sorted = [...PORTAL_NAV].sort((a, b) => b.href.length - a.href.length);
  for (const item of sorted) {
    if (path.startsWith(`${item.href}/`)) return item.roles;
  }

  if (path === '/mini' || path.startsWith('/mini/')) return ['admin'];

  return null;
}

export function getPortalPageLabel(pathname: string | null, role?: string): string {
  if (pathname?.startsWith('/rrsp/')) {
    return PORTAL_NAV_LABELS[pathname] ?? 'RRSP';
  }
  if (pathname?.startsWith('/pos/')) {
    return PORTAL_NAV_LABELS[pathname] ?? 'POS';
  }
  if (pathname?.startsWith('/clients/') && pathname !== '/clients') {
    return 'Clients';
  }
  if (pathname?.startsWith('/msp/')) {
    return PORTAL_NAV_LABELS[pathname] ?? 'MSP';
  }
  if (pathname?.startsWith('/settings/')) {
    return PORTAL_NAV_LABELS[pathname] ?? 'Settings';
  }
  const base = pathname ?? '/dashboard';
  if (role) {
    const match = PORTAL_NAV.find((item) => item.href === base);
    if (match) return getPortalNavLabel(match.href, role);
  }
  return PORTAL_NAV_LABELS[base] ?? 'Portal';
}
