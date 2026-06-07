import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { syncClientToLicenseSystem, clientHasActivationFeatures } from '@/lib/license-sync';
import { isLicenseDbAvailable, getLicenseDbPathForDisplay } from '@/lib/license-service';
import { activateLicense } from '@/lib/license-service';

type RouteParams = { params: Promise<{ clientId: string }> };

export async function POST(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin');

    const { clientId } = await params;
    const client = await Client.findByPk(clientId);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    if (!isLicenseDbAvailable()) {
      return NextResponse.json(
        {
          success: false,
          message: `License database not found. Configure LICENSE_DB_PATH (expected: ${getLicenseDbPathForDisplay()})`,
        },
        { status: 503 }
      );
    }

    if (!clientHasActivationFeatures(client)) {
      return NextResponse.json(
        { success: false, message: 'Select at least one activation feature before syncing' },
        { status: 400 }
      );
    }

    const result = await syncClientToLicenseSystem(client);
    return NextResponse.json(result);
  } catch (error) {
    return authErrorResponse(error);
  }
}

export async function PUT(req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const { clientId } = await params;
    const body = await req.json();
    const licenseId = Number(body.licenseId);

    if (!licenseId) {
      return NextResponse.json({ success: false, message: 'licenseId is required' }, { status: 400 });
    }

    if (!isLicenseDbAvailable()) {
      return NextResponse.json({ success: false, message: 'License database unavailable' }, { status: 503 });
    }

    await activateLicense(licenseId);
    return NextResponse.json({ success: true, message: 'License activated' });
  } catch (error) {
    return authErrorResponse(error);
  }
}
