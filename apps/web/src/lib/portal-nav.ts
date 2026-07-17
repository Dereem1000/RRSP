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
  Target,
  Ticket,
  Users,
  Wrench,
  type LucideIcon,
} from 'lucide-react';

export type PortalNavItem = {
  href: string;
  label: string;
  icon: LucideIcon;
  roles: string[];
  /** Shown in the mobile bottom tab bar for this role (max 4 per role). */
  mobileTab?: Partial<Record<'admin' | 'technician' | 'client', boolean>>;
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

export const PORTAL_NAV_LABELS: Record<string, string> = {
  '/dashboard': 'Dashboard',
  '/tickets': 'Tickets',
  '/billing': 'Billing',
  '/orders': 'Orders',
  '/sales': 'Sales',
  '/calendar': 'Calendar',
  '/clients': 'Clients',
  '/msp': 'MSP',
  '/msp/systems': 'Management Systems',
  '/accounting': 'Accounting',
  '/developer-toolbox': 'Developer Toolbox',
  '/mini': 'Mini',
  '/settings': 'Settings',
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
  options?: { miniDockActive?: boolean },
): PortalNavItem[] {
  const visible = PORTAL_NAV.filter((item) => item.roles.includes(role));
  const miniItem =
    role === 'admin' && options?.miniDockActive
      ? [{ href: '/mini', label: 'Mini', icon: Bot, roles: ['admin'] as string[] }]
      : [];
  return [...visible.slice(0, -1), ...miniItem, ...visible.slice(-1)];
}

export function getMobilePrimaryNav(
  role: string,
  options?: { miniDockActive?: boolean },
): PortalNavItem[] {
  const nav = getPortalNavForRole(role, options);
  const portalRole = isPortalRole(role) ? role : null;
  const primary = nav.filter((item) => portalRole && item.mobileTab?.[portalRole]);
  return primary.slice(0, 4);
}

export function getPortalPageLabel(pathname: string | null, role?: string): string {
  if (pathname?.startsWith('/clients/') && pathname !== '/clients') {
    return 'Clients';
  }
  if (pathname?.startsWith('/msp/')) {
    return PORTAL_NAV_LABELS[pathname] ?? 'MSP';
  }
  const base = pathname ?? '/dashboard';
  if (role) {
    const match = PORTAL_NAV.find((item) => item.href === base);
    if (match) return getPortalNavLabel(match.href, role);
  }
  return PORTAL_NAV_LABELS[base] ?? 'Portal';
}
