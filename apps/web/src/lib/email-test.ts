import type { Attachment } from "nodemailer/lib/mailer";

import { buildWelcomeEmailHtml, sendEmail } from "@/lib/email";
import { buildPortalUrl } from "@/lib/site-url";

import {
  escapeHtml,
  getEmailBrand,
  type EmailBrand,
  paragraph,
  renderEmailLayout,
} from "@/lib/email-templates";

import {
  buildInvoiceEmailHtml,
  type InvoiceEmailType,
} from "@/lib/invoice-email";

import { buildQuoteEmailHtml } from "@/lib/quote-email";

import {
  buildTicketEmailHtml,
  type TicketEmailTemplate,
} from "@/lib/ticket-notifications";

import {
  buildOrderEmailPreview,
  type OrderEmailTemplate,
} from "@/lib/order-notifications";

const SAMPLE_TICKET = {
  ticketNumber: "TKT-2026-0001",

  issue: "Unable to connect to office VPN after password reset",

  status: "In-progress",

  priority: "high",

  clientName: "Sample Client Ltd.",
};

const SAMPLE_INVOICE = {
  id: "test-invoice-preview",

  invoiceNumber: "INV-2026-001",

  amount: 2450,

  paidAmount: 0,

  currency: "TTD",

  status: "sent",

  dueDate: new Date(Date.now() + 14 * 86400000).toISOString(),

  description: "Monthly managed IT services — sample preview",
};

const SAMPLE_QUOTE = {
  id: "test-quote-preview",

  quoteNumber: "QTE-2026-001",

  title: "Network upgrade and workstation setup",

  amount: 8750,

  currency: "TTD",

  status: "sent",

  description: "Replacement switches, cabling, and workstation configuration.",

  validUntil: new Date(Date.now() + 30 * 86400000).toISOString(),

  notes:
    "Parts subject to availability. Installation scheduled after acceptance.",

  items: [
    {
      name: "Managed switch 24-port",
      description: "Core office switch",
      quantity: 1,
      price: 3200,
      total: 3200,
    },

    {
      name: "Workstation setup",
      description: "Per device",
      quantity: 3,
      price: 450,
      total: 1350,
    },

    {
      name: "Structured cabling",
      description: "Labour and materials",
      quantity: 1,
      price: 4200,
      total: 4200,
    },
  ],

  client: { name: "Sample Client Ltd." },
};

const INVOICE_TYPES: InvoiceEmailType[] = [
  "created",

  "reminder",

  "overdue",

  "paid",

  "partial",

  "updated",
];

const TICKET_TEMPLATES: TicketEmailTemplate[] = [
  "created-client",

  "created-staff",

  "assigned",

  "status-change",

  "resolved",

  "comment",

  "escalated",
];

const ORDER_TEMPLATES: OrderEmailTemplate[] = [
  "created",

  "status_update",

  "shipped",

  "arrived",

  "delivered",

  "cancelled",

  "pre_alert",
];

export type TemplateTestResult = {
  sent: number;

  failed: number;

  total: number;

  /** Number of distinct emails delivered (bundled groups). */

  emailCount: number;

  /** Individual template previews included in the bundles. */

  templateCount: number;

  templates: string[];

  errors: string[];
};

type TemplatePreview = {
  name: string;

  subject: string;

  html: string;

  attachments?: Attachment[];
};

type TemplateGroup = {
  title: string;

  items: TemplatePreview[];
};

const BODY_CONTENT_START = '<td style="padding:28px 32px;">';

const BODY_CONTENT_END = '<td style="padding:0 32px 28px;">';

/** Pull main body HTML from a full rendered template message. */

function extractEmailBodyContent(html: string): string {
  const start = html.indexOf(BODY_CONTENT_START);

  if (start === -1) return html;

  const contentStart = start + BODY_CONTENT_START.length;

  const end = html.indexOf(BODY_CONTENT_END, contentStart);

  if (end === -1) return html.slice(contentStart).trim();

  return html.slice(contentStart, end).trim();
}

function mergeAttachments(
  ...lists: (Attachment[] | undefined)[]
): Attachment[] {
  const seen = new Set<string>();

  const out: Attachment[] = [];

  for (const list of lists) {
    if (!list) continue;

    for (const attachment of list) {
      const key = String(attachment.cid ?? attachment.filename ?? out.length);

      if (seen.has(key)) continue;

      seen.add(key);

      out.push(attachment);
    }
  }

  return out;
}

function templateSection(
  name: string,
  sampleSubject: string,
  bodyContent: string,
): string {
  return `

    <div style="margin:32px 0 0;padding-top:28px;border-top:2px solid #e2e8f0;">

      <div style="margin-bottom:12px;">

        <div style="font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#6366f1;">Preview</div>

        <div style="font-size:16px;font-weight:700;color:#0f172a;">${escapeHtml(name)}</div>

        <div style="margin-top:4px;font-size:12px;color:#64748b;">Sample subject: ${escapeHtml(sampleSubject)}</div>

      </div>

      ${bodyContent}

    </div>`;
}

