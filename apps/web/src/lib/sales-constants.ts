import type { SalesDealType, SalesProduct, SalesStage } from '@cd-v2/database';
import type { ActivationFeature } from '@/lib/license-constants';

export const SALES_STAGES = [
  'cold_prospect',
  'contact_made',
  'demo_completed',
  'proposal_sent',
  'won',
  'lost',
] as const satisfies readonly SalesStage[];

export const ACTIVE_PIPELINE_STAGES = [
  'cold_prospect',
  'contact_made',
  'demo_completed',
  'proposal_sent',
] as const satisfies readonly SalesStage[];

export const SALES_PRODUCTS = ['document', 'auto', 'distribution', 'ecommerce'] as const satisfies readonly SalesProduct[];

export const SALES_DEAL_TYPES = ['subscription', 'standalone'] as const satisfies readonly SalesDealType[];

export const CONTACT_CHANNELS = [
  { id: 'linkedin', label: 'LinkedIn' },
  { id: 'walk_in', label: 'Walk-in' },
  { id: 'phone', label: 'Phone call' },
  { id: 'instagram', label: 'Instagram DM' },
  { id: 'email', label: 'Email' },
  { id: 'whatsapp', label: 'WhatsApp' },
  { id: 'other', label: 'Other' },
] as const;

export function contactChannelLabel(id: string): string {
  return CONTACT_CHANNELS.find((c) => c.id === id)?.label ?? id;
}

export const STAGE_LABELS: Record<SalesStage, string> = {
  cold_prospect: 'Cold Prospect',
  contact_made: 'Contact Made',
  demo_completed: 'Demo Completed',
  proposal_sent: 'Proposal Sent',
  won: 'Won / Active',
  lost: 'Lost',
};

export const STAGE_DESCRIPTIONS: Record<(typeof ACTIVE_PIPELINE_STAGES)[number], string> = {
  cold_prospect: 'Add a business that matches one of your software products but has not been contacted yet.',
  contact_made: 'You reached the gatekeeper or owner and delivered your industry-specific hook.',
  demo_completed: 'They viewed your pre-built system live and confirmed it solves their operational headache.',
  proposal_sent: 'Send the scope of work, timeline, and pricing (subscription or standalone).',
};

export const PRODUCT_LABELS: Record<SalesProduct, string> = {
  document: 'Law Firm Document Manager',
  auto: 'Auto Maintenance Ticket CRM',
  distribution: 'Wholesale Distribution System',
  ecommerce: 'E-commerce Web Store',
};

export const PRODUCT_TO_FEATURE: Record<SalesProduct, ActivationFeature> = {
  document: 'document',
  auto: 'auto',
  distribution: 'distribution',
  ecommerce: 'ecommerce',
};

/** Live demo slug served at /demo/<slug>/ */
export const PRODUCT_DEMO_SLUG: Record<SalesProduct, string> = {
  document: 'lawfirm',
  auto: 'autom-jsd-management',
  distribution: 'distribution',
  ecommerce: 'pos-2026-05-27-demo',
};

export const PRODUCT_LEARN_MORE: Record<SalesProduct, string> = {
  document: '/document-management.html',
  auto: '/auto-system.html',
  distribution: '/distribution-system.html',
  ecommerce: '/pos-system-learn-more.html',
};

export const PRODUCT_TARGET_PROFILE: Record<SalesProduct, string> = {
  document: 'Mid-sized chambers using paper files or basic Google Drive setups.',
  auto: 'Independent garages tracking parts and vehicle statuses on paper tags or text messages.',
  distribution: 'Distributors in industrial estates using old desktop systems or paper ledgers.',
  ecommerce: 'Local shops selling only via Instagram/WhatsApp without a proper checkout system.',
};

export const PRODUCT_PITCH_HOOK: Record<SalesProduct, string> = {
  document: 'Secure document archiving with fast OCR/PDF search — no more digging through paper files.',
  auto: 'Digital tracking card on a phone — tap "Parts Ordered" instead of paper tags.',
  distribution: 'Automated client ordering portal with multi-tier wholesale pricing.',
  ecommerce: 'Automated web store with local shipping fees — customers checkout without WhatsApp back-and-forth.',
};

