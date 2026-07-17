import Imap from 'imap';
import { simpleParser } from 'mailparser';
import { SystemConfig } from '@cd-v2/database';
import { DEFAULT_OFFICE_LOCATION } from '@/lib/order-constants';
import { parseShipmentEmailWithMini } from '@/lib/order-email-mini-parse';
import {
  clampEmailShippingStage,
  isAmbiguousShipmentEmailPhrase,
  locationForShippingStage,
  shouldAskMiniForShipmentStage,
  shippingStageLabel,
  statusForShippingStage,
} from '@/lib/order-shipment-stages';
import { applyEmailMonitoringUpdate, findOrderForEmailMonitoring, type SerializedOrder } from '@/lib/orders';

export type EmailMonitoringConfig = {
  enabled: boolean;
  host: string;
  port: number;
  user: string;
  password: string;
  tls: boolean;
  folder: string;
  checkInterval: number;
};

export async function getEmailMonitoringConfig(): Promise<EmailMonitoringConfig> {
  const [enabled, host, port, user, password, tls, folder, checkInterval] = await Promise.all([
    SystemConfig.getConfig<boolean>('email_monitoring_enabled', false),
    SystemConfig.getConfig<string>('email_monitoring_host', ''),
    SystemConfig.getConfig<number>('email_monitoring_port', 993),
    SystemConfig.getConfig<string>('email_monitoring_user', ''),
    SystemConfig.getConfig<string>('email_monitoring_password', ''),
    SystemConfig.getConfig<boolean>('email_monitoring_tls', true),
    SystemConfig.getConfig<string>('email_monitoring_folder', 'INBOX'),
    SystemConfig.getConfig<number>('email_monitoring_interval', 300000),
  ]);

  return {
    enabled: Boolean(enabled),
    host: host ?? '',
    port: Number(port) || 993,
    user: user ?? '',
    password: password ?? '',
    tls: tls !== false,
    folder: folder ?? 'INBOX',
    checkInterval: Number(checkInterval) || 300000,
  };
}

export async function saveEmailMonitoringConfig(config: Partial<EmailMonitoringConfig>) {
  const entries: Array<[string, unknown, 'boolean' | 'string' | 'number']> = [];
  if (config.enabled !== undefined) entries.push(['email_monitoring_enabled', config.enabled, 'boolean']);
  if (config.host !== undefined) entries.push(['email_monitoring_host', config.host, 'string']);
  if (config.port !== undefined) entries.push(['email_monitoring_port', config.port, 'number']);
  if (config.user !== undefined) entries.push(['email_monitoring_user', config.user, 'string']);
  if (config.password !== undefined && config.password !== '********') {
    entries.push(['email_monitoring_password', config.password, 'string']);
  }
  if (config.tls !== undefined) entries.push(['email_monitoring_tls', config.tls, 'boolean']);
  if (config.folder !== undefined) entries.push(['email_monitoring_folder', config.folder, 'string']);
  if (config.checkInterval !== undefined) entries.push(['email_monitoring_interval', config.checkInterval, 'number']);

  for (const [key, value, type] of entries) {
    await SystemConfig.setConfig(key, value, type, 'email_monitoring');
  }
}

export type ParsedEmailUpdate = {
  trackingNumber?: string;
  vendorOrderNumber?: string;
  orderNumber?: string;
  vendor?: string;
  status?: string;
  shippingStage?: string;
  currentLocation?: string;
  notes?: string;
  emailSubject?: string;
  miniAssisted?: boolean;
  stageGuarded?: boolean;
  miniReason?: string;
};

function isUsVendor(from: string, fullText: string, vendor?: string) {
  const vendorLower = (vendor ?? '').toLowerCase();
  return /amazon|ebay|walmart|newegg|target/i.test(vendorLower) || /amazon\.com|ebay\.com/i.test(fullText) || /amazon|ebay/i.test(from);
}

