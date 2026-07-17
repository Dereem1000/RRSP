import { QueryTypes } from 'sequelize';
import { getSequelize, SystemConfig } from '@cd-v2/database';
import { getEmailConfig } from '@/lib/email';
import { listEmailLogs, findRecentTicketEmailLog, type EmailLogEntry } from '@/lib/email-log';
import { getRecentFinancialTransactions } from '@/lib/accounting';
import { getMiniDockSettings } from '@/lib/mini-dock';
import { getTicketById, getTicketComments } from '@/lib/tickets';
import { getOrderById } from '@/lib/orders';
import { isMiniDockActive, miniProxyRequest } from '@/lib/mini-dock';

export type MiniCdSecurityEvent = {
  eventType: string;
  severity: string;
  description: string;
  createdAt: string;
};

export type MiniCdExternalLogAlert = {
  systemName: string;
  level: string;
  category: string;
  message: string;
  requestPath?: string;
};

export type MiniCdEntityHistory = {
  entityType: string;
  entityId: string;
  ticketComments?: Array<{ author: string; type: string; text: string; at: string; internal: boolean }>;
  relatedEmails?: EmailLogEntry[];
  note?: string;
};

export type MiniCdBillingEvent = {
  kind: 'payment' | 'invoice';
  id: string;
  invoiceNumber?: string;
  clientName?: string | null;
  amount: number;
  currency?: string;
  status?: string;
  method?: string;
  occurredAt: string;
};

export type MiniCdSettingsSnapshot = {
  emailEnabled: boolean;
  emailConfigured: boolean;
  emailHost: string;
  emailFrom: string;
  miniDocked: boolean;
  miniConnected: boolean;
  miniLastSeenAt: string | null;
  miniLastError: string | null;
  configKeys: Array<{ key: string; category: string; valuePreview: string }>;
};

export type MiniCdMiniRuntimeLogs = {
  externalLogAlerts: MiniCdExternalLogAlert[];
  lastAgentTrace?: {
    savedAt?: string;
    userMessage?: string;
    toolsUsed?: string[];
    mode?: string;
    stoppedReason?: string;
    observations?: Array<{ tool: string; success: boolean; output: string }>;
  };
  lastSessionTools: string[];
  recentCycles: Array<{ goal: string; state: string; success: boolean; note: string }>;
  pendingGoals: Array<{ title?: string; description?: string; category?: string }>;
  libraryLearning: Record<string, unknown>;
  recentLibraryLearns: Array<{ title: string; source: string; learnedAt?: string }>;
};

export type MiniCdOperationalLogs = {
  email: {
    enabled: boolean;
    configured: boolean;
    host: string;
    fromEmail: string;
    recentSent: number;
    recentFailed: number;
    lastFailures: EmailLogEntry[];
  };
  recentEmailLogs: EmailLogEntry[];
  miniRecentEvents: Array<{ type: string; summary: string; occurredAt?: string }>;
  securityEvents: MiniCdSecurityEvent[];
  externalLogAlerts: MiniCdExternalLogAlert[];
  entityHistory: MiniCdEntityHistory | null;
  billingEvents: MiniCdBillingEvent[];
  settingsSnapshot: MiniCdSettingsSnapshot;
  miniRuntime: MiniCdMiniRuntimeLogs;
  generatedAt: string;
};

export type BuildMiniCdOperationalLogsOptions = {
  entityType?: string;
  entityId?: string;
  role?: string;
  /** Skip round-trips to Mini — use for chat; Mini already has runtime state locally. */
  skipMiniProxy?: boolean;
};

const SENSITIVE_CONFIG_KEYS = new Set(['email_password', 'mini_api_token']);

