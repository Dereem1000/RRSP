import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { deleteInvoice, getInvoiceById, updateInvoice } from '@/lib/accounting';

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    const { id } = await params;
    const invoice = await getInvoiceById(id);
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, invoice });
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
    const invoice = await updateInvoice(id, body);
    if (!invoice) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Invoice updated', invoice });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to update invoice';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}

export async function DELETE(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { id } = await params;
    const deleted = await deleteInvoice(id);
    if (!deleted) {
      return NextResponse.json({ success: false, message: 'Invoice not found' }, { status: 404 });
    }
    return NextResponse.json({ success: true, message: 'Invoice deleted' });
  } catch (error) {
    return authErrorResponse(error);
  }
}

