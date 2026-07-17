// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { guardMiniApiRouteResult } from '../../mini-helpers';
import { MINI_CHAT_PROXY_TIMEOUT_MS, miniProxyRequest } from '@web/lib/mini-dock';
import {
  appendOperationalLogsToSummary,
  buildMiniCdContext,
  parseEntityFromPath,
  summarizeMiniCdContextForChat,
} from '@web/lib/mini-cd-context';
import {
  resolveMiniCdChatIntent,
  looksLikeActionRequest,
  looksLikeTicketSendConfirmation,
} from '@web/lib/mini-cd-query';
import {
  answerTicketSendConfirmation,
  executeMiniCdAction,
  isCdActionFailure,
} from '@web/lib/mini-cd-actions.server';
import { buildMiniCdOperationalLogs, summarizeMiniCdOperationalLogs } from '@web/lib/mini-cd-logs';
import { emitMiniCdEvent } from '@web/lib/mini-cd-events.server';
import { sanitizePortalAction } from '@web/lib/mini-portal-actions';

type CdActionResult = {
  content: string;
  success: boolean;
  type?: string;
  executed: boolean;
};

function buildCdContextPayload(
  cdContext: Awaited<ReturnType<typeof buildMiniCdContext>>,
  contextSummary: string,
  operationalLogs: Awaited<ReturnType<typeof buildMiniCdOperationalLogs>>,
  logsSummary: string,
  extras?: Record<string, unknown>
) {
  return {
    summary: contextSummary,
    snapshot: { ...cdContext, operationalLogs },
    operational_logs: logsSummary,
    ...extras,
  };
}

function recordMiniChatTurn(message: string, payload: Record<string, unknown>) {
  void miniProxyRequest('/api/chat', {
    method: 'POST',
    body: JSON.stringify({ message, cd_context: payload }),
  }).catch(() => {
    /* history sync is best-effort */
  });
}

