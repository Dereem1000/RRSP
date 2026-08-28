// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { getClientRrspAccess } from '@web/lib/rrsp-access';
import { RRSP_MODULE_LABELS, RRSP_MODULES, type RrspModule } from '@web/lib/rrsp';
import {
  createRrspShopStaffMember,
  deleteRrspShopStaffMember,
  listRrspShopStaff,
  updateRrspShopStaffMember,
} from '@web/lib/rrsp-shop-staff';

async function requireRrspShopOwner(ctx: ApiContext) {
  const session = requireSession(ctx);
  if (session.role !== 'client') {
    return {
      error: {
        status: 403,
        body: { success: false, message: 'Only RRSP shop owners can manage staff' },
      } as ApiResult,
      session: null,
      access: null,
    };
  }
  const access = await getClientRrspAccess(session.id);
  if (access.isShopStaff || !access.featureEnabled || !access.licenseActive || !access.mspClientId) {
    return {
      error: {
        status: 403,
        body: { success: false, message: 'An active RRSP shop license is required' },
      } as ApiResult,
      session: null,
      access: null,
    };
  }
  return { error: null, session, access };
}

function parseModules(value: unknown, licensed: RrspModule[]): RrspModule[] {
  if (!Array.isArray(value)) return [];
  const licensedSet = new Set(licensed);
  return value
    .map((m) => String(m))
    .filter((m): m is RrspModule => (RRSP_MODULES as readonly string[]).includes(m) && licensedSet.has(m as RrspModule));
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspShopOwner(ctx);
    if (gate.error) return gate.error;

    const mspClientId = gate.access!.mspClientId!;
    const licensedModules = gate.access!.modules as RrspModule[];
    const staff = await listRrspShopStaff(mspClientId);

    return {
      status: 200,
      body: {
        success: true,
        staff,
        licensedModules,
        moduleLabels: RRSP_MODULE_LABELS,
        staffSettings: gate.access!.staffSettings ?? null,
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspShopOwner(ctx);
    if (gate.error) return gate.error;

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const mspClientId = gate.access!.mspClientId!;
    const licensedModules = gate.access!.modules as RrspModule[];

    const result = await createRrspShopStaffMember(
      mspClientId,
      gate.session!.id,
      {
        localUsername: String(body.localUsername ?? body.username ?? ''),
        firstName: String(body.firstName ?? ''),
        lastName: String(body.lastName ?? ''),
        roleLabel: String(body.roleLabel ?? body.role ?? ''),
        modules: parseModules(body.modules, licensedModules),
        password: body.password ? String(body.password) : undefined,
        email: body.email ? String(body.email) : undefined,
      },
      licensedModules
    );

    return {
      status: 200,
      body: {
        success: true,
        message: result.tempPassword
          ? `Staff account created. Temporary password: ${result.tempPassword}`
          : 'Staff account created',
        staff: result.staff,
        tempPassword: result.tempPassword,
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create staff account';
    return { status: 400, body: { success: false, message } };
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspShopOwner(ctx);
    if (gate.error) return gate.error;

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const staffUserId = Number(body.id ?? body.staffUserId);
    if (!Number.isFinite(staffUserId) || staffUserId <= 0) {
      return { status: 400, body: { success: false, message: 'Staff id is required' } };
    }

    const mspClientId = gate.access!.mspClientId!;
    const licensedModules = gate.access!.modules as RrspModule[];

    const staff = await updateRrspShopStaffMember(
      mspClientId,
      staffUserId,
      {
        localUsername: body.localUsername !== undefined ? String(body.localUsername) : undefined,
        firstName: body.firstName !== undefined ? String(body.firstName) : undefined,
        lastName: body.lastName !== undefined ? String(body.lastName) : undefined,
        roleLabel: body.roleLabel !== undefined ? String(body.roleLabel) : undefined,
        modules: body.modules !== undefined ? parseModules(body.modules, licensedModules) : undefined,
        isActive: body.isActive !== undefined ? Boolean(body.isActive) : undefined,
        password: body.password ? String(body.password) : undefined,
      },
      licensedModules
    );

    return {
      status: 200,
      body: { success: true, message: 'Staff account updated', staff },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update staff account';
    return { status: 400, body: { success: false, message } };
  }
}

export async function DELETEHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspShopOwner(ctx);
    if (gate.error) return gate.error;

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const queryId = ctx.query?.id;
    const staffUserId = Number(
      body.id ?? body.staffUserId ?? (Array.isArray(queryId) ? queryId[0] : queryId)
    );
    if (!Number.isFinite(staffUserId) || staffUserId <= 0) {
      return { status: 400, body: { success: false, message: 'Staff id is required' } };
    }

    await deleteRrspShopStaffMember(gate.access!.mspClientId!, staffUserId);
    return {
      status: 200,
      body: { success: true, message: 'Staff account removed' },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to remove staff account';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'DELETE') return DELETEHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
