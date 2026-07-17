// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  AuthError,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { createNewOrderNotice } from '@web/lib/order-notices';
import { notifyOrderCreated } from '@web/lib/order-notifications';
import { createTicketForOrder } from '@web/lib/order-tickets';
import { syncInvoiceLineItemNameFromOrder, addInvoiceLink } from '@web/lib/accounting';
import { addOrderLink, createOrder, getOrdersSummary, listOrders } from '@web/lib/orders';
import { ensureCommentLinkedOrderColumn } from '@web/lib/ticket-schema';
import { getTicketById } from '@web/lib/tickets';
import { TicketComment } from '@web/lib/db';
import { getRequestPublicOriginFromCtx } from '../../http-helpers';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician');

    const searchParams = searchParamsFrom(ctx);
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;
    const shippingStage = searchParams.get('shippingStage') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const summaryOnly = searchParams.get('summary') === '1';

    if (summaryOnly) {
      const summary = await getOrdersSummary();
      return { status: 200, body: { success: true, summary } };
    }

    const result = await listOrders({
      page,
      limit,
      status: status && status !== 'all' ? status : undefined,
      shippingStage: shippingStage && shippingStage !== 'all' ? shippingStage : undefined,
      clientId: clientId && clientId !== 'all' ? clientId : undefined,
      search,
      includeCost: session.role === 'admin',
    });

    return { status: 200, body: { success: true, ...result } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const body = ctx.body as Record<string, unknown>;
    const clientId = String(body.clientId ?? '').trim();
    const skipUsCost = body.skipUsCost === true;
    const clientPrice = Number(body.clientPrice);
    const costPrice = skipUsCost ? 0 : Number(body.costPrice);

    if (!clientId) {
      return { status: 400, body: { success: false, message: 'Client is required' } };
    }
    if (!body.title || !body.itemName) {
      return { status: 400, body: { success: false, message: 'title and itemName are required' } };
    }
    if (!Number.isFinite(clientPrice) || clientPrice < 0) {
      return { status: 400, body: { success: false, message: 'A valid client price is required' } };
    }
    if (!skipUsCost && !Number.isFinite(costPrice)) {
      return { status: 400, body: { success: false, message: 'costPrice is required unless using invoice pricing only' } };
    }

    const order = await createOrder({
      clientId,
      title: String(body.title),
      itemName: String(body.itemName),
      costPrice,
      clientPrice,
      quantity: Number(body.quantity ?? 1),
      createdBy: session.id,
      description: body.description ?? null,
      itemUrl: body.itemUrl ?? null,
      vendor: body.vendor ?? null,
      vendorOrderNumber: body.vendorOrderNumber ?? null,
      trackingNumber: body.trackingNumber ?? null,
      orderDate: body.orderDate,
      estimatedArrival: body.estimatedArrival ?? null,
      status: body.status,
      shippingStage: body.shippingStage,
      currentLocation: body.currentLocation ?? null,
      isLoggedInPreAlerts: Boolean(body.isLoggedInPreAlerts),
      preAlertNotes: body.preAlertNotes ?? null,
      assignedTechnicianId: body.assignedTechnicianId ?? session.id,
      tags: body.tags ?? [],
      notes: body.notes ?? null,
    });

    if (!order) {
      return { status: 500, body: { success: false, message: 'Failed to create order' } };
    }

    createNewOrderNotice({
      orderNumber: order.orderNumber,
      title: order.title,
      itemName: order.itemName,
      clientName: order.client?.name ?? 'Unknown client',
      costPrice: String((order as { costPrice?: number }).costPrice ?? 0),
      createdBy: session.username ?? 'Admin',
    }).catch(console.error);

    if (body.sendEmail === true) {
      notifyOrderCreated(order, { origin: getRequestPublicOriginFromCtx(ctx), sendEmail: true }).catch(console.error);
    }

    let ticket: Awaited<ReturnType<typeof createTicketForOrder>> | null = null;
    let ticketError: string | null = null;
    const linkToTicketId = body.linkToTicketId ? String(body.linkToTicketId) : null;
    const sourceCommentId = body.sourceCommentId ? String(body.sourceCommentId) : null;
    const shouldAutoCreateTicket = body.autoCreateTicket !== false && !linkToTicketId;

    if (shouldAutoCreateTicket) {
      try {
        ticket = await createTicketForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          clientId,
          title: order.title,
          itemName: order.itemName,
          description: order.description,
          vendor: order.vendor,
          vendorOrderNumber: order.vendorOrderNumber,
          trackingNumber: order.trackingNumber,
          clientPrice: order.clientPrice,
          quantity: order.quantity,
          notes: order.notes,
          createdBy: session.id,
          assignedTechnicianId: body.assignedTechnicianId ?? session.id,
          creatorName: session.username ?? 'Admin',
        });
      } catch (err) {
        ticketError = err instanceof Error ? err.message : 'Failed to create linked ticket';
        console.error('[ORDER] Auto-ticket creation failed:', err);
      }
    } else if (linkToTicketId) {
      try {
        const linkedTicket = await getTicketById(linkToTicketId);
        if (!linkedTicket) {
          ticketError = 'Linked ticket not found';
        } else {
          await addOrderLink(
            order.id,
            {
              linkedType: 'ticket',
              linkedId: linkedTicket.id,
              linkedNumber: linkedTicket.ticketNumber,
              notes: sourceCommentId
                ? `Linked from order-part comment ${sourceCommentId}`
                : 'Linked from ticket order comment',
            },
            session.id
          );
          ticket = {
            id: linkedTicket.id,
            ticketNumber: linkedTicket.ticketNumber,
            status: linkedTicket.status,
            clientName: linkedTicket.clientName,
          };
        }
      } catch (err) {
        ticketError = err instanceof Error ? err.message : 'Failed to link order to ticket';
        console.error('[ORDER] Ticket link failed:', err);
      }
    }

    if (sourceCommentId) {
      try {
        await ensureCommentLinkedOrderColumn();
        await TicketComment.update(
          { linkedOrderId: order.id },
          { where: { id: sourceCommentId } }
        );
      } catch (err) {
        console.error('[ORDER] Failed to update source comment:', err);
      }
    }

    const syncInvoice = body.syncInvoiceLineItem as
      | { invoiceId?: string; itemIndex?: number; itemName?: string }
      | undefined;
    if (syncInvoice?.invoiceId && syncInvoice.itemIndex != null && syncInvoice.itemName) {
      try {
        await syncInvoiceLineItemNameFromOrder({
          invoiceId: String(syncInvoice.invoiceId),
          itemIndex: Number(syncInvoice.itemIndex),
          itemName: String(syncInvoice.itemName),
        });
      } catch (err) {
        console.error('[ORDER] Failed to sync invoice line item name:', err);
      }
    }

    const linkInvoice = body.linkInvoice as { invoiceId?: string; invoiceNumber?: string } | undefined;
    if (linkInvoice?.invoiceId && linkInvoice.invoiceNumber) {
      try {
        await addOrderLink(
          order.id,
          {
            linkedType: 'invoice',
            linkedId: String(linkInvoice.invoiceId),
            linkedNumber: String(linkInvoice.invoiceNumber),
            notes: sourceCommentId
              ? `Linked from ticket order (comment ${sourceCommentId})`
              : 'Linked from ticket order with invoice line',
          },
          session.id
        );
        await addInvoiceLink(
          String(linkInvoice.invoiceId),
          {
            linkedType: 'order',
            linkedId: order.id,
            linkedNumber: order.orderNumber,
            notes: linkToTicketId ? 'Created from ticket order flow' : null,
          },
          session.id
        );
      } catch (err) {
        console.error('[ORDER] Failed to link invoice to order:', err);
      }
    }

    const message = ticket && !ticketError
      ? linkToTicketId
        ? `Order created and linked to ticket ${ticket.ticketNumber}`
        : `Order created and linked to ticket ${ticket.ticketNumber}`
      : ticketError
        ? `Order created, but ticket could not be linked: ${ticketError}`
        : 'Order created';

    return { status: 201, body: { success: true, message, order, ticket, ticketError } };
  } catch (error) {
    if (error instanceof AuthError) return authErrorResult(error);
    const message = error instanceof Error ? error.message : 'Failed to create order';
    const status = /client not found/i.test(message) ? 400 : 500;
    console.error('[ORDER] Create failed:', error);
    return { status, body: { success: false, message } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

