export type CdPortalPage = {
  href: string;
  label: string;
  description: string;
  roles: string[];
};

export const CD_PORTAL_PAGES: CdPortalPage[] = [
  {
    href: '/dashboard',
    label: 'Dashboard',
    description: 'Overview stats, recent tickets, system health, and security status.',
    roles: ['admin', 'technician', 'client'],
  },
  {
    href: '/tickets',
    label: 'Tickets',
    description: 'Support tickets — create, assign, comment, and resolve client issues.',
    roles: ['admin', 'technician', 'client'],
  },
  {
    href: '/billing',
    label: 'Billing',
    description: 'Client invoices, payments, and billing history.',
    roles: ['client'],
  },
  {
    href: '/orders',
    label: 'Orders',
    description:
      'Hardware and supply orders with 8-stage shipment journey (ordered -> manufacturer -> Miami warehouse -> in transit -> customs -> local office -> out for delivery -> delivered).',
    roles: ['admin', 'technician', 'client'],
  },
  {
    href: '/sales',
    label: 'Sales',
    description: 'Sales pipeline, opportunities, demos, proposals, and follow-ups.',
    roles: ['admin', 'technician'],
  },
  {
    href: '/calendar',
    label: 'Calendar',
    description: 'Scheduled sales follow-ups and service events.',
    roles: ['admin', 'technician'],
  },
  {
    href: '/clients',
    label: 'Clients',
    description: 'Client accounts, service levels, licenses, usage, and contacts.',
    roles: ['admin', 'technician'],
  },
  {
    href: '/msp',
    label: 'MSP',
    description: 'Managed service subscriptions, MRR, plan stats, and license activity.',
    roles: ['admin', 'technician'],
  },
  {
    href: '/accounting',
    label: 'Accounting',
    description: 'Invoices, quotes, payments, and financial reporting.',
    roles: ['admin', 'technician'],
  },
  {
    href: '/developer-toolbox',
    label: 'Developer Toolbox',
    description: 'Cloudflare tunnel slots, health checks, and dev environment tooling.',
    roles: ['admin'],
  },
  {
    href: '/mini',
    label: 'Mini',
    description: 'Docked Mini assistant dashboard — chat feed, library, and system logs.',
    roles: ['admin'],
  },
  {
    href: '/settings',
    label: 'Settings',
    description: 'Company profile, email, integrations, security, backups, and users.',
    roles: ['admin'],
  },
];

export const CD_SETTINGS_SECTIONS = [
  { tab: 'system', label: 'System', href: '/settings?tab=system' },
  { tab: 'email', label: 'Email', href: '/settings?tab=email' },
  { tab: 'company', label: 'Company', href: '/settings?tab=company' },
  { tab: 'users', label: 'Users', href: '/settings?tab=users' },
  { tab: 'security', label: 'Security', href: '/settings?tab=security' },
  { tab: 'integrations', label: 'Integrations', href: '/settings?tab=integrations' },
  { tab: 'backup', label: 'Backup', href: '/settings?tab=backup' },
] as const;
