import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { addOrderLink, listOrderLinks } from '@/lib/orders';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const links = await listOrderLinks(id);
    return NextResponse.json({ success: true, links });
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function POST(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const body = await req.json();
    if (!body.linkedType || !body.linkedId || !body.linkedNumber) {
      return NextResponse.json({ success: false, message: 'linkedType, linkedId, and linkedNumber are required' }, { status: 400 });
    }

    const link = await addOrderLink(
      id,
      {
        linkedType: body.linkedType,
        linkedId: String(body.linkedId),
        linkedNumber: String(body.linkedNumber),
        notes: body.notes ?? null,
      },
      session.id
    );

    if (!link) {
      return NextResponse.json({ success: false, message: 'Order not found' }, { status: 404 });
    }

    return NextResponse.json({ success: true, message: 'Link created', link }, { status: 201 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to create link';
    return NextResponse.json({ success: false, message }, { status: 400 });
  }
}
