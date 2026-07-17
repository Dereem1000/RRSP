import { Op } from 'sequelize';
import {
  Client,
  SalesOpportunity,
  ensureSalesSchema,
  getSequelize,
  type SalesDealType,
  type SalesProduct,
  type SalesStage,
} from '@cd-v2/database';
import {
  buildDefaultQuoteItems,
  buildDefaultQuoteTerms,
  DEFAULT_STANDALONE_DEPOSIT,
  DEFAULT_STANDALONE_VALUE,
  DEFAULT_SUBSCRIPTION_RATE,
  PRODUCT_LABELS,
  PRODUCT_TO_FEATURE,
  contactChannelLabel,
  previousStage,
  quoteAmountForDeal,
  STAGE_LABELS,
} from '@/lib/sales-constants';
import { createQuote, getQuoteById, sendQuoteEmail } from '@/lib/accounting';
import { getActivationFeatures } from '@/lib/license-constants';
import { syncClientToLicenseSystem } from '@/lib/license-sync';
import { normalizeStoredPhone } from '@/lib/phone-utils';
import { createCalendarEvent, formatScheduledLabel } from '@/lib/calendar';

export type CommunicationEntry = {
  at: string;
  type: string;
  summary: string;
  scheduledAt?: string;
  calendarEventId?: string;
};

export function isSalesStagingClient(contractDetails: unknown): boolean {
  if (!contractDetails || typeof contractDetails !== 'object') return false;
  return Boolean((contractDetails as Record<string, unknown>).isSalesStaging);
}

export function serializeOpportunity(opp: SalesOpportunity) {
  const json = opp.toJSON() as unknown as Record<string, unknown>;
  if (json.monthlyRate != null) json.monthlyRate = Number(json.monthlyRate);
  if (json.projectValue != null) json.projectValue = Number(json.projectValue);
  if (json.depositAmount != null) json.depositAmount = Number(json.depositAmount);
  if (json.updatedAt != null && json.updated_at == null) {
    json.updated_at = json.updatedAt;
  }
  if (typeof json.communications === 'string') {
    try {
      json.communications = JSON.parse(json.communications);
    } catch {
      json.communications = [];
    }
  }
  return json;
}

export async function listOpportunities(filters?: {
  stage?: SalesStage | 'active' | 'closed';
  product?: SalesProduct;
}) {
  await ensureSalesSchema();
  const where: Record<string, unknown> = {};

  if (filters?.stage === 'active') {
    where.stage = {
      [Op.in]: ['cold_prospect', 'contact_made', 'demo_completed', 'proposal_sent'],
    };
  } else if (filters?.stage === 'closed') {
    where.stage = { [Op.in]: ['won', 'lost'] };
  } else if (filters?.stage) {
    where.stage = filters.stage;
  }

  if (filters?.product) where.product = filters.product;

  const rows = await SalesOpportunity.findAll({
    where,
    order: [['updated_at', 'DESC']],
  });
  return rows.map(serializeOpportunity);
}

export async function getOpportunityById(id: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  return opp ? serializeOpportunity(opp) : null;
}

export async function createOpportunity(input: {
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  product: SalesProduct;
  pitchNotes?: string | null;
  clientId?: string | null;
  createdBy: number;
}) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.create({
    companyName: input.companyName.trim(),
    contactName: input.contactName.trim(),
    email: input.email?.trim() || null,
    phone: normalizeStoredPhone(input.phone?.trim() || null),
    address: input.address?.trim() || null,
    product: input.product,
    pitchNotes: input.pitchNotes?.trim() || null,
    stage: 'cold_prospect',
    communications: [],
    createdBy: input.createdBy,
  });

  if (input.clientId) {
    await linkClientToOpportunity(opp.id, input.clientId);
    await opp.reload();
  }

  return serializeOpportunity(opp);
}