export const PRODUCT_DEMO_HIGHLIGHT: Record<SalesProduct, string> = {
  document: 'Show how fast the OCR/PDF search engine works.',
  auto: 'Show the mechanic tapping "Parts Ordered" on a phone screen.',
  distribution: 'Show multi-tier wholesale pricing working live.',
  ecommerce: 'Show a customer adding an item to cart and checking out.',
};

export const DEAL_TYPE_LABELS: Record<SalesDealType, string> = {
  subscription: 'Subscription',
  standalone: 'Standalone Deployment',
};

export const DEFAULT_SUBSCRIPTION_RATE = 1500;
export const DEFAULT_STANDALONE_VALUE = 9000;
export const DEFAULT_STANDALONE_DEPOSIT = 4500;

export const STAGE_COLORS: Record<SalesStage, string> = {
  cold_prospect: 'bg-slate-100 text-slate-700 border-slate-200',
  contact_made: 'bg-blue-50 text-blue-800 border-blue-200',
  demo_completed: 'bg-violet-50 text-violet-800 border-violet-200',
  proposal_sent: 'bg-amber-50 text-amber-800 border-amber-200',
  won: 'bg-emerald-50 text-emerald-800 border-emerald-200',
  lost: 'bg-red-50 text-red-700 border-red-200',
};

export function stageIndex(stage: SalesStage): number {
  return SALES_STAGES.indexOf(stage);
}

export function isActivePipelineStage(stage: SalesStage): boolean {
  return (ACTIVE_PIPELINE_STAGES as readonly string[]).includes(stage);
}

export function nextStage(stage: SalesStage): SalesStage | null {
  const idx = ACTIVE_PIPELINE_STAGES.indexOf(stage as (typeof ACTIVE_PIPELINE_STAGES)[number]);
  if (idx < 0 || idx >= ACTIVE_PIPELINE_STAGES.length - 1) return null;
  return ACTIVE_PIPELINE_STAGES[idx + 1];
}

export function previousStage(stage: SalesStage): SalesStage | null {
  const idx = ACTIVE_PIPELINE_STAGES.indexOf(stage as (typeof ACTIVE_PIPELINE_STAGES)[number]);
  if (idx <= 0) return null;
  return ACTIVE_PIPELINE_STAGES[idx - 1];
}

export function demoUrl(slug: string, origin?: string) {
  const base = origin ?? '';
  return `${base}/demo/${slug}/`;
}

export function buildDefaultQuoteTerms(dealType: SalesDealType) {
  if (dealType === 'subscription') {
    return 'Monthly subscription includes hosting, standard user limits, and out-of-the-box software. First month due on activation.';
  }
  return '50% mobilization deposit due on acceptance. Remaining balance on go-live. Scope covers custom modifications, local database setup, and data migration per attached scope.';
}

export function buildDefaultQuoteItems(
  product: SalesProduct,
  dealType: SalesDealType,
  monthlyRate: number,
  projectValue: number,
  depositAmount: number
) {
  const name = PRODUCT_LABELS[product];
  if (dealType === 'subscription') {
    return [
      {
        name: `${name} — Subscription`,
        description: 'Out-of-the-box software subscription, standard user limits',
        quantity: 1,
        price: monthlyRate,
        total: monthlyRate,
      },
    ];
  }
  return [
    {
      name: `${name} — Standalone Deployment`,
      description: 'Custom code modifications, local database, data migration',
      quantity: 1,
      price: projectValue,
      total: projectValue,
    },
    {
      name: 'Mobilization deposit (50%)',
      description: 'Due on contract acceptance',
      quantity: 1,
      price: depositAmount,
      total: depositAmount,
    },
  ];
}

export function quoteAmountForDeal(
  dealType: SalesDealType,
  monthlyRate: number,
  projectValue: number
) {
  return dealType === 'subscription' ? monthlyRate : projectValue;
}
