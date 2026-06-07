import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { deletePayment } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const result = await deletePayment(id);
    if (!result) {
      return NextResponse.json({ success: false, message: 'Payment not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Payment deleted', invoice: result.invoice });
  } catch (error) {
    return authErrorResponse(error);
  }
}