async function buildAllTemplatePreviews(
  origin?: string,
): Promise<TemplatePreview[]> {
  const portalUrl = await buildPortalUrl(origin);

  const previews: TemplatePreview[] = [];

  const welcome = await buildWelcomeEmailHtml({
    contactPerson: "Sample Client",

    username: "sample.client",

    tempPassword: "TempPass123!",

    portalUrl,

    origin,

    test: true,
  });

  previews.push({ name: "Welcome — client portal", ...welcome });

  for (const type of INVOICE_TYPES) {
    const invoice = {
      ...SAMPLE_INVOICE,

      status:
        type === "paid"
          ? "paid"
          : type === "overdue"
            ? "overdue"
            : type === "partial"
              ? "partial"
              : "sent",

      paidAmount:
        type === "paid" ? SAMPLE_INVOICE.amount : type === "partial" ? 1000 : 0,
    };

    const built = await buildInvoiceEmailHtml(invoice, {
      origin,

      type,

      test: true,

      paymentAmount: type === "partial" ? 1000 : undefined,
    });

    previews.push({ name: `Invoice — ${type}`, ...built });
  }

  const quote = await buildQuoteEmailHtml(SAMPLE_QUOTE, { origin, test: true });

  previews.push({ name: "Quote — sent", ...quote });

  for (const template of TICKET_TEMPLATES) {
    const built = await buildTicketEmailHtml({
      template,

      ticket: SAMPLE_TICKET,

      origin,

      test: true,

      createdByName: "Admin User",

      updatedBy: "Technician",

      oldStatus: "open",

      resolution: "VPN profile reconfigured and connection verified remotely.",

      commentAuthor: "Support Technician",

      commentText:
        "We reset your VPN certificate and confirmed access from your device.",

      escalatedBy: "Technician",

      escalationReason: "Requires senior network engineer review.",
    });

    previews.push({ name: `Ticket — ${template}`, ...built });
  }

  for (const template of ORDER_TEMPLATES) {
    const built = await buildOrderEmailPreview(template, {
      origin,
      test: true,
    });

    previews.push({ name: `Order — ${template}`, ...built });
  }

  return previews;
}

function groupPreviews(previews: TemplatePreview[]): TemplateGroup[] {
  const welcome = previews.find((p) => p.name.startsWith("Welcome"));

  const quote = previews.find((p) => p.name.startsWith("Quote"));

  const invoices = previews.filter((p) => p.name.startsWith("Invoice"));

  const tickets = previews.filter((p) => p.name.startsWith("Ticket"));

  const orders = previews.filter((p) => p.name.startsWith("Order"));

  const groups: TemplateGroup[] = [];

  const welcomeQuote = [welcome, quote].filter(Boolean) as TemplatePreview[];

  if (welcomeQuote.length)
    groups.push({ title: "Welcome & quotes", items: welcomeQuote });

  if (invoices.length) groups.push({ title: "Invoices", items: invoices });

  if (tickets.length) groups.push({ title: "Support tickets", items: tickets });

  if (orders.length) groups.push({ title: "Parts orders", items: orders });

  return groups;
}

async function sendBundledGroupEmail(
  to: string,

  brand: EmailBrand,

  origin: string | undefined,

  group: TemplateGroup,
): Promise<boolean> {
  const intro = paragraph(
    `This message bundles <strong>${group.items.length}</strong> sample template preview(s). Each section below shows how that automated email would appear when sent from ${escapeHtml(brand.companyName)}.`,
  );

  const sections = group.items.map((item) =>
    templateSection(
      item.name,
      item.subject,
      extractEmailBodyContent(item.html),
    ),
  );

  const rendered = await renderEmailLayout({
    brand,

    origin,

    eyebrow: "Template test",

    title: group.title,

    preheader: `${group.items.length} template previews`,

    bodyHtml: intro + sections.join(""),

    footerNote: "Sample data only — bundled template test email.",
  });

  const attachments = mergeAttachments(
    rendered.attachments,

    ...group.items.map((item) => item.attachments),
  );

  return sendEmail({
    to,

    subject: `[TEST] Email templates — ${group.title} — ${brand.companyName}`,

    html: rendered.html,

    attachments,
    skipFailureNotice: true,
    log: { category: 'test' },
  });
}

export async function sendAllTemplateTestEmails(
  to: string,

  origin?: string,
): Promise<TemplateTestResult> {
  const brand = await getEmailBrand();

  const previews = await buildAllTemplatePreviews(origin);

  const groups = groupPreviews(previews);

  const templates = previews.map((p) => p.name);

  const errors: string[] = [];

  let sent = 0;

  let failed = 0;

  for (const group of groups) {
    const ok = await sendBundledGroupEmail(to, brand, origin, group);

    if (ok) sent += 1;
    else {
      failed += 1;

      errors.push(group.title);
    }
  }

  return {
    sent,

    failed,

    total: groups.length,

    emailCount: groups.length,

    templateCount: previews.length,

    templates,

    errors,
  };
}
