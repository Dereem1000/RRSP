import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  createOrderArrivedNotice,
  createOrderNotPreAlertedNotice,
  createOrderStatusUpdateNotice,
} from '@/lib/order-notices';
import {
  notifyOrderArrived,
  notifyOrderStatusChange,
} from '@/lib/order-notifications';
import { deleteOrder, getOrderById, updateOrder } from '@/lib/orders';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const order = await getOrderById(id, { includeCost: session.role === 'admin' });
    if (!order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, order });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json();
    const result = await updateOrder(id, body);
    if (!result?.order) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    const { previous, order } = result;
    const clientName = order.client?.name ?? 'Unknown client';

    if (body.status && body.status !== previous.status) {
      createOrderStatusUpdateNotice({
        orderNumber: order.orderNumber,
        title: order.title,
        status: order.status,
        previousStatus: previous.status,
        clientName,
      }).catch(console.error);

      notifyOrderStatusChange(order, previous.status, {
        origin: req.nextUrl.origin,
        sendEmail: body.sendEmail === true,
      }).catch(console.error);
    }

    if (body.actualArrival && !previous.actualArrival) {
      createOrderArrivedNotice({
        orderNumber: order.orderNumber,
        title: order.title,
        itemName: order.itemName,
        clientName,
      }).catch(console.error);

      notifyOrderArrived(order, { origin: req.nextUrl.origin }).catch(console.error);
    }

    if (body.isLoggedInPreAlerts === false && previous.isLoggedInPreAlerts) {
      createOrderNotPreAlertedNotice({
        orderNumber: order.orderNumber,
        title: order.title,
        itemName: order.itemName,
        clientName,
        createdBy: session.username ?? 'Admin',
        costPrice: String((order as { costPrice?: number }).costPrice ?? 0),
      }).catch(console.error);
    }

    return NextResponse.json({ success: true, message: 'Order updated', order });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update order';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const deleted = await deleteOrder(id);
    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Order deleted' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