export async function updateOpportunity(
  id: string,
  updates: Partial<{
    companyName: string;
    contactName: string;
    email: string | null;
    phone: string | null;
    address: string | null;
    product: SalesProduct;
    pitchNotes: string | null;
    demoNotes: string | null;
    scopeNotes: string | null;
    dealType: SalesDealType | null;
    monthlyRate: number | null;
    projectValue: number | null;
    depositAmount: number | null;
    contactChannel: string | null;
    assignedTo: number | null;
    clientId: string | null;
  }>
) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage === 'won' || opp.stage === 'lost') {
    throw new Error('Closed opportunities cannot be edited');
  }

  const { clientId, ...rest } = updates;

  if (clientId) {
    await linkClientToOpportunity(id, clientId);
  }

  await opp.reload();

  if (rest.email !== undefined && rest.email?.trim()) {
    const match = await Client.findOne({ where: { email: rest.email.trim() } });
    if (match) {
      await applyOpportunityClientLink(opp, match);
      await opp.reload();
    }
  }

  if (Object.keys(rest).length > 0) {
    if (rest.phone !== undefined) {
      rest.phone = normalizeStoredPhone(rest.phone);
    }
    await opp.update(rest);
  }

  return serializeOpportunity(opp);
}

function appendCommunication(
  opp: SalesOpportunity,
  type: string,
  summary: string,
  extra?: Pick<CommunicationEntry, 'scheduledAt' | 'calendarEventId'>
) {
  const list = Array.isArray(opp.communications)
    ? [...(opp.communications as CommunicationEntry[])]
    : [];
  list.unshift({ at: new Date().toISOString(), type, summary, ...extra });
  return list.slice(0, 50);
}

function mergeProductFeatures(clientFeatures: unknown, product: SalesProduct) {
  const feature = PRODUCT_TO_FEATURE[product];
  const existing = getActivationFeatures(clientFeatures);
  const set = new Set([...existing, feature]);
  return Array.from(set);
}

async function applyOpportunityClientLink(opp: SalesOpportunity, client: Client) {
  const mergedFeatures = mergeProductFeatures(client.features, opp.product);
  const contractDetails = {
    ...((client.contractDetails as Record<string, unknown>) ?? {}),
    salesOpportunityId: opp.id,
  };

  const clientUpdates: Record<string, unknown> = {
    contractDetails,
    features: mergedFeatures,
  };

  if (!client.phone && opp.phone) clientUpdates.phone = opp.phone;
  if (!client.address && opp.address) clientUpdates.address = opp.address;
  if (!client.contactPerson && opp.contactName) clientUpdates.contactPerson = opp.contactName;
  if (!client.companyName && opp.companyName) clientUpdates.companyName = opp.companyName;

  await client.update(clientUpdates);
  await opp.update({
    clientId: client.id,
    email: opp.email?.trim() || client.email,
  });

  return client;
}

export async function linkClientToOpportunity(opportunityId: string, clientId: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(opportunityId);
  if (!opp) throw new Error('Opportunity not found');
  if (opp.stage === 'won' || opp.stage === 'lost') {
    throw new Error('Closed opportunities cannot be relinked');
  }

  const client = await Client.findByPk(clientId);
  if (!client) throw new Error('Client not found');

  await applyOpportunityClientLink(opp, client);
  await opp.reload();
  return serializeOpportunity(opp);
}

async function ensureStagingClient(opp: SalesOpportunity) {
  if (opp.clientId) {
    const linked = await Client.findByPk(opp.clientId);
    if (linked) {
      await applyOpportunityClientLink(opp, linked);
      return linked;
    }
  }

  const email = opp.email?.trim();
  if (!email && !opp.clientId) {
    throw new Error('Add an email or link an existing client before sending a proposal');
  }

  const existingByEmail = await Client.findOne({ where: { email: email! } });
  if (existingByEmail) {
    await applyOpportunityClientLink(opp, existingByEmail);
    return existingByEmail;
  }

  if (!email) {
    throw new Error('Add an email before creating a staging client');
  }

  const feature = PRODUCT_TO_FEATURE[opp.product];
  const client = await Client.create({
    name: opp.contactName,
    companyName: opp.companyName,
    email,
    phone: normalizeStoredPhone(opp.phone),
    address: opp.address,
    contactPerson: opp.contactName,
    status: 'pending',
    isActive: false,
    serviceLevel: 'per-job',
    monthlyRate: 0,
    features: [feature],
    contractDetails: {
      salesOpportunityId: opp.id,
      isSalesStaging: true,
    },
    communicationHistory: [],
  });

  await opp.update({ clientId: client.id });
  return client;
}

