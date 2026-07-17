import { fn, col, where } from 'sequelize';
import { Client } from '@/lib/db';
import {
  ACTIVATION_FEATURES,
  type ActivationFeature,
} from '@/lib/license-constants';
import {
  deactivateLicensesForMspClient,
  findMspClientIdByCompanyName,
  getLicenseStatusByMspClientId,
  isLicenseDbAvailable,
  reactivateLicensesForMspClient,
} from '@/lib/license-service';

const SYSTEM_KEY_TO_FEATURE: Record<string, ActivationFeature> = {
  pos: 'pos',
  'pos-system': 'pos',
  restaurant: 'restaurant',
  document: 'document',
  ecommerce: 'ecommerce',
  auto: 'auto',
  distribution: 'distribution',
  crm: 'crm',
};

export type ProjectGuardLicenseActionRequest = {
  action: 'deactivate' | 'reactivate';
  signal?: string;
  msp_client_id?: string;
  company_name?: string;
  connection_id?: string;
  deployment_id?: string;
  system_key?: string;
  feature?: string;
  reason?: string;
};

export type ProjectGuardLicenseActionResponse = {
  success: boolean;
  action: 'deactivate' | 'reactivate';
  signal?: string;
  mspClientId: string | null;
  clientName: string | null;
  feature: ActivationFeature | null;
  licenseAction: Awaited<ReturnType<typeof deactivateLicensesForMspClient>>;
  licenseStatus: Awaited<ReturnType<typeof getLicenseStatusByMspClientId>> | null;
  message: string;
};

function normalizeFeature(raw: unknown, systemKey?: unknown): ActivationFeature | null {
  const direct = String(raw || '').trim().toLowerCase();
  if (ACTIVATION_FEATURES.includes(direct as ActivationFeature)) {
    return direct as ActivationFeature;
  }

  const mapped = SYSTEM_KEY_TO_FEATURE[String(systemKey || '').trim().toLowerCase()];
  return mapped ?? null;
}

function companyNamesLooselyMatch(reported: string, candidate: string): boolean {
  const a = reported.toLowerCase().trim();
  const b = candidate.toLowerCase().trim();
  if (!a || !b || b.length < 4) return false;
  return a === b || a.startsWith(`${b} `) || b.startsWith(`${a} `);
}

export async function resolveProjectGuardClient(
  input: Pick<ProjectGuardLicenseActionRequest, 'msp_client_id' | 'company_name'>
): Promise<Client | null> {
  const mspClientId = String(input.msp_client_id || '').trim();
  if (mspClientId) {
    const byId = await Client.findByPk(mspClientId);
    if (byId) return byId;
  }

  const companyName = String(input.company_name || '').trim();
  if (!companyName) return null;

  const lowered = companyName.toLowerCase();
  const byCompany = await Client.findOne({
    where: where(fn('lower', col('companyName')), lowered),
  });
  if (byCompany) return byCompany;

  const byName = await Client.findOne({
    where: where(fn('lower', col('name')), lowered),
  });
  if (byName) return byName;

  // Mini often reports the POS business label ("Solomon Industries Dev41") while
  // portal/license records use the shorter legal name ("Solomon Industries").
  const licenseMatch = await findMspClientIdByCompanyName(companyName);
  if (licenseMatch?.mspClientId) {
    const byLicenseLink = await Client.findByPk(licenseMatch.mspClientId);
    if (byLicenseLink) return byLicenseLink;
  }

  const candidates = await Client.findAll({
    attributes: ['id', 'name', 'companyName', 'email'],
    limit: 500,
  });
  let best: Client | null = null;
  let bestLen = 0;
  for (const candidate of candidates) {
    for (const field of [candidate.companyName, candidate.name]) {
      const value = String(field || '').trim();
      if (!companyNamesLooselyMatch(companyName, value)) continue;
      if (value.length >= bestLen) {
        best = candidate;
        bestLen = value.length;
      }
    }
  }
  return best;
}