function miniProxyError(body: unknown): string | null {
  if (!body || typeof body !== 'object') return null;
  const record = body as Record<string, unknown>;
  if (typeof record.error === 'string' && record.error.trim()) return record.error;
  if (typeof record.message === 'string' && record.message.trim()) return record.message;
  return null;
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    const guard = await guardMiniApiRouteResult();
    if (guard) return guard;

    const body = ctx.body as Record<string, unknown>;
    const message = String(body.message ?? '').trim();
    if (!message) {
      return { status: 400, body: { success: false, error: 'message is required' } };
    }

    const page = String(body.page ?? '/dashboard').trim() || '/dashboard';
    const pageLabel = String(body.pageLabel ?? '').trim() || undefined;

    const { entityType, entityId } = parseEntityFromPath(page);
    const [cdContext, operationalLogs] = await Promise.all([
      buildMiniCdContext(session, { page, pageLabel }),
      buildMiniCdOperationalLogs({
        entityType,
        entityId,
        role: session.role,
        skipMiniProxy: true,
      }),
    ]);
    const logsSummary = summarizeMiniCdOperationalLogs(operationalLogs);
    const contextSummary = appendOperationalLogsToSummary(
      summarizeMiniCdContextForChat(cdContext),
      logsSummary
    );

    const cdResolution = resolveMiniCdChatIntent(message, cdContext);
    let actionResult: CdActionResult | undefined;

    if (cdResolution.confidence === 'high' && cdResolution.executeAction) {
      const executed = await executeMiniCdAction(session, cdResolution.executeAction, cdContext.user.name);
      actionResult = {
        content: executed.content,
        success: executed.success,
        type: cdResolution.executeAction.type,
        executed: true,
      };
    } else if (looksLikeTicketSendConfirmation(message)) {
      const answer = await answerTicketSendConfirmation(session, message, cdContext);
      if (answer) {
        actionResult = {
          content: answer,
          success: !isCdActionFailure(answer),
          type: 'ticket_send_confirmation',
          executed: false,
        };
      }
    }

    const portalAction = sanitizePortalAction(cdResolution.portalAction, cdContext.pages, cdContext.index);

    if (actionResult?.success) {
      void recordMiniChatTurn(
        message,
        buildCdContextPayload(cdContext, contextSummary, operationalLogs, logsSummary, {
          action_result: actionResult,
          skip_agent: true,
        })
      );
      emitMiniCdEvent(session, {
        type: 'mini.chat',
        summary: `Asked Mini on ${pageLabel || page}: ${message.slice(0, 120)}`,
        href: page,
        actorName: cdContext.user.name,
        metadata: {
          navigated: Boolean(portalAction),
          targetHref: portalAction?.href ?? null,
          cdAction: actionResult.type ?? null,
          cdActionSuccess: true,
        },
      });
      return { status: 200, body: {
        message: { role: 'assistant', content: actionResult.content, created_at: new Date().toISOString() },
        portal_action: portalAction,
        cd_action: actionResult,
        read_only: true,
      } };
    }

    if (actionResult?.executed && !actionResult.success) {
      const recoveryPayload = buildCdContextPayload(cdContext, contextSummary, operationalLogs, logsSummary, {
        action_failure: { ...actionResult, originalMessage: message, error: actionResult.content },
        capability_request: {
          unresolved: true,
          reason: 'action_failed',
          message,
          error: actionResult.content,
        },
      });

      const result = await miniProxyRequest(
        '/api/chat',
        {
          method: 'POST',
          body: JSON.stringify({ message, cd_context: recoveryPayload }),
        },
        { timeoutMs: MINI_CHAT_PROXY_TIMEOUT_MS },
      );

      const proxyError = miniProxyError(result.body);
      if (proxyError && !result.ok) {
        return { status: 200, body: { success: false, error: proxyError } };
      }

      const miniBody = result.body as Record<string, unknown>;
      const responseBody: Record<string, unknown> = {
        ...miniBody,
        portal_action: portalAction,
        cd_action: actionResult,
        read_only: true,
      };

      emitMiniCdEvent(session, {
        type: 'mini.chat',
        summary: `CD action failed on ${pageLabel || page}: ${actionResult.content.slice(0, 120)}`,
        href: page,
        actorName: cdContext.user.name,
        metadata: {
          cdAction: actionResult.type ?? null,
          cdActionSuccess: false,
        },
      });

      return { status: 200, body: responseBody };
    }

    if (actionResult) {
      void recordMiniChatTurn(
        message,
        buildCdContextPayload(cdContext, contextSummary, operationalLogs, logsSummary, {
          action_result: actionResult,
          skip_agent: true,
        })
      );
      emitMiniCdEvent(session, {
        type: 'mini.chat',
        summary: `Asked Mini on ${pageLabel || page}: ${message.slice(0, 120)}`,
        href: page,
        actorName: cdContext.user.name,
        metadata: {
          navigated: Boolean(portalAction),
          targetHref: portalAction?.href ?? null,
          cdAction: actionResult.type ?? null,
          cdActionSuccess: actionResult.success,
        },
      });
      return { status: 200, body: {
        message: { role: 'assistant', content: actionResult.content, created_at: new Date().toISOString() },
        portal_action: portalAction,
        cd_action: actionResult,
        read_only: true,
      } };
    }

    const capabilityRequest =
      cdResolution.confidence !== 'high' && looksLikeActionRequest(message)
        ? { unresolved: true as const, reason: 'no_cd_intent', message }
        : undefined;

    const resolvedIntent =
      cdResolution.confidence === 'high'
        ? { ...cdResolution, directAnswer: cdResolution.directAnswer }
        : undefined;

    const result = await miniProxyRequest(
      '/api/chat',
      {
        method: 'POST',
        body: JSON.stringify({
          message,
          cd_context: buildCdContextPayload(cdContext, contextSummary, operationalLogs, logsSummary, {
            resolved_intent: resolvedIntent,
            capability_request: capabilityRequest,
          }),
        }),
      },
      { timeoutMs: MINI_CHAT_PROXY_TIMEOUT_MS },
    );

    const proxyError = miniProxyError(result.body);
    if (proxyError && !result.ok) {
      return { status: 200, body: { success: false, error: proxyError } };
    }

    const miniBody = result.body as Record<string, unknown>;
    const mergedPortalAction =
      portalAction || sanitizePortalAction(miniBody.portal_action, cdContext.pages, cdContext.index);

    const responseBody: Record<string, unknown> = { ...miniBody, portal_action: mergedPortalAction };
    const miniMessage = miniBody.message;
    const resolvedAnswer = cdResolution.directAnswer;
    if (
      cdResolution.confidence === 'high' &&
      resolvedAnswer &&
      miniMessage &&
      typeof miniMessage === 'object'
    ) {
      responseBody.message = {
        ...(miniMessage as Record<string, unknown>),
        content: resolvedAnswer,
      };
    }

    emitMiniCdEvent(session, {
      type: 'mini.chat',
      summary: `Asked Mini on ${pageLabel || page}: ${message.slice(0, 120)}`,
      href: page,
      actorName: cdContext.user.name,
      metadata: {
        navigated: Boolean(mergedPortalAction),
        targetHref: mergedPortalAction?.href ?? null,
      },
    });

    return { status: 200, body: responseBody };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