export async function advanceOpportunity(
  id: string,
  payload: {
    contactChannel?: string;
    contactNotes?: string;
    demoNotes?: string;
    dealType?: SalesDealType;
    monthlyRate?: number;
    projectValue?: number;
    depositAmount?: number;
    scopeNotes?: string;
    sendQuoteEmail?: boolean;
    quoteOrigin?: string;
    createdBy?: number;
  }
) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage === 'won' || opp.stage === 'lost') {
    throw new Error('This opportunity is already closed');
  }

  const now = new Date();

  if (opp.stage === 'cold_prospect') {
    if (!payload.contactChannel) throw new Error('Select how you made contact');
    await opp.update({
      stage: 'contact_made',
      contactChannel: payload.contactChannel,
      contactMadeAt: now,
      pitchNotes: payload.contactNotes?.trim() || opp.pitchNotes,
      communications: appendCommunication(
        opp,
        'contact',
        `Contact via ${payload.contactChannel}${payload.contactNotes ? `: ${payload.contactNotes}` : ''}`
      ),
    });
    return serializeOpportunity(opp);
  }

  if (opp.stage === 'contact_made') {
    await opp.update({
      stage: 'demo_completed',
      demoCompletedAt: now,
      demoNotes: payload.demoNotes?.trim() || opp.demoNotes,
      communications: appendCommunication(
        opp,
        'demo',
        payload.demoNotes?.trim() || 'Live demo completed with prospect'
      ),
    });
    return serializeOpportunity(opp);
  }

  if (opp.stage === 'demo_completed') {
    const dealType = payload.dealType;
    if (!dealType) throw new Error('Choose subscription or standalone pricing');

    const monthlyRate =
      dealType === 'subscription'
        ? Number(payload.monthlyRate ?? DEFAULT_SUBSCRIPTION_RATE)
        : null;
    const projectValue =
      dealType === 'standalone'
        ? Number(payload.projectValue ?? DEFAULT_STANDALONE_VALUE)
        : null;
    const depositAmount =
      dealType === 'standalone'
        ? Number(payload.depositAmount ?? DEFAULT_STANDALONE_DEPOSIT)
        : null;

    const client = await ensureStagingClient(opp);
    const items = buildDefaultQuoteItems(
      opp.product,
      dealType,
      monthlyRate ?? DEFAULT_SUBSCRIPTION_RATE,
      projectValue ?? DEFAULT_STANDALONE_VALUE,
      depositAmount ?? DEFAULT_STANDALONE_DEPOSIT
    );
    const amount = quoteAmountForDeal(
      dealType,
      monthlyRate ?? DEFAULT_SUBSCRIPTION_RATE,
      projectValue ?? DEFAULT_STANDALONE_VALUE
    );
    const validUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const title = `${PRODUCT_LABELS[opp.product]} — ${dealType === 'subscription' ? 'Subscription' : 'Standalone'} Proposal`;

    const quote = await createQuote({
      clientId: client.id,
      title,
      amount,
      validUntil,
      createdBy: payload.createdBy ?? opp.createdBy ?? 1,
      items,
      description: payload.scopeNotes?.trim() || opp.scopeNotes || undefined,
      terms: buildDefaultQuoteTerms(dealType),
      notes: `Sales opportunity ${opp.id}`,
      status: 'draft',
    });

    if (!quote) throw new Error('Failed to create quote');

    let finalQuote = quote;
    if (payload.sendQuoteEmail) {
      const sent = await sendQuoteEmail(quote.id, client.email ?? opp.email ?? undefined, payload.quoteOrigin);
      if (sent) finalQuote = sent;
    }

    await opp.update({
      stage: 'proposal_sent',
      dealType,
      monthlyRate,
      projectValue,
      depositAmount,
      scopeNotes: payload.scopeNotes?.trim() || opp.scopeNotes,
      quoteId: finalQuote.id,
      communications: appendCommunication(
        opp,
        'proposal',
        `Proposal ${finalQuote.quoteNumber} created${payload.sendQuoteEmail ? ' and emailed' : ''}`
      ),
    });
    return serializeOpportunity(opp);
  }

  throw new Error('Use convert endpoint to close a won deal from proposal stage');
}

