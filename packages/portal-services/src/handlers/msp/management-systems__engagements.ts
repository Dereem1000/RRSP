// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { requireSession, requireRole, authErrorResult } from '@cd-v2/api-handlers';
import { ACTIVATION_FEATURES, type ActivationFeature } from '@web/lib/license-constants';
import {
  listEngagements,
  upsertEngagement,
  recordGateResult,
} from '@web/lib/management-system-engagements';

function parseFeature(raw: unknown): ActivationFeature | null {
  const value = String(raw || '').trim();
  return ACTIVATION_FEATURES.includes(value as ActivationFeature) ? (value as ActivationFeature) : null;
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const clientId = String(ctx.query.clientId || '').trim() || undefined;
    const feature = parseFeature(ctx.query.feature);
    const engagements = await listEngagements({ clientId, feature: feature ?? undefined });
    return { status: 200, body: { success: true, engagements } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');
    const body = ctx.body as Record<string, unknown>;
    const clientId = String(body.clientId || '').trim();
    const feature = parseFeature(body.feature);
    if (!clientId || !feature) {
      return { status: 400, body: { success: false, message: 'clientId and feature are required' } };
    }

    if (body.action === 'record-gate') {
      const engagement = await recordGateResult({
        clientId,
        feature,
        customerName: String(body.customerName || '').trim() || undefined,
        phase: String(body.phase || 'Complete'),
        result: body.result,
        runId: String(body.runId || body.run_id || '').trim() || undefined,
      });
      return { status: 200, body: { success: true, engagement } };
    }

    const engagement = await upsertEngagement({
      clientId,
      feature,
      customerName: body.customerName != null ? String(body.customerName) : undefined,
      provisionStatus: body.provisionStatus as never,
      provisionRunId: body.provisionRunId != null ? String(body.provisionRunId) : undefined,
      provisionAt: body.provisionAt != null ? String(body.provisionAt) : undefined,
      installStatus: body.installStatus as never,
      installRunId: body.installRunId != null ? String(body.installRunId) : undefined,
      installAt: body.installAt != null ? String(body.installAt) : undefined,
      deliverableDraft: body.deliverableDraft as never,
      deliverableClientMarkdown:
        body.deliverableClientMarkdown != null ? String(body.deliverableClientMarkdown) : undefined,
      deliverableStatus: body.deliverableStatus as never,
      deliverableSentAt: body.deliverableSentAt != null ? String(body.deliverableSentAt) : undefined,
    });
    return { status: 200, body: { success: true, engagement } };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save engagement';
    return { status: 500, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  if (method === 'GET') return GETHandler(ctx);
  if (method === 'PUT') return PUTHandler(ctx);
  return { status: 405, body: { success: false, message: 'Method not allowed' } };
}
