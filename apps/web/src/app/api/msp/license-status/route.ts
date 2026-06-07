import { NextRequest, NextResponse } from 'next/server';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  ACTIVATION_FEATURES,
  getActivationFeatures,
} from '@/lib/license-constants';
import {
  buildFeatureLicenseStatus,
  getActiveLicenses,
  getLicenseStatusByMspClientId,
  isLicenseDbAvailable,
  getLicenseDbPathForDisplay,
} from '@/lib/license-service';
import { Client } from '@/lib/db';
import { Op } from 'sequelize';
import { SERVICE_LEVELS } from '@/lib/client-constants';

export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin', 'technician');

    if (!isLicenseDbAvailable()) {
      return NextResponse.json({
        success: true,
        dbAvailable: false,
        dbPath: getLicenseDbPathForDisplay(),
        statuses: [],
        message: 'License database not found. Set LICENSE_DB_PATH in .env',
      });
    }

    const clients = await Client.findAll({
      where: { serviceLevel: { [Op.in]: [...SERVICE_LEVELS] } },
      attributes: ['id', 'name', 'companyName', 'serviceLevel', 'features', 'status'],
    });

    const statuses = [];
    for (const client of clients) {
      const activationFeatures = getActivationFeatures(client.features);
      if (activationFeatures.length === 0) continue;

      let license = null;
      try {
        license = await getLicenseStatusByMspClientId(client.id);
      } catch {
        license = null;
      }

      const featureLicenseStatus = buildFeatureLicenseStatus(activationFeatures, license);
      const hasLicense = Object.values(featureLicenseStatus).some((s) => s?.isActive);

      statuses.push({
        clientId: client.id,
        clientName: client.companyName || client.name,
        serviceLevel: client.serviceLevel,
        hasLicense,
        licenseStatus: hasLicense
          ? 'Active'
          : license
            ? 'Pending'
            : 'Not Found',
        activationFeatures,
        featureLicenseStatus,
        licenseType: license?.licenseType ?? null,
        serialNumber: license?.serialNumber ?? null,
        expirationDate: license?.expirationDate ?? null,
        lastChecked: new Date().toISOString(),
      });
    }

    return NextResponse.json({ success: true, dbAvailable: true, statuses });
  } catch (error) {
    return authErrorResponse(error);
  }
}
