import { QueryTypes } from 'sequelize';
import { Client, getSequelize } from '@/lib/db';

let columnsReady: boolean | null = null;

/** Ensure clients table has latitude / longitude / location_source for map pins. */
export async function ensureClientLocationColumns() {
  if (columnsReady === true) return;
  const sequelize = getSequelize();
  try {
    const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(clients)`, {
      type: QueryTypes.SELECT,
    });
    const names = new Set(cols.map((col) => col.name));
    if (!names.has('latitude')) {
      await sequelize.query(`ALTER TABLE clients ADD COLUMN latitude REAL`);
    }
    if (!names.has('longitude')) {
      await sequelize.query(`ALTER TABLE clients ADD COLUMN longitude REAL`);
    }
    if (!names.has('location_source')) {
      await sequelize.query(`ALTER TABLE clients ADD COLUMN location_source TEXT`);
    }
    columnsReady = true;
  } catch {
    // Still allow contract_details JSON fallback.
    columnsReady = false;
  }
}

export function coordsFromClient(client: {
  latitude?: number | null;
  longitude?: number | null;
}): string | null {
  const lat = Number(client.latitude);
  const lon = Number(client.longitude);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return `${lat},${lon}`;
}

type LocationPayload = {
  latitude: number | null;
  longitude: number | null;
  locationSource: 'geocode' | 'pin' | null;
};

function asLocationSource(value: unknown): 'geocode' | 'pin' | null {
  return value === 'pin' || value === 'geocode' ? value : null;
}

function parseCoord(value: unknown): number | null {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function locationFromContractDetails(details: unknown): LocationPayload | null {
  if (!details || typeof details !== 'object' || Array.isArray(details)) return null;
  const record = details as Record<string, unknown>;
  const latitude = parseCoord(record.mapLatitude ?? record.latitude);
  const longitude = parseCoord(record.mapLongitude ?? record.longitude);
  if (latitude == null || longitude == null) return null;
  return {
    latitude,
    longitude,
    locationSource: asLocationSource(record.mapLocationSource ?? record.locationSource),
  };
}

/** Resolve pin from SQL columns and/or contract_details JSON blob. */
export function resolveClientMapLocation(input: {
  latitude?: number | null;
  longitude?: number | null;
  contractDetails?: unknown;
}): LocationPayload | null {
  const fromJson = locationFromContractDetails(input.contractDetails);
  if (fromJson) return fromJson;
  const latitude = parseCoord(input.latitude);
  const longitude = parseCoord(input.longitude);
  if (latitude == null || longitude == null) return null;
  return { latitude, longitude, locationSource: null };
}

/**
 * Persist map pin.
 * Primary: contract_details JSON (always available on Client model).
 * Secondary: latitude/longitude columns when present.
 */
export async function saveClientLocation(
  clientId: string,
  input: LocationPayload
): Promise<{ verified: LocationPayload }> {
  await ensureClientLocationColumns();

  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'contractDetails'],
  });
  if (!client) {
    throw new Error('Client not found while saving map pin');
  }

  const existing =
    client.contractDetails && typeof client.contractDetails === 'object'
      ? { ...(client.contractDetails as Record<string, unknown>) }
      : {};

  if (input.latitude == null || input.longitude == null) {
    delete existing.mapLatitude;
    delete existing.mapLongitude;
    delete existing.mapLocationSource;
  } else {
    existing.mapLatitude = input.latitude;
    existing.mapLongitude = input.longitude;
    existing.mapLocationSource = input.locationSource ?? 'pin';
  }

  await client.update({ contractDetails: existing });

  // Best-effort column write (ignored if columns missing).
  if (columnsReady) {
    try {
      await getSequelize().query(
        `
          UPDATE clients
          SET latitude = :latitude,
              longitude = :longitude,
              location_source = :locationSource
          WHERE id = :clientId
        `,
        {
          replacements: {
            clientId,
            latitude: input.latitude,
            longitude: input.longitude,
            locationSource: input.locationSource,
          },
        }
      );
    } catch {
      // JSON fallback remains the source of truth.
    }
  }

  const verified = await readClientLocation(clientId);
  if (input.latitude != null && input.longitude != null) {
    if (
      verified.latitude == null ||
      verified.longitude == null ||
      Math.abs(verified.latitude - input.latitude) > 1e-7 ||
      Math.abs(verified.longitude - input.longitude) > 1e-7
    ) {
      throw new Error('Failed to store map pin — please try saving again');
    }
  }

  return { verified };
}

export async function readClientLocation(clientId: string): Promise<LocationPayload> {
  await ensureClientLocationColumns();

  // Prefer contract_details — reliable across stale schema/model builds.
  const client = await Client.findByPk(clientId, {
    attributes: ['id', 'contractDetails'],
  });
  const fromJson = locationFromContractDetails(client?.contractDetails);
  if (fromJson) return fromJson;

  if (!columnsReady) {
    return { latitude: null, longitude: null, locationSource: null };
  }

  try {
    const rows = await getSequelize().query<{
      latitude: number | null;
      longitude: number | null;
      location_source: string | null;
    }>(
      `
        SELECT latitude, longitude, location_source
        FROM clients
        WHERE id = :clientId
        LIMIT 1
      `,
      { type: QueryTypes.SELECT, replacements: { clientId } }
    );
    const row = rows[0];
    if (!row) return { latitude: null, longitude: null, locationSource: null };
    const latitude = parseCoord(row.latitude);
    const longitude = parseCoord(row.longitude);
    if (latitude == null || longitude == null) {
      return { latitude: null, longitude: null, locationSource: null };
    }
    return {
      latitude,
      longitude,
      locationSource: asLocationSource(row.location_source),
    };
  } catch {
    return { latitude: null, longitude: null, locationSource: null };
  }
}
