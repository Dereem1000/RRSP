import { cache } from 'react';
import {
  SystemConfig,
  disableDemoSandbox,
  enableDemoSandbox,
  isDemoSandboxActive,
  setDemoModeCache,
} from '@cd-v2/database';
import { normalizeStoredPhone } from '@/lib/phone-utils';

export type EmailSettings = {
  enabled: boolean;
  host: string;
  port: number;
  secure: boolean;
  user: string;
  password: string;
  fromName: string;
  fromEmail: string;
  companyName: string;
  companyAddress: string;
  companyPhone: string;
  companyWebsite: string;
  /** When true, staff must confirm before sending invoice/quote/payment/welcome emails to clients. */
  confirmBeforeClientEmail: boolean;
};

export type ClientEmailPolicy = {
  confirmBeforeClientEmail: boolean;
};

export type TicketNotificationSettings = {
  emailOnCreate: boolean;
  emailOnStatusChange: boolean;
  emailOnAssign: boolean;
  emailOnResolve: boolean;
  emailOnComment: boolean;
  noticesOnCreate: boolean;
  noticesOnAssign: boolean;
  noticesOnStatusChange: boolean;
  clientCanCreateTickets: boolean;
  requireServiceLevelForClientCreate: boolean;
};

export type GeneralSettings = {
  maintenanceMode: boolean;
  maintenanceMessage: string;
  systemVersion: string;
  /** When enabled, the app uses a sandbox DB copy; live data is restored when demo mode is turned off. */
  demoMode: boolean;
};

