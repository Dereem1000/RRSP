import fs from 'fs/promises';
import path from 'path';
import { Client } from '@/lib/db';
import { ACTIVATION_FEATURE_LABELS, type ActivationFeature } from '@/lib/license-constants';
import { getProductConfig } from '@/lib/management-system-product-config';
import type { ManagementSystemEngagement } from '@/lib/management-system-engagements';
import {
  applyPlaceholders,
  extractPlaceholders,
  toClientDeliverable,
} from '@/lib/deliverable-template';

export {
  applyPlaceholders,
  extractPlaceholders,
  toClientDeliverable,
  getPlaceholderFieldMeta,
  PLACEHOLDER_FIELD_META,
} from '@/lib/deliverable-template';

export function buildDefaultPlaceholders(
  template: string,
  client: Pick<
    Client,
    'name' | 'companyName' | 'email' | 'phone' | 'contactPerson' | 'monthlyRate' | 'contractDetails'
  >,
  feature: ActivationFeature,
  engagement?: ManagementSystemEngagement | null
): Record<string, string> {
  const tokens = extractPlaceholders(template);
  const company = client.companyName || client.name || '';
  const contactParts = [client.contactPerson, client.email, client.phone].filter(Boolean);
  const contractRef =
    typeof client.contractDetails === 'object' && client.contractDetails
      ? String((client.contractDetails as Record<string, unknown>).reference || '')
      : '';
  const fee =
    client.monthlyRate && client.monthlyRate > 0
      ? `TTD $${client.monthlyRate.toLocaleString('en-TT', { minimumFractionDigits: 2 })}`
      : '';

  const defaults: Record<string, string> = {
    '[Client / Organization Name]': company,
    '[Client Name]': company,
    '[Name, email, phone]': contactParts.join(' · ') || client.email,
    '[Project / Invoice Reference]': contractRef,
    '[TTD $X,XXX.XX]': fee,
    '[Agreed project fee]': fee,
    '[Define if any — e.g. 30 days for defect fixes on delivered scope only]': '30 days for defect fixes on delivered scope only',
    '[N]': '3',
    '[Page 1 name / description]': '',
    '[Page 2 name / description]': '',
  };

  const label = ACTIVATION_FEATURE_LABELS[feature];
  if (label?.title) {
    defaults['[Client Name]'] = company;
  }

  const map: Record<string, string> = {};
  for (const token of tokens) {
    map[token] =
      engagement?.deliverableDraft?.placeholders?.[token] ??
      defaults[token] ??
      '';
  }
  return map;
}

export async function loadDeliverableTemplate(templatePath: string): Promise<string> {
  const resolved = path.resolve(templatePath);
  return fs.readFile(resolved, 'utf8');
}

export async function buildDeliverableDocument(input: {
  clientId: string;
  feature: ActivationFeature;
  placeholders?: Record<string, string>;
  engagement?: ManagementSystemEngagement | null;
}): Promise<{
  templatePath: string;
  templateMarkdown: string;
  placeholders: Record<string, string>;
  staffMarkdown: string;
  clientMarkdown: string;
}> {
  const client = await Client.findByPk(input.clientId, {
    attributes: [
      'id',
      'name',
      'companyName',
      'email',
      'phone',
      'contactPerson',
      'monthlyRate',
      'contractDetails',
    ],
  });
  if (!client) throw new Error('Client not found');

  const product = await getProductConfig(input.feature);
  if (!product.deliverableTemplatePath?.trim()) {
    throw new Error('Deliverable template path is not configured for this product');
  }

  const template = await loadDeliverableTemplate(product.deliverableTemplatePath);
  const placeholders =
    input.placeholders ??
    buildDefaultPlaceholders(template, client, input.feature, input.engagement);
  const staffMarkdown = applyPlaceholders(template, placeholders);
  const clientMarkdown = toClientDeliverable(staffMarkdown);

  return {
    templatePath: product.deliverableTemplatePath,
    templateMarkdown: template,
    placeholders,
    staffMarkdown,
    clientMarkdown,
  };
}

/** Lightweight markdown preview (headings, bold, lists, code). */
export { renderMarkdownPreview } from '@/lib/deliverable-markdown-preview';
