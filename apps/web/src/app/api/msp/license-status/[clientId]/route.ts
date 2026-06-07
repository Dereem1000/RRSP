import { NextRequest, NextResponse } from 'next/server';
import { Client } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { getActivationFeatures } from '@/lib/license-constants';
import { getClientLicenseSnapshot, getLicenseDbPathForDisplay } from '@/lib/license-service';

type RouteParams = { params: Promise<{ clientId: string }> };

async function syncClientFeaturesFromLicense(client: Client, activationFeatures: string[]) {
  const stored = getActivationFeatures(client.features);
  if (
    activationFeatures.length > 0 &&
    JSON.stringify(activationFeatures) !== JSON.stringify(stored)
  ) {
    await client.update({ features: activationFeatures });
  }
}

export async function GET(_req: NextRequest, { params }: RouteParams) {
  try {
    const session = requireSession(_req);
    requireRole(session, 'admin', 'technician', 'client');

    const { clientId } = await params;
    const client = await Client.findByPk(clientId);
    if (!client) {
      return NextResponse.json({ success: false, message: 'Client not found' }, { status: 404 });
    }

    if (session.role === 'client') {
      const linked = await Client.findOne({ where: { userId: session.id } });
      if (!linked || linked.id !== clientId) {
        return NextResponse.json({ success: false, message: 'Access denied' }, { status: 403 });
      }
    }

    if (!['basic', 'standard', 'premium', 'enterprise', 'per-job'].includes(client.serviceLevel ?? '')) {
      return NextResponse.json({
        success: true,
        clientId,
        clientName: client.name,
        hasLicense: false,
        licenseStatus: 'Not Applicable',
        source: 'license_system',
        features: [],
        activationFeatures: [],
        dbAvailable: true,
      });
    }

    const snapshot = await getClientLicenseSnapshot(clientId);

    if (!snapshot.dbAvailable) {
      return NextResponse.json({
        success: true,
        clientId,
        clientName: client.name,
        hasLicense: false,
        licenseStatus: 'Database Unavailable',
        source: 'license_system',
        dbAvailable: false,
        dbPath: snapshot.dbPath ?? getLicenseDbPathForDisplay(),
        activationFeatures: getActivationFeatures(client.features),
      });
    }

    if (session.role !== 'client') {
      await syncClientFeaturesFromLicense(client, snapshot.activationFeatures);
    }

    const { license } = snapshot;
    const statusLabel =
      snapshot.overallStatus === 'Partial'
        ? 'Partially active'
        : snapshot.overallStatus;

    return NextResponse.json({
      success: true,
      clientId,
      clientName: client.companyName || client.name,
      serviceLevel: client.serviceLevel,
      source: 'license_system',
      hasLicense: snapshot.hasActiveLicense,
      licenseStatus: statusLabel,
      overallStatus: snapshot.overallStatus,
      features: snapshot.activationFeatures,
      activationFeatures: snapshot.activationFeatures,
      featureLicenseStatus: snapshot.featureLicenseStatus,
      licenseType: license?.licenseType ?? null,
      maxUsers: license?.maxUsers ?? null,
      expirationDate: license?.expirationDate ?? null,
      serialNumber: license?.serialNumber ?? null,
      dbAvailable: true,
      lastChecked: new Date().toISOString(),
      message:
        snapshot.overallStatus === 'Active'
          ? 'All licensed systems are active'
          : snapshot.overallStatus === 'Partial'
            ? 'Some systems active, others pending'
            : snapshot.overallStatus === 'Pending'
              ? 'Licenses exist but need activation'
              : 'No licenses in activation system — sync from client form',
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
