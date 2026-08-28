// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireSession } from '@cd-v2/api-handlers';
import { getClientRrspAccess } from '@web/lib/rrsp-access';
import {
  describeRrspEmailGaps,
  emptyRrspEmailSettings,
  getRrspBrandingForClient,
  getRrspEmailSettingsForClient,
  maskRrspEmailSettings,
  mergeRrspEmailSettings,
  rrspEmailIsReady,
  saveRrspBrandingForClient,
  saveRrspEmailSettingsForClient,
  type RrspBranding,
  type RrspEmailSettings,
} from '@web/lib/rrsp-branding';
import { sendEmailWithConfigDetailed } from '@web/lib/email';
import { isRrspShopDemoActive, setRrspShopDemoMode } from '@web/lib/rrsp-demo';

async function requireRrspLicensedClient(ctx: ApiContext) {
  const session = requireSession(ctx);
  if (session.role !== 'client') {
    return {
      error: {
        status: 403,
        body: { success: false, message: 'Only RRSP clients can manage shop branding' },
      } as ApiResult,
      session: null,
      access: null,
    };
  }
  const access = await getClientRrspAccess(session.id);
  if (!access.featureEnabled || !access.licenseActive || !access.mspClientId) {
    return {
      error: {
        status: 403,
        body: { success: false, message: 'An active RRSP license is required' },
      } as ApiResult,
      session: null,
      access: null,
    };
  }
  return { error: null, session, access };
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspLicensedClient(ctx);
    if (gate.error) return gate.error;

    const mspClientId = gate.access!.mspClientId!;
    const [branding, email, demoMode] = await Promise.all([
      getRrspBrandingForClient(mspClientId),
      getRrspEmailSettingsForClient(mspClientId),
      isRrspShopDemoActive(mspClientId),
    ]);

    return {
      status: 200,
      body: {
        success: true,
        branding,
        email: email ? maskRrspEmailSettings(email) : null,
        emailReady: email ? rrspEmailIsReady(email) : false,
        demoMode,
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function PUTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspLicensedClient(ctx);
    if (gate.error) return gate.error;

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const section = String(body.section ?? '').trim();
    const mspClientId = gate.access!.mspClientId!;

    if (section === 'business') {
      const branding = await saveRrspBrandingForClient(
        mspClientId,
        (body.branding ?? body) as Partial<RrspBranding>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Business information saved',
          branding,
        },
      };
    }

    if (section === 'email') {
      const email = await saveRrspEmailSettingsForClient(
        mspClientId,
        (body.email ?? body) as Partial<RrspEmailSettings>
      );
      return {
        status: 200,
        body: {
          success: true,
          message: 'Email settings saved',
          email: maskRrspEmailSettings(email),
          emailReady: rrspEmailIsReady(email),
        },
      };
    }

    if (section === 'demo') {
      const enabled = Boolean(body.enabled ?? body.demoMode);
      const demoMode = await setRrspShopDemoMode(mspClientId, enabled);
      return {
        status: 200,
        body: {
          success: true,
          message: demoMode
            ? 'Shop demo mode on — sample data loaded. Your real shop data is saved and restored when you turn this off.'
            : 'Shop demo mode off — your real shop data has been restored.',
          demoMode,
        },
      };
    }

    return {
      status: 400,
      body: { success: false, message: 'section must be "business", "email", or "demo"' },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to save RRSP settings';
    return { status: 400, body: { success: false, message } };
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const gate = await requireRrspLicensedClient(ctx);
    if (gate.error) return gate.error;

    const body = (ctx.body ?? {}) as Record<string, unknown>;
    const to = String(body.to ?? '').trim();
    if (!to) {
      return { status: 400, body: { success: false, message: 'Enter a test email address' } };
    }

    const mspClientId = gate.access!.mspClientId!;
    const saved = (await getRrspEmailSettingsForClient(mspClientId)) ?? emptyRrspEmailSettings();
    const patch =
      body.email && typeof body.email === 'object'
        ? (body.email as Partial<RrspEmailSettings>)
        : null;

    // Persist form values when provided so test uses the same config the client sees.
    let email = mergeRrspEmailSettings(saved, patch);
    if (patch) {
      email = await saveRrspEmailSettingsForClient(mspClientId, patch);
    }

    const gaps = describeRrspEmailGaps({ ...email, enabled: true });
    // For test sends, require host/user/password even if the enable toggle is still off.
    if (gaps.length) {
      return {
        status: 400,
        body: {
          success: false,
          message: `Complete SMTP settings first: ${gaps.join(', ')}. Then click Save email.`,
        },
      };
    }

    if (!email.enabled) {
      email = await saveRrspEmailSettingsForClient(mspClientId, { enabled: true });
    }

    const branding = await getRrspBrandingForClient(mspClientId);
    const fromName = email.fromName || branding?.companyName || 'Shop';
    const result = await sendEmailWithConfigDetailed(email, {
      to,
      subject: `[TEST] ${fromName} outbound email`,
      html: `<p>This is a test email from your RRSP shop mail settings.</p><p>From: ${fromName} &lt;${email.fromEmail || email.user}&gt;</p>`,
      log: { category: 'test' },
      allowDisabled: true,
    });

    if (!result.ok) {
      return {
        status: 400,
        body: {
          success: false,
          message: result.error || 'Test email failed to send',
        },
      };
    }

    return {
      status: 200,
      body: {
        success: true,
        message: `Test email sent to ${to}`,
        email: maskRrspEmailSettings(email),
        emailReady: rrspEmailIsReady(email),
      },
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Test email failed';
    return { status: 400, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'PUT') return PUTHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