async function fetchSecurityEvents(limit = 10): Promise<MiniCdSecurityEvent[]> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<{
      event_type: string;
      severity: string;
      description: string;
      created_at: string;
    }>(
      `SELECT event_type, severity, description, created_at
       FROM security_events
       ORDER BY created_at DESC
       LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { limit } }
    );
    return rows.map((row) => ({
      eventType: row.event_type,
      severity: row.severity,
      description: row.description,
      createdAt: row.created_at,
    }));
  } catch {
    return [];
  }
}

async function fetchRecentInvoiceEvents(limit = 8): Promise<MiniCdBillingEvent[]> {
  try {
    const sequelize = getSequelize();
    const rows = await sequelize.query<{
      id: string;
      invoice_number: string;
      amount: number;
      currency: string;
      status: string;
      updated_at: string;
      clientName: string | null;
    }>(
      `SELECT i.id, i.invoice_number, i.amount, i.currency, i.status, i.updated_at, c.name AS clientName
       FROM invoices i
       LEFT JOIN clients c ON c.id = i.client_id
       ORDER BY i.updated_at DESC
       LIMIT :limit`,
      { type: QueryTypes.SELECT, replacements: { limit } }
    );
    return rows.map((row) => ({
      kind: 'invoice' as const,
      id: row.id,
      invoiceNumber: row.invoice_number,
      clientName: row.clientName,
      amount: Number(row.amount),
      currency: row.currency ?? 'TTD',
      status: row.status,
      occurredAt: row.updated_at,
    }));
  } catch {
    return [];
  }
}

async function fetchBillingEvents(): Promise<MiniCdBillingEvent[]> {
  const [payments, invoices] = await Promise.all([
    getRecentFinancialTransactions(6).catch(() => []),
    fetchRecentInvoiceEvents(6),
  ]);

  const paymentEvents: MiniCdBillingEvent[] = payments.map((payment) => ({
    kind: 'payment',
    id: payment.id,
    invoiceNumber: payment.invoiceNumber,
    clientName: payment.clientName,
    amount: payment.amount,
    currency: payment.currency,
    method: payment.paymentMethod,
    occurredAt: payment.paymentDate,
  }));

  const merged = [...paymentEvents, ...invoices];
  merged.sort((a, b) => String(b.occurredAt).localeCompare(String(a.occurredAt)));
  return merged.slice(0, 10);
}

async function fetchSettingsSnapshot(): Promise<MiniCdSettingsSnapshot> {
  const [emailConfig, miniDock, configRows] = await Promise.all([
    getEmailConfig(),
    getMiniDockSettings().catch(() => null),
    SystemConfig.findAll({
      where: { isActive: true },
      attributes: ['key', 'category', 'value'],
      order: [['category', 'ASC'], ['key', 'ASC']],
    }).catch(() => []),
  ]);

  const relevantKeys = new Set([
    'email_enabled',
    'email_host',
    'email_port',
    'email_user',
    'email_from_email',
    'email_from_name',
    'mini_docked',
    'mini_local_url',
    'mini_last_seen_at',
    'mini_last_error',
    'ticket_email_on_comment',
    'ticket_email_on_status',
  ]);

  const configKeys = configRows
    .filter((row) => relevantKeys.has(row.key) || row.category === 'email' || row.category === 'mini')
    .filter((row) => !SENSITIVE_CONFIG_KEYS.has(row.key))
    .slice(0, 16)
    .map((row) => ({
      key: row.key,
      category: row.category,
      valuePreview: String(row.value ?? '').slice(0, 80),
    }));

  return {
    emailEnabled: emailConfig.enabled,
    emailConfigured: Boolean(emailConfig.host && emailConfig.user && emailConfig.password),
    emailHost: emailConfig.host || '',
    emailFrom: emailConfig.fromEmail || emailConfig.user || '',
    miniDocked: Boolean(miniDock?.docked),
    miniConnected: Boolean(miniDock?.connected),
    miniLastSeenAt: miniDock?.lastSeenAt ?? null,
    miniLastError: miniDock?.lastError ?? null,
    configKeys,
  };
}

async function fetchMiniRecentEvents(): Promise<MiniCdOperationalLogs['miniRecentEvents']> {
  if (!(await isMiniDockActive())) return [];
  try {
    const result = await miniProxyRequest('/api/cd/events/recent?limit=12', { method: 'GET' });
    if (!result.ok || !result.body || typeof result.body !== 'object') return [];
    const events = (result.body as { events?: unknown[] }).events;
    if (!Array.isArray(events)) return [];
    return events
      .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
      .map((item) => ({
        type: String(item.type || 'event'),
        summary: String(item.summary || '').slice(0, 200),
        occurredAt: item.occurred_at ? String(item.occurred_at) : undefined,
      }));
  } catch {
    return [];
  }
}

function parseExternalAlerts(payload: unknown): MiniCdExternalLogAlert[] {
  if (!payload || typeof payload !== 'object') return [];
  const systemLogs = (payload as { system_logs?: unknown }).system_logs;
  if (!systemLogs || typeof systemLogs !== 'object') return [];
  const alerts = (systemLogs as { chat_alerts?: unknown }).chat_alerts;
  if (!Array.isArray(alerts)) return [];
  return alerts
    .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
    .map((item) => ({
      systemName: String(item.system_name || 'External system'),
      level: String(item.level || 'error'),
      category: String(item.category || 'general'),
      message: String(item.message || '').slice(0, 200),
      requestPath: item.request_path ? String(item.request_path) : undefined,
    }));
}

async function fetchMiniRuntimeLogs(): Promise<MiniCdMiniRuntimeLogs> {
  const empty: MiniCdMiniRuntimeLogs = {
    externalLogAlerts: [],
    lastSessionTools: [],
    recentCycles: [],
    pendingGoals: [],
    libraryLearning: {},
    recentLibraryLearns: [],
  };
  if (!(await isMiniDockActive())) return empty;

  try {
    const [snapshotResult, externalResult] = await Promise.all([
      miniProxyRequest('/api/cd/operational-snapshot', { method: 'GET' }),
      miniProxyRequest('/api/external-systems', { method: 'GET' }),
    ]);

    const snapshot =
      snapshotResult.ok && snapshotResult.body && typeof snapshotResult.body === 'object'
        ? (snapshotResult.body as Record<string, unknown>)
        : {};

    const externalAlerts =
      parseExternalAlerts(externalResult.body).length > 0
        ? parseExternalAlerts(externalResult.body)
        : parseExternalAlerts({ system_logs: { chat_alerts: snapshot.external_log_alerts } });

    const rawTrace = snapshot.last_agent_trace;
    let lastAgentTrace: MiniCdMiniRuntimeLogs['lastAgentTrace'];
    if (rawTrace && typeof rawTrace === 'object') {
      const traceBody =
        (rawTrace as { trace?: unknown }).trace && typeof (rawTrace as { trace?: unknown }).trace === 'object'
          ? ((rawTrace as { trace: Record<string, unknown> }).trace as Record<string, unknown>)
          : (rawTrace as Record<string, unknown>);
      const observations = Array.isArray(traceBody.observations)
        ? traceBody.observations
            .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
            .slice(0, 6)
            .map((item) => ({
              tool: String(item.tool || ''),
              success: Boolean(item.success),
              output: String(item.output || '').slice(0, 160),
            }))
        : [];
      lastAgentTrace = {
        savedAt: (rawTrace as { saved_at?: string }).saved_at,
        userMessage: (rawTrace as { user_message?: string }).user_message,
        toolsUsed: Array.isArray((rawTrace as { tools_used?: unknown }).tools_used)
          ? ((rawTrace as { tools_used: string[] }).tools_used as string[])
          : [],
        mode: traceBody.mode ? String(traceBody.mode) : undefined,
        stoppedReason: traceBody.stopped_reason ? String(traceBody.stopped_reason) : undefined,
        observations,
      };
    }

    const recentCycles = Array.isArray(snapshot.recent_cycles)
      ? snapshot.recent_cycles
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            goal: String(item.goal || ''),
            state: String(item.state || ''),
            success: Boolean(item.success),
            note: String(item.note || ''),
          }))
      : [];

    const pendingGoals = Array.isArray(snapshot.pending_goals)
      ? snapshot.pending_goals
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .slice(0, 6)
          .map((item) => ({
            title: item.title ? String(item.title) : undefined,
            description: item.description ? String(item.description) : undefined,
            category: item.category ? String(item.category) : undefined,
          }))
      : [];

    const libraryLearning =
      snapshot.library_learning && typeof snapshot.library_learning === 'object'
        ? (snapshot.library_learning as Record<string, unknown>)
        : {};

    const recentLibraryLearns = Array.isArray(snapshot.recent_library_learns)
      ? snapshot.recent_library_learns
          .filter((item): item is Record<string, unknown> => Boolean(item) && typeof item === 'object')
          .map((item) => ({
            title: String(item.title || ''),
            source: String(item.source || ''),
            learnedAt: item.learned_at ? String(item.learned_at) : undefined,
          }))
      : [];

    const lastSessionTools = Array.isArray(snapshot.last_session_tools)
      ? snapshot.last_session_tools.map((item) => String(item)).slice(0, 8)
      : [];

    return {
      externalLogAlerts: externalAlerts.slice(0, 10),
      lastAgentTrace,
      lastSessionTools,
      recentCycles,
      pendingGoals,
      libraryLearning,
      recentLibraryLearns,
    };
  } catch {
    return empty;
  }
}

async function fetchEntityScopedHistory(
  options: BuildMiniCdOperationalLogsOptions
): Promise<MiniCdEntityHistory | null> {
  const { entityType, entityId, role } = options;
  if (!entityType || !entityId) return null;

  if (entityType === 'ticket') {
    const includeInternal = role === 'admin' || role === 'technician';
    const [ticket, comments] = await Promise.all([
      getTicketById(entityId),
      getTicketComments(entityId, includeInternal),
    ]);
    const relatedEmails = ticket?.ticketNumber
      ? await findRecentTicketEmailLog(String(ticket.ticketNumber), 6)
      : [];
    if (!ticket && !comments.length) return null;
    return {
      entityType,
      entityId,
      ticketComments: comments.slice(0, 12).map((comment) => ({
        author: comment.authorName,
        type: comment.commentType,
        text: String(comment.comment || '').slice(0, 240),
        at: comment.timestamp,
        internal: Boolean(comment.isInternal),
      })),
      relatedEmails,
      note: ticket ? `Ticket #${ticket.ticketNumber} status=${ticket.status}` : undefined,
    };
  }

  if (entityType === 'order') {
    const order = await getOrderById(entityId, { includeCost: role !== 'client' });
    if (!order) return null;
    const { logs } = await listEmailLogs({ limit: 20, page: 1, category: 'order' });
    const relatedEmails = logs
      .filter((entry) => entry.subject.includes(String(order.orderNumber)))
      .slice(0, 6);
    return {
      entityType,
      entityId,
      relatedEmails,
      note: `Order ${order.orderNumber} status=${order.status}, shipping=${order.shippingStage ?? 'n/a'}`,
    };
  }

  if (entityType === 'client' && (role === 'admin' || role === 'technician')) {
    try {
      const sequelize = getSequelize();
      const [tickets, invoices] = await Promise.all([
        sequelize.query<{ ticketNumber: string; issue: string; status: string; lastUpdated: string }>(
          `SELECT ticketNumber, issue, status, lastUpdated FROM tickets
           WHERE clientId = :clientId AND isActive = 1
           ORDER BY lastUpdated DESC LIMIT 5`,
          { type: QueryTypes.SELECT, replacements: { clientId: entityId } }
        ),
        sequelize.query<{ invoice_number: string; status: string; amount: number; updated_at: string }>(
          `SELECT invoice_number, status, amount, updated_at FROM invoices
           WHERE client_id = :clientId
           ORDER BY updated_at DESC LIMIT 5`,
          { type: QueryTypes.SELECT, replacements: { clientId: entityId } }
        ),
      ]);
      const lines = [
        ...tickets.map((row) => `ticket #${row.ticketNumber} [${row.status}] ${String(row.issue).slice(0, 80)}`),
        ...invoices.map(
          (row) => `invoice ${row.invoice_number} [${row.status}] TTD ${Number(row.amount).toFixed(2)}`
        ),
      ];
      return {
        entityType,
        entityId,
        note: lines.length ? lines.join('; ') : 'No recent tickets or invoices for this client.',
      };
    } catch {
      return { entityType, entityId, note: 'Client history unavailable.' };
    }
  }

  return null;
}