export async function getEmailSettings(): Promise<EmailSettings> {
  const [
    enabled,
    host,
    port,
    secure,
    user,
    password,
    fromName,
    fromEmail,
    companyName,
    companyAddress,
    companyPhone,
    companyWebsite,
    confirmBeforeClientEmail,
  ] = await Promise.all([
      SystemConfig.getConfig<boolean>('email_enabled', false),
      SystemConfig.getConfig<string>('email_host', ''),
      SystemConfig.getConfig<number>('email_port', 587),
      SystemConfig.getConfig<boolean>('email_secure', false),
      SystemConfig.getConfig<string>('email_user', ''),
      SystemConfig.getConfig<string>('email_password', ''),
      SystemConfig.getConfig<string>('email_from_name', 'Computer Dynamics'),
      SystemConfig.getConfig<string>('email_from_email', ''),
      SystemConfig.getConfig<string>('email_company_name', 'Computer Dynamics'),
      SystemConfig.getConfig<string>('email_company_address', ''),
      SystemConfig.getConfig<string>('email_company_phone', '+1-868-316-8851'),
      SystemConfig.getConfig<string>('email_company_website', ''),
      SystemConfig.getConfig<boolean>('email_confirm_before_client_send', true),
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
    companyAddress: companyAddress ?? '',
    companyPhone: companyPhone ?? '+1-868-316-8851',
    companyWebsite: companyWebsite ?? '',
    confirmBeforeClientEmail: confirmBeforeClientEmail !== false,
  };
}

export async function getClientEmailPolicy(): Promise<ClientEmailPolicy> {
  const confirmBeforeClientEmail = await SystemConfig.getConfig<boolean>(
    'email_confirm_before_client_send',
    true
  );
  return { confirmBeforeClientEmail: confirmBeforeClientEmail !== false };
}

export async function saveEmailSettings(config: Partial<EmailSettings>) {
  const entries: Array<[string, unknown, 'string' | 'boolean' | 'number']> = [
    ['email_enabled', config.enabled ?? false, 'boolean'],
    ['email_host', config.host ?? '', 'string'],
    ['email_port', config.port ?? 587, 'number'],
    ['email_secure', config.secure ?? false, 'boolean'],
    ['email_user', config.user ?? '', 'string'],
    ['email_from_name', config.fromName ?? 'Computer Dynamics', 'string'],
    ['email_from_email', config.fromEmail ?? '', 'string'],
    ['email_company_name', config.companyName ?? 'Computer Dynamics', 'string'],
    ['email_company_address', config.companyAddress ?? '', 'string'],
    ['email_company_phone', normalizeStoredPhone(config.companyPhone ?? '') ?? '', 'string'],
    ['email_company_website', config.companyWebsite ?? '', 'string'],
    ['email_confirm_before_client_send', config.confirmBeforeClientEmail ?? true, 'boolean'],
  ];

  if (config.password !== undefined && config.password !== '') {
    entries.push(['email_password', config.password, 'string']);
  }

  for (const [key, value, type] of entries) {
    await SystemConfig.setConfig(key, value, type, 'email');
  }
}

export async function getTicketNotificationSettings(): Promise<TicketNotificationSettings> {
  const keys = [
    'ticket_email_on_create',
    'ticket_email_on_status',
    'ticket_email_on_assign',
    'ticket_email_on_resolve',
    'ticket_email_on_comment',
    'ticket_notice_on_create',
    'ticket_notice_on_assign',
    'ticket_notice_on_status',
    'client_can_create_tickets',
    'client_create_requires_service_level',
  ] as const;

  const [emailOnCreate, emailOnStatusChange, emailOnAssign, emailOnResolve, emailOnComment, noticesOnCreate, noticesOnAssign, noticesOnStatusChange, clientCanCreateTickets, requireServiceLevelForClientCreate] =
    await Promise.all(keys.map((k) => SystemConfig.getConfig<boolean>(k, true)));

  return {
    emailOnCreate: emailOnCreate !== false,
    emailOnStatusChange: emailOnStatusChange !== false,
    emailOnAssign: emailOnAssign !== false,
    emailOnResolve: emailOnResolve !== false,
    emailOnComment: emailOnComment !== false,
    noticesOnCreate: noticesOnCreate !== false,
    noticesOnAssign: noticesOnAssign !== false,
    noticesOnStatusChange: noticesOnStatusChange !== false,
    clientCanCreateTickets: clientCanCreateTickets !== false,
    requireServiceLevelForClientCreate: requireServiceLevelForClientCreate === true,
  };
}

export async function saveTicketNotificationSettings(config: Partial<TicketNotificationSettings>) {
  const map: Array<[string, boolean]> = [
    ['ticket_email_on_create', config.emailOnCreate ?? true],
    ['ticket_email_on_status', config.emailOnStatusChange ?? true],
    ['ticket_email_on_assign', config.emailOnAssign ?? true],
    ['ticket_email_on_resolve', config.emailOnResolve ?? true],
    ['ticket_email_on_comment', config.emailOnComment ?? true],
    ['ticket_notice_on_create', config.noticesOnCreate ?? true],
    ['ticket_notice_on_assign', config.noticesOnAssign ?? true],
    ['ticket_notice_on_status', config.noticesOnStatusChange ?? true],
    ['client_can_create_tickets', config.clientCanCreateTickets ?? true],
    ['client_create_requires_service_level', config.requireServiceLevelForClientCreate ?? false],
  ];

  for (const [key, value] of map) {
    await SystemConfig.setConfig(key, value, 'boolean', 'tickets');
  }
}

export const getGeneralSettings = cache(async (): Promise<GeneralSettings> => {
  const [maintenanceMode, maintenanceMessage, systemVersion, configDemoMode] = await Promise.all([
    SystemConfig.getConfig<boolean>('maintenance_mode', false),
    SystemConfig.getConfig<string>('maintenance_message', 'System is currently under maintenance.'),
    SystemConfig.getConfig<string>('system_version', '2.1.0'),
    SystemConfig.getConfig<boolean>('demo_mode', false),
  ]);

  const sandboxActive = isDemoSandboxActive();
  if (!sandboxActive && configDemoMode) {
    await SystemConfig.setConfig('demo_mode', false, 'boolean', 'general');
  }

  const demoModeEnabled = sandboxActive;
  setDemoModeCache(demoModeEnabled);
  return {
    maintenanceMode: Boolean(maintenanceMode),
    maintenanceMessage: maintenanceMessage ?? '',
    systemVersion: systemVersion ?? '2.1.0',
    demoMode: demoModeEnabled,
  };
});

export async function saveGeneralSettings(config: Partial<GeneralSettings>) {
  if (config.demoMode === true && !isDemoSandboxActive()) {
    await enableDemoSandbox();
  } else if (config.demoMode === false && isDemoSandboxActive()) {
    await disableDemoSandbox();
  }

  if (config.demoMode !== undefined) {
    await SystemConfig.setConfig('demo_mode', config.demoMode, 'boolean', 'general');
  }

  if (config.maintenanceMode !== undefined) {
    await SystemConfig.setConfig('maintenance_mode', config.maintenanceMode, 'boolean', 'general');
  }
  if (config.maintenanceMessage !== undefined) {
    await SystemConfig.setConfig('maintenance_message', config.maintenanceMessage, 'string', 'general');
  }
}
