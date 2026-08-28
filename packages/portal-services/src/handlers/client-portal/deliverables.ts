// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, authErrorResult } from '@cd-v2/api-handlers';
import { getPortalClient } from '@web/lib/client-portal-billing';
import { resolveClientActivationFeatures } from '@web/lib/clients';
import { ACTIVATION_FEATURE_LABELS, type ActivationFeature } from '@web/lib/license-constants';
import { PLATFORM_DELIVERABLE_FEATURES } from '@web/lib/client-platform-deliverables';
import { getEngagement } from '@web/lib/management-system-engagements';
import { toClientDeliverable } from '@web/lib/deliverable-template';
import {
  buildDigitalLicense,
  normalizeDigitalLicense,
  redactDigitalLicense,
} from '@web/lib/digital-license';
import { User } from '@web/lib/db';

function parseFeature(raw: unknown): ActivationFeature | null {
  const value = String(raw || '').trim();
  return PLATFORM_DELIVERABLE_FEATURES.includes(value as ActivationFeature)
    ? (value as ActivationFeature)
    : null;
}

async function listClientDeliverables(
  client: { id: string },
  features: ActivationFeature[],
  targetFeatures: ActivationFeature[],
  revealSerials: boolean,
) {
  const deliverables = [];

  for (const feature of targetFeatures) {
    if (!features.includes(feature)) continue;
    const label = ACTIVATION_FEATURE_LABELS[feature];
    const engagement = await getEngagement(client.id, feature);
    const sent =
      engagement?.deliverableStatus === 'sent' &&
      Boolean(engagement?.deliverableClientMarkdown?.trim());

    if (!sent || !engagement?.deliverableClientMarkdown) continue;

    const rawLicense =
      normalizeDigitalLicense(engagement.digitalLicense) ??
      (await buildDigitalLicense({
        clientId: client.id,
        feature,
        placeholders: engagement.deliverableDraft?.placeholders ?? {},
        staffMarkdown: engagement.deliverableDraft?.staffMarkdown,
        issuedAt: engagement.deliverableSentAt,
      }));

    deliverables.push({
      feature,
      title: label?.title || feature,
      markdown: toClientDeliverable(engagement.deliverableClientMarkdown),
      sentAt: engagement.deliverableSentAt,
      digitalLicense: redactDigitalLicense(rawLicense, revealSerials),
    });
  }

  return deliverables;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const features = await resolveClientActivationFeatures(client);
    const platformFeatures = PLATFORM_DELIVERABLE_FEATURES.filter((feature) =>
      features.includes(feature),
    );
    const requested = parseFeature(ctx.query.feature);
    const targetFeatures = requested ? [requested] : platformFeatures;

    const deliverables = await listClientDeliverables(
      client,
      platformFeatures,
      targetFeatures,
      false,
    );

    return { status: 200, body: { success: true, deliverables, serialsRevealed: false } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    if (session.role !== 'client') {
      return { status: 403, body: { success: false, message: 'Access denied' } };
    }

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const password = typeof body.password === 'string' ? body.password : '';
    if (!password) {
      return { status: 400, body: { success: false, message: 'Password is required' } };
    }

    const user = await User.findByPk(session.id);
    if (!user) {
      return { status: 404, body: { success: false, message: 'User not found' } };
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      return { status: 401, body: { success: false, message: 'Incorrect password' } };
    }

    const client = await getPortalClient(session.id);
    if (!client) {
      return { status: 404, body: { success: false, message: 'Client record not found' } };
    }

    const features = await resolveClientActivationFeatures(client);
    const platformFeatures = PLATFORM_DELIVERABLE_FEATURES.filter((feature) =>
      features.includes(feature),
    );
    const requested = parseFeature(body.feature ?? ctx.query.feature);
    const targetFeatures = requested ? [requested] : platformFeatures;

    const deliverables = await listClientDeliverables(
      client,
      platformFeatures,
      targetFeatures,
      true,
    );

    return { status: 200, body: { success: true, deliverables, serialsRevealed: true } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  if (method === 'POST') return POSTHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