function revertFieldsForStage(fromStage: SalesStage) {
  if (fromStage === 'proposal_sent') {
    return {
      quoteId: null,
      dealType: null,
      monthlyRate: null,
      projectValue: null,
      depositAmount: null,
    };
  }
  if (fromStage === 'demo_completed') {
    return { demoCompletedAt: null };
  }
  if (fromStage === 'contact_made') {
    return { contactChannel: null, contactMadeAt: null };
  }
  return {};
}

export async function logOpportunityInteraction(
  id: string,
  payload: { channel: string; notes?: string; scheduledAt?: string; createdBy?: number }
) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage !== 'contact_made') {
    throw new Error('Interactions can only be logged while in Contact Made');
  }

  const channel = payload.channel?.trim();
  if (!channel) throw new Error('Select how you reached them');

  const notes = payload.notes?.trim();
  const channelLabel = contactChannelLabel(channel);
  let summary = notes ? `${channelLabel}: ${notes}` : `Follow-up via ${channelLabel}`;
  let scheduledAt: string | undefined;
  let calendarEventId: string | undefined;

  if (payload.scheduledAt?.trim()) {
    const when = new Date(payload.scheduledAt);
    if (Number.isNaN(when.getTime())) {
      throw new Error('Invalid follow-up date/time');
    }
    scheduledAt = when.toISOString();
    const event = await createCalendarEvent({
      title: `Follow-up: ${opp.companyName}`,
      notes: notes || summary,
      scheduledAt,
      opportunityId: opp.id,
      clientId: opp.clientId,
      createdBy: payload.createdBy ?? opp.createdBy,
    });
    calendarEventId = event.id;
    summary = `${summary} — scheduled ${formatScheduledLabel(scheduledAt)}`;
  }

  await opp.update({
    communications: appendCommunication(opp, 'interaction', summary, {
      scheduledAt,
      calendarEventId,
    }),
  });

  return serializeOpportunity(opp);
}

export async function deferColdProspect(id: string, reason?: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage !== 'cold_prospect') {
    throw new Error('Only cold prospects can be moved to the bottom of the queue');
  }

  const oldest = await SalesOpportunity.findOne({
    where: {
      stage: 'cold_prospect',
      id: { [Op.ne]: id },
    },
    order: [['updated_at', 'ASC']],
    attributes: ['updated_at'],
  });

  const oldestAt = oldest?.updated_at ? new Date(oldest.updated_at) : new Date();
  const deferredAt = new Date(oldestAt.getTime() - 60_000);

  const summary =
    reason?.trim() || 'No answer — moved to bottom of cold prospect queue';
  await opp.update({
    communications: appendCommunication(opp, 'defer', summary),
  });

  await getSequelize().query('UPDATE sales_opportunities SET updated_at = :updatedAt WHERE id = :id', {
    replacements: { updatedAt: deferredAt.toISOString(), id },
  });

  await opp.reload();
  return serializeOpportunity(opp);
}

export async function revertOpportunityStage(id: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage === 'won' || opp.stage === 'lost') {
    throw new Error('Closed opportunities cannot be moved back in the pipeline');
  }

  const prior = previousStage(opp.stage);
  if (!prior) throw new Error('Already at the first pipeline stage');

  await opp.update({
    stage: prior,
    ...revertFieldsForStage(opp.stage),
    communications: appendCommunication(
      opp,
      'revert',
      `Moved back to ${STAGE_LABELS[prior]}`
    ),
  });

  return serializeOpportunity(opp);
}

export async function reopenOpportunity(id: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage !== 'lost') {
    throw new Error('Only archived opportunities can be reopened');
  }

  await opp.update({
    stage: 'cold_prospect',
    lostReason: null,
    lostAt: null,
    communications: appendCommunication(opp, 'reopen', 'Reopened in pipeline'),
  });

  return serializeOpportunity(opp);
}

async function detachOpportunityFromClient(client: Client) {
  const contractDetails = { ...((client.contractDetails as Record<string, unknown>) ?? {}) };
  delete contractDetails.salesOpportunityId;
  await client.update({ contractDetails });
}

export async function deleteOpportunity(id: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage === 'won') {
    throw new Error('Won deals cannot be deleted — manage the client record instead');
  }

  const clientId = opp.clientId;
  await opp.destroy();

  if (clientId) {
    const client = await Client.findByPk(clientId);
    if (client) {
      if (isSalesStagingClient(client.contractDetails)) {
        await client.destroy();
      } else {
        await detachOpportunityFromClient(client);
      }
    }
  }

  return { deleted: true, id };
}

