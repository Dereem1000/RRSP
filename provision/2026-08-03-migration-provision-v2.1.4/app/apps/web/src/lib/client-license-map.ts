import { Op } from 'sequelize';
import { Client } from '@cd-v2/database';
import { getActivationFeatures } from '@/lib/license-constants';
import {
  getClientLicenseSnapshot,
  isLicenseDbAvailable,
} from '@/lib/license-service';

export type ClientLicenseBadge = {
  status: 'Active' | 'Pending' | 'Not Found' | 'Not Required' | 'N/A' | 'Unavailable';
  label: string;
};

export async function getClientLicenseBadgeMap(
  clientIds?: string[]
): Promise<Record<string, ClientLicenseBadge>> {
  const where =
    clientIds && clientIds.length > 0
      ? { id: { [Op.in]: clientIds } }
      : undefined;

  const clients = await Client.findAll({
    ...(where ? { where } : {}),
    attributes: ['id', 'serviceLevel', 'features'],
  });

  const map: Record<string, ClientLicenseBadge> = {};
  const dbAvailable = isLicenseDbAvailable();

  for (const client of clients) {
    if (getActivationFeatures(client.features).length === 0) {
      map[client.id] = { status: 'N/A', label: '—' };
      continue;
    }

    if (!dbAvailable) {
      map[client.id] = { status: 'Unavailable', label: 'DB offline' };
      continue;
    }

    try {
      const snapshot = await getClientLicenseSnapshot(client.id);

      if (snapshot.overallStatus === 'Active') {
        map[client.id] = { status: 'Active', label: 'Active' };
      } else if (snapshot.overallStatus === 'Partial') {
        map[client.id] = { status: 'Pending', label: 'Partial' };
      } else if (snapshot.overallStatus === 'Pending') {
        map[client.id] = { status: 'Pending', label: 'Pending' };
      } else {
        map[client.id] = { status: 'Not Found', label: 'Not synced' };
      }
    } catch {
      map[client.id] = { status: 'Unavailable', label: 'Error' };
    }
  }

  return map;
}