export async function buildMiniCdOperationalLogs(
  options: BuildMiniCdOperationalLogsOptions = {}
): Promise<MiniCdOperationalLogs> {
  const skipMiniProxy = options.skipMiniProxy === true;
  const emptyMiniRuntime: MiniCdMiniRuntimeLogs = {
    externalLogAlerts: [],
    lastSessionTools: [],
    recentCycles: [],
    pendingGoals: [],
    libraryLearning: {},
    recentLibraryLearns: [],
  };

  const [
    emailConfig,
    emailLogsResult,
    miniRecentEvents,
    securityEvents,
    billingEvents,
    settingsSnapshot,
    miniRuntime,
    entityHistory,
  ] = await Promise.all([
    getEmailConfig(),
    listEmailLogs({ limit: 25, page: 1 }),
    skipMiniProxy ? Promise.resolve([]) : fetchMiniRecentEvents(),
    fetchSecurityEvents(10),
    fetchBillingEvents(),
    fetchSettingsSnapshot(),
    skipMiniProxy ? Promise.resolve(emptyMiniRuntime) : fetchMiniRuntimeLogs(),
    fetchEntityScopedHistory(options),
  ]);

  const logs = emailLogsResult.logs;
  const lastFailures = logs.filter((entry) => entry.status === 'failed').slice(0, 8);
  const recentSent = logs.filter((entry) => entry.status === 'sent').length;
  const recentFailed = logs.filter((entry) => entry.status === 'failed').length;

  const externalLogAlerts = [
    ...miniRuntime.externalLogAlerts,
  ];

  return {
    email: {
      enabled: emailConfig.enabled,
      configured: Boolean(emailConfig.host && emailConfig.user && emailConfig.password),
      host: emailConfig.host || '',
      fromEmail: emailConfig.fromEmail || emailConfig.user || '',
      recentSent,
      recentFailed,
      lastFailures,
    },
    recentEmailLogs: logs.slice(0, 15),
    miniRecentEvents,
    securityEvents,
    externalLogAlerts,
    entityHistory,
    billingEvents,
    settingsSnapshot,
    miniRuntime: { ...miniRuntime, externalLogAlerts },
    generatedAt: new Date().toISOString(),
  };
}