export function extractEmailUpdates(subject: string, text: string, from: string): ParsedEmailUpdate | null {
  const body = `${subject}\n${text}`.toLowerCase();
  const fullText = `${subject}\n${text}`;
  const update: ParsedEmailUpdate = { emailSubject: subject };

  const vendorOrderMatch =
    fullText.match(/order\s*(?:#|number:?|no\.?)\s*([A-Z0-9-]+)/i) ||
    fullText.match(/vendor order[:\s#]*([A-Z0-9-]+)/i);
  if (vendorOrderMatch) update.vendorOrderNumber = vendorOrderMatch[1];

  const trackingMatch =
    fullText.match(/tracking\s*(?:#|number:?|no\.?)\s*([A-Z0-9-]+)/i) ||
    fullText.match(/\b(1Z[0-9A-Z]{16})\b/i);
  if (trackingMatch) update.trackingNumber = trackingMatch[1];

  const wrMatch = fullText.match(/\b(WR-?\d+|WHR-?\d+)\b/i);
  if (wrMatch) update.notes = `Email update: ${wrMatch[1]}`;

  const portalOrderMatch = fullText.match(/\b(ORD-\d+-[A-Z0-9]+)\b/i);
  if (portalOrderMatch) update.orderNumber = portalOrderMatch[1];

  if (/jetbox/i.test(from) || /jetbox/i.test(fullText)) update.vendor = 'JetBox';
  else if (/amazon/i.test(from) || /amazon/i.test(fullText)) update.vendor = 'Amazon';
  else if (/aliexpress|ali express/i.test(fullText)) update.vendor = 'AliExpress';
  else if (/ebay/i.test(fullText)) update.vendor = 'eBay';

  const usVendor = isUsVendor(from, fullText, update.vendor);
  const trinidadContext = /trinidad|jetbox|malabar|arima|computer dynamics|customs/i.test(body);

  if (
    /\b(was delivered|has been delivered|successfully delivered|delivery completed|package delivered)\b/i.test(
      body
    ) &&
    (trinidadContext || !usVendor)
  ) {
    update.status = 'delivered';
    update.shippingStage = 'delivered';
    update.currentLocation = 'Delivered';
  } else if (/arrived at destination/i.test(body) && trinidadContext) {
    update.status = 'delivered';
    update.shippingStage = 'delivered';
    update.currentLocation = 'Delivered';
  } else if (
    /malabar|arima|local office|at our office|received at office|arrived at (?:the )?office|computer dynamics(?: office| warehouse)?|ready for pickup/i.test(
      body
    )
  ) {
    update.status = 'shipped';
    update.shippingStage = 'local_office';
    update.currentLocation = DEFAULT_OFFICE_LOCATION;
  } else if (/customs|clearance/i.test(body) && trinidadContext) {
    update.status = 'shipped';
    update.shippingStage = 'customs';
    update.currentLocation = 'In Customs';
  } else if (/miami|warehouse|jetbox/i.test(body) && /miami|jetbox|warehouse|received|arrived/i.test(body)) {
    update.status = 'shipped';
    update.shippingStage = 'miami_warehouse';
    update.currentLocation = 'Miami Warehouse';
  } else if (/in transit|on the way/i.test(body) && trinidadContext) {
    update.status = 'shipped';
    update.shippingStage = 'in_transit';
    update.currentLocation = 'In Transit to Trinidad';
  } else if (/out for delivery/i.test(body)) {
    update.status = 'shipped';
    update.shippingStage = usVendor && !trinidadContext ? 'manufacturer_shipped' : 'out_for_delivery';
    update.currentLocation =
      update.shippingStage === 'out_for_delivery' ? 'Out for Delivery' : `Shipped from ${update.vendor || 'vendor'}`;
  } else if (/shipped|has shipped|dispatched|departed/i.test(body)) {
    update.status = 'shipped';
    update.shippingStage = 'manufacturer_shipped';
    update.currentLocation = update.vendor ? `Shipped from ${update.vendor}` : 'Shipped from manufacturer';
  } else if (/order confirmed|order placed|thank you for your order/i.test(body)) {
    update.status = 'ordered';
    update.shippingStage = 'ordered';
  }

  if (!update.status && !update.trackingNumber && !update.vendorOrderNumber) return null;
  return update;
}

async function refineEmailUpdateWithMini(
  extracted: ParsedEmailUpdate,
  existing: SerializedOrder,
  subject: string,
  text: string,
  from: string
): Promise<ParsedEmailUpdate> {
  if (!extracted.shippingStage) return extracted;

  let proposedStage = extracted.shippingStage;
  let miniAssisted = false;
  let miniReason: string | undefined;
  let miniConfidence: number | undefined;

  if (
    shouldAskMiniForShipmentStage({
      currentStage: existing.shippingStage,
      proposedStage,
      subject,
      text,
      vendor: extracted.vendor ?? existing.vendor,
    })
  ) {
    const mini = await parseShipmentEmailWithMini({
      subject,
      from,
      text,
      currentStage: existing.shippingStage,
      vendor: extracted.vendor ?? existing.vendor,
      orderNumber: existing.orderNumber,
      vendorOrderNumber: extracted.vendorOrderNumber ?? existing.vendorOrderNumber,
    });
    if (mini) {
      proposedStage = mini.shippingStage;
      miniAssisted = true;
      miniReason = mini.reason;
      miniConfidence = mini.confidence;
      extracted.currentLocation = mini.currentLocation;
    }
  }

  const { stage, guarded } = clampEmailShippingStage(existing.shippingStage, proposedStage, {
    miniApproved: miniAssisted,
    miniConfidence,
  });

  extracted.shippingStage = stage;
  extracted.status = statusForShippingStage(stage);
  if (!extracted.currentLocation || guarded) {
    extracted.currentLocation = locationForShippingStage(stage, extracted.vendor ?? existing.vendor);
  }
  extracted.miniAssisted = miniAssisted;
  extracted.stageGuarded = guarded;
  extracted.miniReason = miniReason;

  const noteParts: string[] = [];
  if (extracted.emailSubject) noteParts.push(`Email: ${extracted.emailSubject}`);
  if (miniAssisted && miniReason) noteParts.push(`Mini: ${miniReason}`);
  if (guarded) {
    noteParts.push(
      `Stage guard: limited advance to ${shippingStageLabel(stage)} (was ${shippingStageLabel(proposedStage)})`
    );
  }
  if (isAmbiguousShipmentEmailPhrase(subject, text, extracted.vendor ?? existing.vendor) && !miniAssisted) {
    noteParts.push('Ambiguous vendor tracking phrasing detected');
  }
  if (noteParts.length) {
    const block = noteParts.join(' — ');
    extracted.notes = extracted.notes ? `${extracted.notes}\n\n${block}` : block;
  }

  return extracted;
}

function fetchRecentMessages(config: EmailMonitoringConfig, limit = 15): Promise<Buffer[]> {
  return new Promise((resolve, reject) => {
    const imap = new Imap({
      user: config.user,
      password: config.password,
      host: config.host,
      port: config.port,
      tls: config.tls,
      tlsOptions: { rejectUnauthorized: false },
    });

    const messages: Buffer[] = [];

    imap.once('ready', () => {
      imap.openBox(config.folder, true, (err) => {
        if (err) {
          imap.end();
          reject(err);
          return;
        }

        imap.search(['UNSEEN'], (searchErr, results) => {
          const ids = searchErr || !results?.length ? [] : results.slice(-limit);
          if (!ids.length) {
            imap.end();
            resolve([]);
            return;
          }

          const fetcher = imap.fetch(ids, { bodies: '' });
          fetcher.on('message', (msg) => {
            msg.on('body', (stream) => {
              const chunks: Buffer[] = [];
              stream.on('data', (chunk) => chunks.push(Buffer.from(chunk)));
              stream.on('end', () => messages.push(Buffer.concat(chunks)));
            });
          });
          fetcher.once('error', (fetchErr) => {
            imap.end();
            reject(fetchErr);
          });
          fetcher.once('end', () => {
            imap.end();
          });
        });
      });
    });

    imap.once('error', reject);
    imap.once('end', () => resolve(messages));
    imap.connect();
  });
}

export async function runEmailMonitoringCheck() {
  const config = await getEmailMonitoringConfig();
  if (!config.enabled) {
    return { success: false, message: 'Email monitoring is disabled', processed: 0, updated: 0 };
  }
  if (!config.host || !config.user || !config.password) {
    return { success: false, message: 'Email monitoring is not configured', processed: 0, updated: 0 };
  }

  const rawMessages = await fetchRecentMessages(config);
  let processed = 0;
  let updated = 0;
  const shipmentUpdates: Array<{
    previous: SerializedOrder;
    order: SerializedOrder;
    meta?: { miniAssisted?: boolean; stageGuarded?: boolean; emailSubject?: string };
  }> = [];

  for (const raw of rawMessages) {
    processed += 1;
    const parsed = await simpleParser(raw);
    const subject = parsed.subject ?? '';
    const text = parsed.text ?? parsed.html?.toString() ?? '';
    const from = parsed.from?.text ?? '';
    let extracted = extractEmailUpdates(subject, text, from);
    if (!extracted) continue;

    const existing = await findOrderForEmailMonitoring(extracted);
    if (existing?.shippingStage && extracted.shippingStage) {
      extracted = await refineEmailUpdateWithMini(extracted, existing, subject, text, from);
    }

    const outcome = await applyEmailMonitoringUpdate(extracted);
    if (outcome) {
      updated += 1;
      shipmentUpdates.push({
        ...outcome,
        meta: {
          miniAssisted: extracted.miniAssisted,
          stageGuarded: extracted.stageGuarded,
          emailSubject: subject,
        },
      });
    }
  }

  await SystemConfig.setConfig('email_monitoring_last_check', new Date().toISOString(), 'string', 'email_monitoring');

  return {
    success: true,
    message: `Processed ${processed} email(s), updated ${updated} order(s)`,
    processed,
    updated,
    updates: shipmentUpdates,
  };
}

export async function getEmailMonitoringStatus() {
  const config = await getEmailMonitoringConfig();
  const lastCheck = await SystemConfig.getConfig<string>('email_monitoring_last_check', '');
  return {
    ...config,
    password: config.password ? '********' : '',
    lastCheck: lastCheck ?? null,
  };
}
