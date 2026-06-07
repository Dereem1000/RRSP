import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { createNewOrderNotice } from '@/lib/order-notices';
import { notifyOrderCreated } from '@/lib/order-notifications';
import { createTicketForOrder } from '@/lib/order-tickets';
import { createOrder, getOrdersSummary, listOrders } from '@/lib/orders';
export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { searchParams } = req.nextUrl;
    const page = Number(searchParams.get('page') ?? 1);
    const limit = Number(searchParams.get('limit') ?? 20);
    const status = searchParams.get('status') ?? undefined;
    const shippingStage = searchParams.get('shippingStage') ?? undefined;
    const clientId = searchParams.get('clientId') ?? undefined;
    const search = searchParams.get('search') ?? undefined;
    const summaryOnly = searchParams.get('summary') === '1';

    if (summaryOnly) {
      const summary = await getOrdersSummary();
      return NextResponse.json({ success: true, summary });
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

    return NextResponse.json({ success: true, ...result });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const body = await req.json();
    if (!body.clientId?.trim()) {
      return NextResponse.json({ success: false, message: 'Client is required' }, { status: 400 });
    }
    if (!body.title || !body.itemName || body.clientPrice == null || body.costPrice == null) {
      return NextResponse.json(
        { success: false, message: 'title, itemName, costPrice, and clientPrice are required' },
        { status: 400 }
      );
    }

    const order = await createOrder({
      clientId: String(body.clientId),
      title: String(body.title),
      itemName: String(body.itemName),
      costPrice: Number(body.costPrice),
      clientPrice: Number(body.clientPrice),
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
      return NextResponse.json({ success: false, message: 'Failed to create order' }, { status: 500 });
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
      notifyOrderCreated(order, { origin: req.nextUrl.origin, sendEmail: true }).catch(console.error);
    }

    let ticket: Awaited<ReturnType<typeof createTicketForOrder>> | null = null;
    let ticketError: string | null = null;
    if (body.autoCreateTicket !== false) {
      try {
        ticket = await createTicketForOrder({
          orderId: order.id,
          orderNumber: order.orderNumber,
          clientId: String(body.clientId),
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
    }

    const message = ticket
      ? `Order created and linked to ticket ${ticket.ticketNumber}`
      : ticketError
        ? `Order created, but ticket could not be created: ${ticketError}`
        : 'Order created';

    return NextResponse.json(
      { success: true, message, order, ticket, ticketError },
      { status: 201 }
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create order';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