export function summarizeMiniCdOperationalLogs(logs: MiniCdOperationalLogs, maxChars = 5500): string {
  const lines: string[] = ['Operational logs (CD + Mini):'];

  lines.push(
    `Email/SMTP: ${logs.email.enabled ? 'enabled' : 'DISABLED'}, ` +
      `${logs.email.configured ? 'configured' : 'NOT fully configured'}, ` +
      `host=${logs.email.host || 'none'}, from=${logs.email.fromEmail || 'none'}, ` +
      `recent sent=${logs.email.recentSent}, failed=${logs.email.recentFailed}`
  );

  if (logs.email.lastFailures.length) {
    lines.push('Recent email failures:');
    for (const entry of logs.email.lastFailures.slice(0, 5)) {
      const err = entry.errorMessage ? ` — ${entry.errorMessage.slice(0, 120)}` : '';
      lines.push(`- [failed] ${entry.subject} → ${entry.toEmail}${err}`);
    }
  }

  const recentNonFailure = logs.recentEmailLogs.filter((e) => e.status === 'sent').slice(0, 4);
  if (recentNonFailure.length) {
    lines.push('Recent emails sent:');
    for (const entry of recentNonFailure) {
      lines.push(`- [sent] ${entry.subject} → ${entry.toEmail}`);
    }
  }

  if (logs.securityEvents.length) {
    lines.push('Recent security/auth events:');
    for (const event of logs.securityEvents.slice(0, 6)) {
      lines.push(
        `- [${event.severity}/${event.eventType}] ${event.description.slice(0, 140)} @ ${event.createdAt}`
      );
    }
  }

  if (logs.externalLogAlerts.length) {
    lines.push('External system log alerts (CRM, Project Guard, etc.):');
    for (const alert of logs.externalLogAlerts.slice(0, 6)) {
      const pathPart = alert.requestPath ? ` ${alert.requestPath}` : '';
      lines.push(
        `- ${alert.systemName} [${alert.level}/${alert.category}${pathPart}]: ${alert.message}`
      );
    }
  }

  if (logs.entityHistory) {
    lines.push(`Entity-scoped history (${logs.entityHistory.entityType} ${logs.entityHistory.entityId}):`);
    if (logs.entityHistory.note) lines.push(`- ${logs.entityHistory.note}`);
    if (logs.entityHistory.ticketComments?.length) {
      for (const comment of logs.entityHistory.ticketComments.slice(0, 8)) {
        const internal = comment.internal ? ' [internal]' : '';
        lines.push(
          `- ${comment.at} ${comment.author} (${comment.type})${internal}: ${comment.text.slice(0, 160)}`
        );
      }
    }
    if (logs.entityHistory.relatedEmails?.length) {
      lines.push('Related emails for this record:');
      for (const entry of logs.entityHistory.relatedEmails.slice(0, 5)) {
        lines.push(`- [${entry.status}] ${entry.subject} → ${entry.toEmail} @ ${entry.createdAt}`);
      }
    }
  }

  if (logs.billingEvents.length) {
    lines.push('Recent order/invoice/payment activity:');
    for (const event of logs.billingEvents.slice(0, 8)) {
      if (event.kind === 'payment') {
        lines.push(
          `- payment ${event.invoiceNumber ?? event.id}: TTD ${event.amount.toFixed(2)} via ${event.method ?? 'n/a'} @ ${event.occurredAt}`
        );
      } else {
        lines.push(
          `- invoice ${event.invoiceNumber ?? event.id} [${event.status ?? 'unknown'}]: TTD ${event.amount.toFixed(2)} @ ${event.occurredAt}`
        );
      }
    }
  }

  const settings = logs.settingsSnapshot;
  lines.push(
    `Settings snapshot: email=${settings.emailEnabled ? 'on' : 'off'}, mini docked=${settings.miniDocked}, connected=${settings.miniConnected}` +
      (settings.miniLastError ? `, mini error=${settings.miniLastError.slice(0, 80)}` : '')
  );
  if (settings.configKeys.length) {
    lines.push('Tracked config keys (no secrets):');
    for (const row of settings.configKeys.slice(0, 8)) {
      lines.push(`- ${row.category}/${row.key}=${row.valuePreview}`);
    }
  }

  if (logs.miniRecentEvents.length) {
    lines.push('Recent Mini/CD activity events:');
    for (const event of logs.miniRecentEvents.slice(0, 8)) {
      lines.push(`- [${event.type}] ${event.summary}`);
    }
  }

  const runtime = logs.miniRuntime;
  if (runtime.lastSessionTools.length || runtime.lastAgentTrace?.observations?.length) {
    lines.push('Mini last tool execution trace:');
    if (runtime.lastAgentTrace?.userMessage) {
      lines.push(`- last request: ${runtime.lastAgentTrace.userMessage.slice(0, 120)}`);
    }
    const tools = runtime.lastAgentTrace?.toolsUsed?.length
      ? runtime.lastAgentTrace.toolsUsed
      : runtime.lastSessionTools;
    if (tools.length) lines.push(`- tools used: ${tools.join(', ')}`);
    for (const obs of runtime.lastAgentTrace?.observations?.slice(0, 5) ?? []) {
      lines.push(`- ${obs.tool} (${obs.success ? 'ok' : 'fail'}): ${obs.output.slice(0, 140)}`);
    }
  }

  if (runtime.recentCycles.length) {
    lines.push('Mini autonomous cycle notes (recent):');
    for (const cycle of runtime.recentCycles.slice(0, 4)) {
      const status = cycle.success ? 'ok' : 'issue';
      const note = cycle.note ? ` — ${cycle.note}` : '';
      lines.push(`- [${status}] ${cycle.goal} (${cycle.state})${note}`);
    }
  }

  if (runtime.pendingGoals.length) {
    lines.push('Mini queued goals:');
    for (const goal of runtime.pendingGoals.slice(0, 4)) {
      lines.push(`- ${goal.title || goal.description || 'goal'}${goal.category ? ` [${goal.category}]` : ''}`);
    }
  }

  const learning = runtime.libraryLearning;
  if (Object.keys(learning).length) {
    lines.push(
      `Library learning scheduler: enabled=${Boolean(learning.enabled)}, last_run=${String(learning.last_run_at || 'never')}, last_error=${String(learning.last_error || 'none')}`
    );
  }
  if (runtime.recentLibraryLearns.length) {
    lines.push('Recent library ingest:');
    for (const entry of runtime.recentLibraryLearns.slice(0, 4)) {
      lines.push(`- ${entry.title}${entry.source ? ` (${entry.source})` : ''}${entry.learnedAt ? ` @ ${entry.learnedAt}` : ''}`);
    }
  }

  const text = lines.join('\n');
  return text.length > maxChars ? `${text.slice(0, maxChars - 20)}… [truncated]` : text;
}
