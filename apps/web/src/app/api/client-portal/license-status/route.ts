import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireSession } from '@/lib/auth';
import { getClientLicenseSnapshot } from '@/lib/license-service';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    if (session.role !== 'client') {
      return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
    }

    const client = await Client.findOne({
      where: { userId: session.id },
      attributes: ['id', 'name', 'companyName', 'email', 'serviceLevel'],
    });

    if (!client) {
      return NextResponse.json({ success: false, message: 'Client record not found' }, { status: 404 });
    }

    const mspLevels = ['basic', 'standard', 'premium', 'enterprise', 'per-job'];
    if (!client.serviceLevel || !mspLevels.includes(client.serviceLevel)) {
      return NextResponse.json({
        success: true,
        licenseStatus: {
          hasLicense: false,
          isActive: false,
          licenseStatus: 'Not Applicable',
          source: 'license_system',
          activationFeatures: [],
          features: {},
        },
      });
    }

    const snapshot = await getClientLicenseSnapshot(client.id);

    return NextResponse.json({
      success: true,
      licenseStatus: {
        source: 'license_system',
        hasLicense: snapshot.hasActiveLicense,
        isActive: snapshot.overallStatus === 'Active',
        licenseStatus:
          snapshot.overallStatus === 'Partial' ? 'Partially active' : snapshot.overallStatus,
        overallStatus: snapshot.overallStatus,
        licenseType: snapshot.license?.licenseType ?? null,
        serialNumber: snapshot.license?.serialNumber ?? null,
        maxUsers: snapshot.license?.maxUsers ?? null,
        features: snapshot.license?.features ?? {},
        activationFeatures: snapshot.activationFeatures,
        featureLicenseStatus: snapshot.featureLicenseStatus,
        activationDate: snapshot.license?.activationDate ?? null,
        expirationDate: snapshot.license?.expirationDate ?? null,
        companyName: snapshot.license?.companyName ?? client.companyName ?? client.name,
        dbAvailable: snapshot.dbAvailable,
      },
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