export async function applyProjectGuardLicenseAction(
  body: ProjectGuardLicenseActionRequest
): Promise<ProjectGuardLicenseActionResponse> {
  const action = body.action === 'reactivate' ? 'reactivate' : 'deactivate';
  const signal = String(body.signal || 'baseline_compromised').trim() || 'baseline_compromised';
  const feature = normalizeFeature(body.feature, body.system_key);

  if (!isLicenseDbAvailable()) {
    return {
      success: false,
      action,
      signal,
      mspClientId: null,
      clientName: null,
      feature,
      licenseAction: { deactivatedIds: [], reactivatedIds: [], skippedIds: [] },
      licenseStatus: null,
      message: 'License database unavailable',
    };
  }

  const client = await resolveProjectGuardClient(body);
  if (!client) {
    return {
      success: false,
      action,
      signal,
      mspClientId: null,
      clientName: body.company_name ?? null,
      feature,
      licenseAction: { deactivatedIds: [], reactivatedIds: [], skippedIds: [] },
      licenseStatus: null,
      message: 'Client not found for Project Guard license action',
    };
  }

  const licenseAction =
    action === 'reactivate'
      ? await reactivateLicensesForMspClient(client.id, { feature: feature ?? undefined })
      : await deactivateLicensesForMspClient(client.id, { feature: feature ?? undefined });

  const changedCount =
    action === 'reactivate'
      ? licenseAction.reactivatedIds.length
      : licenseAction.deactivatedIds.length;

  const licenseStatus = await getLicenseStatusByMspClientId(client.id);
  const clientName = client.companyName || client.name;
  const reason = String(body.reason || '').trim();
  const reasonSuffix = reason ? ` (${reason})` : '';

  // Success only when rows changed, or every matching row was already in the target state.
  const alreadySatisfied =
    changedCount === 0 &&
    licenseAction.skippedIds.length > 0 &&
    (action === 'deactivate'
      ? licenseAction.reactivatedIds.length === 0
      : licenseAction.deactivatedIds.length === 0);
  const success = changedCount > 0 || alreadySatisfied;

  return {
    success,
    action,
    signal,
    mspClientId: client.id,
    clientName,
    feature,
    licenseAction,
    licenseStatus,
    message:
      changedCount > 0
        ? `${action === 'deactivate' ? 'Deactivated' : 'Reactivated'} ${changedCount} license row(s) for ${clientName}${reasonSuffix}`
        : success
          ? `License rows for ${clientName} already in desired state${reasonSuffix}`
          : `No matching license rows to ${action} for ${clientName}${reasonSuffix}`,
  };
}

type GuardDeploymentForEscalation = {
  deployment_id?: string;
  connection_id?: string | null;
  baseline_compromised?: boolean;
  baseline_license_escalation?: { state?: string; message?: string | null } | null;
  mini_integration_identity?: {
    company_name?: string;
    system_key?: string;
    connection_id?: string;
  } | null;
  project_name?: string;
};

/**
 * When Mini cannot reach the public MSP API (e.g. Cloudflare 1010), the portal
 * applies license actions locally and writes the outcome back to Mini.
 */
export async function reconcilePendingProjectGuardLicenseEscalations(
  externalSystems: Record<string, unknown>,
  reportToMini: (payload: Record<string, unknown>) => Promise<{ ok: boolean; body?: unknown }>
): Promise<Record<string, unknown>> {
  const projectGuard = externalSystems.project_guard;
  if (!projectGuard || typeof projectGuard !== 'object' || Array.isArray(projectGuard)) {
    return externalSystems;
  }

  const deployments = (projectGuard as { deployments?: GuardDeploymentForEscalation[] }).deployments;
  if (!Array.isArray(deployments) || deployments.length === 0) {
    return externalSystems;
  }

  let changed = false;
  const nextDeployments = [...deployments];

  for (let index = 0; index < nextDeployments.length; index += 1) {
    const deployment = nextDeployments[index];
    if (!deployment?.baseline_compromised) continue;
    const escalationState = String(deployment.baseline_license_escalation?.state || '').toLowerCase();
    if (escalationState === 'deactivated') continue;

    const identity = deployment.mini_integration_identity || {};
    const companyName = String(identity.company_name || deployment.project_name || '').trim();
    const result = await applyProjectGuardLicenseAction({
      action: 'deactivate',
      signal: 'baseline_compromised',
      company_name: companyName || undefined,
      system_key: identity.system_key,
      deployment_id: deployment.deployment_id,
      connection_id: deployment.connection_id || identity.connection_id || undefined,
      reason: 'Project Guard baseline cache compromised (portal reconcile)',
    });

    const state = result.success ? 'deactivated' : 'pending';
    const report = await reportToMini({
      deployment_id: deployment.deployment_id,
      state,
      reason: result.success ? null : 'cd_license_action_failed',
      message: result.message,
      cd_result: {
        success: result.success,
        message: result.message,
        mspClientId: result.mspClientId,
        clientName: result.clientName,
        feature: result.feature,
        licenseAction: result.licenseAction,
        source: 'cd_portal_reconcile',
      },
    });

    if (!report.ok) continue;

    const body = report.body && typeof report.body === 'object' ? (report.body as Record<string, unknown>) : {};
    const updatedDeployment =
      body.deployment && typeof body.deployment === 'object'
        ? (body.deployment as GuardDeploymentForEscalation)
        : {
            ...deployment,
            baseline_license_escalation: {
              state,
              message: result.message,
            },
          };
    nextDeployments[index] = updatedDeployment;
    changed = true;
  }

  if (!changed) return externalSystems;

  return {
    ...externalSystems,
    project_guard: {
      ...(projectGuard as Record<string, unknown>),
      deployments: nextDeployments,
    },
  };
}