export async function markOpportunityLost(id: string, lostReason: string) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage === 'won') throw new Error('Won deals cannot be marked lost');

  await opp.update({
    stage: 'lost',
    lostReason: lostReason.trim(),
    lostAt: new Date(),
    communications: appendCommunication(opp, 'lost', lostReason.trim()),
  });

  if (opp.clientId) {
    const client = await Client.findByPk(opp.clientId);
    if (client && isSalesStagingClient(client.contractDetails)) {
      await client.update({ status: 'inactive', isActive: false });
    }
  }

  return serializeOpportunity(opp);
}

export async function convertOpportunityToClient(
  id: string,
  options: { syncLicenses?: boolean; createPortalAccount?: boolean } = {}
) {
  await ensureSalesSchema();
  const opp = await SalesOpportunity.findByPk(id);
  if (!opp) return null;
  if (opp.stage !== 'proposal_sent') {
    throw new Error('Only opportunities with a sent proposal can be converted');
  }

  const client = await ensureStagingClient(opp);
  const mergedFeatures = mergeProductFeatures(client.features, opp.product);
  const contractDetails = { ...(client.contractDetails as Record<string, unknown>) };
  delete contractDetails.isSalesStaging;
  contractDetails.salesOpportunityId = opp.id;
  contractDetails.dealType = opp.dealType;

  const subscriptionRate =
    opp.dealType === 'subscription' ? Number(opp.monthlyRate ?? DEFAULT_SUBSCRIPTION_RATE) : null;
  const shouldActivate = client.status !== 'active' || !client.isActive;
  const existingPlan = (client.servicePlanData as Record<string, unknown>) ?? {};

  const clientUpdates: Record<string, unknown> = {
    features: mergedFeatures,
    contractDetails,
    servicePlanData: {
      ...existingPlan,
      [`product_${opp.product}`]: {
        product: opp.product,
        dealType: opp.dealType,
        scopeNotes: opp.scopeNotes,
        monthlyRate: subscriptionRate,
      },
    },
  };

  if (shouldActivate) {
    clientUpdates.status = 'active';
    clientUpdates.isActive = true;
    clientUpdates.startDate = client.startDate ?? new Date();
    clientUpdates.contractStartDate = client.contractStartDate ?? new Date();
  }

  if (subscriptionRate != null && (!client.monthlyRate || Number(client.monthlyRate) === 0)) {
    clientUpdates.monthlyRate = subscriptionRate;
  }

  await client.update(clientUpdates);

  await client.reload();

  await opp.update({
    stage: 'won',
    wonAt: new Date(),
    communications: appendCommunication(opp, 'won', 'Deposit received — client activated'),
  });

  let licenseSync: { success: boolean; message?: string } | undefined;
  if (options.syncLicenses !== false) {
    licenseSync = await syncClientToLicenseSystem(client);
  }

  return {
    opportunity: serializeOpportunity(opp),
    clientId: client.id,
    licenseSync,
  };
}

export async function getPipelineStats() {
  await ensureSalesSchema();
  const all = await SalesOpportunity.findAll({ attributes: ['stage', 'product'] });
  const byStage: Record<string, number> = {};
  const byProduct: Record<string, number> = {};
  for (const row of all) {
    byStage[row.stage] = (byStage[row.stage] ?? 0) + 1;
    if (row.stage !== 'won' && row.stage !== 'lost') {
      byProduct[row.product] = (byProduct[row.product] ?? 0) + 1;
    }
  }
  return {
    total: all.length,
    active: all.filter((r) => !['won', 'lost'].includes(r.stage)).length,
    won: byStage.won ?? 0,
    lost: byStage.lost ?? 0,
    byStage,
    byProduct,
  };
}

export async function getSalesStagingClientIds(): Promise<string[]> {
  await ensureSalesSchema();
  const opps = await SalesOpportunity.findAll({
    where: { stage: { [Op.notIn]: ['won'] } },
    attributes: ['clientId'],
  });
  return opps.map((o) => o.clientId).filter((id): id is string => Boolean(id));
}
