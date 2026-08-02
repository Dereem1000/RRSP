import { createHash } from 'crypto';
import { QueryTypes } from 'sequelize';
import { getSequelize } from '@/lib/db';

export type LatLon = { lat: number; lon: number };

export type RouteDistance = {
  distanceMeters: number | null;
  travelMinutes: number | null;
  distanceLabel: string | null;
  source: 'osrm' | 'haversine' | 'none';
};

/** Staff fulfillment card: distance, ETA, and mapped directions from → to. */
export type DrivingRouteSummary = {
  distanceMeters: number | null;
  travelMinutes: number | null;
  distanceLabel: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  from: LatLon | null;
  to: LatLon | null;
  mapEmbedUrl: string | null;
  directionsUrl: string | null;
  source: 'osrm' | 'haversine' | 'none';
  /** True when From and/or To used city-level fallback instead of exact address. */
  approximate: boolean;
  /** Staff-facing notice when approximate — prompt to edit the route. */
  staffNotice: string | null;
  matchedCityFrom: string | null;
  matchedCityTo: string | null;
};

export type GeocodeHit = {
  coords: LatLon;
  precision: 'exact' | 'city';
  cityLabel: string | null;
};

function emptyDrivingRoute(
  fromAddress: string | null = null,
  toAddress: string | null = null
): DrivingRouteSummary {
  return {
    distanceMeters: null,
    travelMinutes: null,
    distanceLabel: null,
    fromAddress,
    toAddress,
    from: null,
    to: null,
    mapEmbedUrl: null,
    directionsUrl: null,
    source: 'none',
    approximate: false,
    staffNotice: null,
    matchedCityFrom: null,
    matchedCityTo: null,
  };
}

function buildApproximationMeta(fromHit: GeocodeHit | null, toHit: GeocodeHit | null) {
  const fromApprox = fromHit?.precision === 'city';
  const toApprox = toHit?.precision === 'city';
  if (!fromApprox && !toApprox) {
    return {
      approximate: false,
      staffNotice: null as string | null,
      matchedCityFrom: fromHit?.cityLabel ?? null,
      matchedCityTo: toHit?.cityLabel ?? null,
    };
  }
  const bits: string[] = [];
  if (fromApprox) {
    bits.push(
      fromHit?.cityLabel
        ? `From used city centre (${fromHit.cityLabel})`
        : 'From used nearest city centre'
    );
  }
  if (toApprox) {
    bits.push(
      toHit?.cityLabel
        ? `To used city centre (${toHit.cityLabel})`
        : 'To used nearest city centre'
    );
  }
  return {
    approximate: true,
    staffNotice: `${bits.join('. ')}. Exact pin could not be resolved — edit the route to correct it.`,
    matchedCityFrom: fromHit?.cityLabel ?? null,
    matchedCityTo: toHit?.cityLabel ?? null,
  };
}

export function buildDirectionsUrls(from: LatLon, to: LatLon) {
  const mapEmbedUrl = `https://maps.google.com/maps?saddr=${from.lat},${from.lon}&daddr=${to.lat},${to.lon}&output=embed`;
  const directionsUrl = `https://www.openstreetmap.org/directions?engine=fossgis_osrm_car&route=${encodeURIComponent(
    `${from.lat},${from.lon};${to.lat},${to.lon}`
  )}`;
  return { mapEmbedUrl, directionsUrl };
}

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
const OSRM_BASE =
  process.env.OSRM_BASE_URL?.replace(/\/$/, '') || 'https://router.project-osrm.org';
const USER_AGENT = 'ComputerDynamicsPartsCatalog/1.0 (parts marketplace; local portal)';

let geocodeSchemaReady = false;
const memoryGeocode = new Map<string, GeocodeHit | null>();
let lastNominatimAt = 0;

/** Common Trinidad & Tobago place names for city-level fallback. */
const TT_PLACE_NAMES = [
  'Port of Spain',
  'San Fernando',
  'Chaguanas',
  'Arima',
  'Point Fortin',
  'Couva',
  'Tunapuna',
  'Sangre Grande',
  'Diego Martin',
  'Princes Town',
  'Siparia',
  'Mayaro',
  'Rio Claro',
  'Scarborough',
  'Tobago',
  'Marabella',
  'Gasparillo',
  'Arouca',
  'St Augustine',
  'Saint Augustine',
  'Curepe',
  'San Juan',
  'Laventille',
  'Morvant',
  'Petit Valley',
  'Westmoorings',
  'Woodbrook',
  'Belmont',
  'Cunupia',
  'Freeport',
  'Penal',
  'Debe',
  'La Romaine',
  'Point Lisas',
  'Tacarigua',
  'Trincity',
  'Valsayn',
  'Claxton Bay',
  'Fyzabad',
  'Princess Town',
];

function addressKey(address: string) {
  return createHash('sha256').update(normalizeAddress(address)).digest('hex').slice(0, 40);
}

export function normalizeAddress(address: string) {
  return address.trim().replace(/\s+/g, ' ').toLowerCase();
}

export function formatDistanceLabel(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters) || meters < 0) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  const km = meters / 1000;
  return `${km < 10 ? km.toFixed(1) : Math.round(km)} km`;
}

export function haversineMeters(a: LatLon, b: LatLon) {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const R = 6371000;
  const dLat = toRad(b.lat - a.lat);
  const dLon = toRad(b.lon - a.lon);
  const lat1 = toRad(a.lat);
  const lat2 = toRad(b.lat);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(lat1) * Math.cos(lat2) * Math.sin(dLon / 2) ** 2;
  return 2 * R * Math.asin(Math.min(1, Math.sqrt(h)));
}

async function ensureGeocodeSchema() {
  if (geocodeSchemaReady) return;
  const sequelize = getSequelize();
  await sequelize.query(`
    CREATE TABLE IF NOT EXISTS parts_geocode_cache (
      addressKey TEXT PRIMARY KEY,
      address TEXT NOT NULL,
      lat REAL,
      lon REAL,
      precision TEXT,
      cityLabel TEXT,
      updatedAt TEXT NOT NULL
    )
  `);
  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(parts_geocode_cache)`, {
    type: QueryTypes.SELECT,
  });
  if (!cols.some((col) => col.name === 'precision')) {
    await sequelize.query(`ALTER TABLE parts_geocode_cache ADD COLUMN precision TEXT`);
  }
  if (!cols.some((col) => col.name === 'cityLabel')) {
    await sequelize.query(`ALTER TABLE parts_geocode_cache ADD COLUMN cityLabel TEXT`);
  }
  geocodeSchemaReady = true;
}

async function readGeocodeCache(key: string): Promise<GeocodeHit | null | undefined> {
  await ensureGeocodeSchema();
  const sequelize = getSequelize();
  const rows = await sequelize.query<{
    lat: number | null;
    lon: number | null;
    precision: string | null;
    cityLabel: string | null;
  }>(`SELECT lat, lon, precision, cityLabel FROM parts_geocode_cache WHERE addressKey = :key LIMIT 1`, {
    type: QueryTypes.SELECT,
    replacements: { key },
  });
  const row = rows[0];
  if (!row) return undefined;
  if (row.lat == null || row.lon == null) return null;
  const precision = row.precision === 'city' ? 'city' : 'exact';
  return {
    coords: { lat: Number(row.lat), lon: Number(row.lon) },
    precision,
    cityLabel: row.cityLabel?.trim() || null,
  };
}

async function writeGeocodeCache(
  key: string,
  address: string,
  hit: GeocodeHit | null
) {
  await ensureGeocodeSchema();
  const sequelize = getSequelize();
  await sequelize.query(
    `
      INSERT INTO parts_geocode_cache (addressKey, address, lat, lon, precision, cityLabel, updatedAt)
      VALUES (:key, :address, :lat, :lon, :precision, :cityLabel, :now)
      ON CONFLICT(addressKey) DO UPDATE SET
        address = excluded.address,
        lat = excluded.lat,
        lon = excluded.lon,
        precision = excluded.precision,
        cityLabel = excluded.cityLabel,
        updatedAt = excluded.updatedAt
    `,
    {
      replacements: {
        key,
        address: address.trim(),
        lat: hit?.coords.lat ?? null,
        lon: hit?.coords.lon ?? null,
        precision: hit?.precision ?? null,
        cityLabel: hit?.cityLabel ?? null,
        now: new Date().toISOString(),
      },
    }
  );
}

function withTrinidadHint(address: string) {
  const lower = address.toLowerCase();
  if (
    lower.includes('trinidad') ||
    lower.includes('tobago') ||
    /\btt\b/.test(lower)
  ) {
    return address;
  }
  return `${address}, Trinidad and Tobago`;
}

async function waitForNominatimSlot() {
  const elapsed = Date.now() - lastNominatimAt;
  if (elapsed < 1100) {
    await new Promise((resolve) => setTimeout(resolve, 1100 - elapsed));
  }
  lastNominatimAt = Date.now();
}

/** Pull likely city / town names from a free-text address. */
export function extractCityCandidates(address: string): string[] {
  const raw = address.trim();
  if (!raw) return [];
  const lower = raw.toLowerCase();
  const candidates: string[] = [];

  for (const place of TT_PLACE_NAMES) {
    if (lower.includes(place.toLowerCase())) {
      candidates.push(place);
    }
  }

  const parts = raw
    .split(/[,|/]+/)
    .map((part) => part.trim())
    .filter(Boolean);
  for (const part of [...parts].reverse()) {
    if (/trinidad|tobago|\btt\b|west indies/i.test(part)) continue;
    if (/^\d+[a-z]?$/i.test(part)) continue;
    if (/\d{4,}/.test(part) && part.length < 12) continue;
    if (part.length < 3) continue;
    candidates.push(part);
  }

  // Last meaningful token group from a single-line address without commas
  if (!parts.length || parts.length === 1) {
    const tokens = raw.split(/\s+/).filter(Boolean);
    if (tokens.length >= 2) {
      candidates.push(tokens.slice(-2).join(' '));
      candidates.push(tokens[tokens.length - 1]);
    }
  }

  const seen = new Set<string>();
  const unique: string[] = [];
  for (const candidate of candidates) {
    const key = normalizeAddress(candidate);
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(candidate);
  }
  return unique.slice(0, 6);
}

type NominatimHit = {
  lat?: string;
  lon?: string;
  display_name?: string;
  type?: string;
  class?: string;
  importance?: number;
};

async function nominatimSearch(query: string, limit = 1): Promise<NominatimHit[]> {
  await waitForNominatimSlot();
  const url = new URL(NOMINATIM_URL);
  url.searchParams.set('q', withTrinidadHint(query));
  url.searchParams.set('format', 'json');
  url.searchParams.set('addressdetails', '1');
  url.searchParams.set('limit', String(Math.min(10, Math.max(1, limit))));

  const res = await fetch(url.toString(), {
    headers: {
      'User-Agent': USER_AGENT,
      Accept: 'application/json',
    },
    signal: AbortSignal.timeout(10_000),
  });
  if (!res.ok) return [];
  const data = (await res.json()) as NominatimHit[];
  return Array.isArray(data) ? data : [];
}

function pickClosestNominatimHit(hits: NominatimHit[], near: LatLon | null): GeocodeHit | null {
  const parsed = hits
    .map((hit) => {
      const lat = Number(hit.lat);
      const lon = Number(hit.lon);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
      return { hit, coords: { lat, lon } as LatLon };
    })
    .filter(Boolean) as Array<{ hit: NominatimHit; coords: LatLon }>;
  if (!parsed.length) return null;

  let best = parsed[0];
  if (near && parsed.length > 1) {
    let bestDist = haversineMeters(near, best.coords);
    for (const item of parsed.slice(1)) {
      const dist = haversineMeters(near, item.coords);
      if (dist < bestDist) {
        best = item;
        bestDist = dist;
      }
    }
  }

  const label =
    best.hit.display_name?.split(',')[0]?.trim() ||
    best.hit.display_name?.trim() ||
    null;
  return {
    coords: best.coords,
    precision: 'city',
    cityLabel: label,
  };
}

async function geocodeExactOnly(address: string): Promise<GeocodeHit | null> {
  try {
    const hits = await nominatimSearch(address, 1);
    const hit = hits[0];
    const lat = Number(hit?.lat);
    const lon = Number(hit?.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
    return {
      coords: { lat, lon },
      precision: 'exact',
      cityLabel: null,
    };
  } catch {
    return null;
  }
}

/**
 * When exact street geocode fails, resolve the identified city and pick the
 * Nominatim result closest to `near` (usually the other route endpoint).
 */
async function geocodeCityFallback(
  address: string,
  near: LatLon | null
): Promise<GeocodeHit | null> {
  const candidates = extractCityCandidates(address);
  for (const city of candidates) {
    const cityKey = `city:${addressKey(city)}`;
    if (memoryGeocode.has(cityKey) && !near) {
      const cached = memoryGeocode.get(cityKey) ?? null;
      if (cached) return { ...cached, precision: 'city', cityLabel: cached.cityLabel || city };
    }
    try {
      const hits = await nominatimSearch(city, near ? 5 : 3);
      const picked = pickClosestNominatimHit(hits, near);
      if (picked) {
        const hit: GeocodeHit = {
          ...picked,
          precision: 'city',
          cityLabel: picked.cityLabel || city,
        };
        if (!near) {
          memoryGeocode.set(cityKey, hit);
          await writeGeocodeCache(cityKey, city, hit).catch(() => undefined);
        }
        return hit;
      }
    } catch {
      // try next city candidate
    }
  }
  return null;
}

/**
 * Geocode with exact address first; if that fails, fall back to the closest
 * match within the identified city (optionally nearest to `near`).
 *
 * Pass `{ liveGeocode: false }` on hot request paths (marketplace list) so we
 * never hit Nominatim — only lat/lon parse + memory/DB cache. Live geocode is
 * reserved for fulfill / staff route edit.
 */
export async function geocodeAddressDetailed(
  address: string | null | undefined,
  near: LatLon | null = null,
  options?: { liveGeocode?: boolean }
): Promise<GeocodeHit | null> {
  const liveGeocode = options?.liveGeocode !== false;
  const raw = String(address ?? '').trim();
  if (!raw) return null;

  const asCoords = parseLatLon(raw);
  if (asCoords) {
    return { coords: asCoords, precision: 'exact', cityLabel: null };
  }

  const key = addressKey(raw);
  if (!near && memoryGeocode.has(key)) {
    const mem = memoryGeocode.get(key) ?? null;
    // Only trust memory hits; null means prior full failure (exact + city).
    if (mem) return mem;
    if (mem === null) return null;
  }
  if (!near) {
    const cached = await readGeocodeCache(key);
    if (cached !== undefined && cached !== null) {
      memoryGeocode.set(key, cached);
      return cached;
    }
    // cached === null was an old exact-only miss — still try city fallback when live.
    if (!liveGeocode) {
      if (cached === null) {
        memoryGeocode.set(key, null);
        return null;
      }
      return null;
    }
  } else if (!liveGeocode) {
    // near-biased city lookups require live Nominatim — skip on hot paths.
    const cached = await readGeocodeCache(key);
    if (cached) return cached;
    return null;
  }

  if (!liveGeocode) return null;

  const exact = await geocodeExactOnly(raw);
  if (exact) {
    memoryGeocode.set(key, exact);
    await writeGeocodeCache(key, raw, exact).catch(() => undefined);
    return exact;
  }

  const cityHit = await geocodeCityFallback(raw, near);
  if (cityHit) {
    // Cache the address → city fallback so marketplace/fulfillment reuse it.
    memoryGeocode.set(key, cityHit);
    await writeGeocodeCache(key, raw, cityHit).catch(() => undefined);
    return cityHit;
  }

  memoryGeocode.set(key, null);
  await writeGeocodeCache(key, raw, null).catch(() => undefined);
  return null;
}

/** Geocode an address (exact, then city fallback). Accepts "lat,lon". */
export async function geocodeAddress(
  address: string | null | undefined,
  options?: { liveGeocode?: boolean }
): Promise<LatLon | null> {
  const hit = await geocodeAddressDetailed(address, null, options);
  return hit?.coords ?? null;
}

/** Parse "lat,lon" for staff route edits. */
export function parseLatLon(value: string): LatLon | null {
  const m = value.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!m) return null;
  const lat = Number(m[1]);
  const lon = Number(m[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lon)) return null;
  if (Math.abs(lat) > 90 || Math.abs(lon) > 180) return null;
  return { lat, lon };
}

/** Single origin → destination driving route (for staff recalculate). */
export async function getDrivingRoute(
  fromAddress: string | null | undefined,
  toAddress: string | null | undefined,
  options?: { liveGeocode?: boolean }
): Promise<DrivingRouteSummary> {
  const [summary] = await routesFromOriginAddress(fromAddress, [toAddress], {
    // Explicit single-route actions may live-geocode; list cards should not.
    liveGeocode: options?.liveGeocode === true,
  });
  return (
    summary ??
    emptyDrivingRoute(
      String(fromAddress ?? '').trim() || null,
      String(toAddress ?? '').trim() || null
    )
  );
}

async function osrmTableFromOrigin(
  origin: LatLon,
  destinations: LatLon[]
): Promise<Array<{ distanceMeters: number | null; travelMinutes: number | null }>> {
  if (!destinations.length) return [];

  const coords = [origin, ...destinations]
    .map((p) => `${p.lon},${p.lat}`)
    .join(';');
  const url = `${OSRM_BASE}/table/v1/driving/${coords}?sources=0&annotations=distance,duration`;

  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) {
      return destinations.map(() => ({ distanceMeters: null, travelMinutes: null }));
    }
    const data = (await res.json()) as {
      code?: string;
      distances?: Array<Array<number | null>>;
      durations?: Array<Array<number | null>>;
    };
    if (data.code && data.code !== 'Ok') {
      return destinations.map(() => ({ distanceMeters: null, travelMinutes: null }));
    }
    const distances = data.distances?.[0] ?? [];
    const durations = data.durations?.[0] ?? [];
    return destinations.map((_, index) => {
      // index 0 is origin itself in the matrix row; destinations start at 1
      const meters = distances[index + 1];
      const seconds = durations[index + 1];
      const distanceMeters =
        meters != null && Number.isFinite(meters) && meters >= 0 ? Math.round(meters) : null;
      const travelMinutes =
        seconds != null && Number.isFinite(seconds) && seconds >= 0
          ? Math.max(1, Math.round(seconds / 60))
          : null;
      return { distanceMeters, travelMinutes };
    });
  } catch {
    return destinations.map(() => ({ distanceMeters: null, travelMinutes: null }));
  }
}

/**
 * Road distances from a buyer address to each supplier address.
 * Uses OSRM public demo (or OSRM_BASE_URL) with Nominatim geocoding + SQLite cache.
 * Falls back to haversine when OSRM fails for a pair.
 *
 * Default `liveGeocode: false` — marketplace must stay fast; only pins + cache.
 */
export async function distancesFromBuyerAddress(
  buyerAddress: string | null | undefined,
  supplierAddresses: Array<string | null | undefined>,
  options?: { liveGeocode?: boolean }
): Promise<RouteDistance[]> {
  const liveGeocode = options?.liveGeocode === true;
  const origin = await geocodeAddress(buyerAddress, { liveGeocode });
  if (!origin) {
    return supplierAddresses.map(() => ({
      distanceMeters: null,
      travelMinutes: null,
      distanceLabel: null,
      source: 'none' as const,
    }));
  }

  const uniqueAddresses: string[] = [];
  const uniqueIndexByAddress = new Map<string, number>();
  for (const address of supplierAddresses) {
    const trimmed = String(address ?? '').trim();
    if (!trimmed) continue;
    const key = normalizeAddress(trimmed);
    if (!uniqueIndexByAddress.has(key)) {
      uniqueIndexByAddress.set(key, uniqueAddresses.length);
      uniqueAddresses.push(trimmed);
    }
  }

  const uniqueCoords = await Promise.all(
    uniqueAddresses.map((address) => geocodeAddress(address, { liveGeocode }))
  );
  const validDestinations: LatLon[] = [];
  const validMapIndex: number[] = [];
  uniqueCoords.forEach((coords, index) => {
    if (coords) {
      validMapIndex.push(index);
      validDestinations.push(coords);
    }
  });

  const osrmResults = await osrmTableFromOrigin(origin, validDestinations);
  const byUniqueIndex = uniqueAddresses.map((_, index) => {
    const coords = uniqueCoords[index];
    if (!coords) {
      return {
        distanceMeters: null,
        travelMinutes: null,
        distanceLabel: null,
        source: 'none' as const,
      };
    }
    const osrmSlot = validMapIndex.indexOf(index);
    const osrm = osrmSlot >= 0 ? osrmResults[osrmSlot] : null;
    if (osrm?.distanceMeters != null) {
      return {
        distanceMeters: osrm.distanceMeters,
        travelMinutes: osrm.travelMinutes,
        distanceLabel: formatDistanceLabel(osrm.distanceMeters),
        source: 'osrm' as const,
      };
    }
    const meters = Math.round(haversineMeters(origin, coords));
    return {
      distanceMeters: meters,
      travelMinutes: Math.max(1, Math.round(meters / 500)), // ~30 km/h rough
      distanceLabel: formatDistanceLabel(meters),
      source: 'haversine' as const,
    };
  });

  return supplierAddresses.map((address) => {
    const trimmed = String(address ?? '').trim();
    if (!trimmed) {
      return {
        distanceMeters: null,
        travelMinutes: null,
        distanceLabel: null,
        source: 'none' as const,
      };
    }
    const idx = uniqueIndexByAddress.get(normalizeAddress(trimmed));
    if (idx == null) {
      return {
        distanceMeters: null,
        travelMinutes: null,
        distanceLabel: null,
        source: 'none' as const,
      };
    }
    return byUniqueIndex[idx];
  });
}

/** Cheapest option(s) first (closest among ties), then remaining by closest road distance. */
export function sortListingsCheapestThenClosest<
  T extends { unitPrice: number; distanceMeters?: number | null },
>(listings: T[]): T[] {
  if (listings.length <= 1) return listings;
  const lowest = Math.min(...listings.map((listing) => listing.unitPrice));
  const byDistanceThenPrice = (a: T, b: T) => {
    const da = a.distanceMeters ?? Number.POSITIVE_INFINITY;
    const db = b.distanceMeters ?? Number.POSITIVE_INFINITY;
    if (da !== db) return da - db;
    return a.unitPrice - b.unitPrice;
  };
  const cheapest = listings
    .filter((listing) => listing.unitPrice === lowest)
    .sort(byDistanceThenPrice);
  const rest = listings
    .filter((listing) => listing.unitPrice !== lowest)
    .sort(byDistanceThenPrice);
  return [...cheapest, ...rest];
}

/**
 * Driving routes from an origin address (e.g. CD office) to each destination.
 * Uses exact geocode when possible; otherwise city-level fallback (closest hit
 * near the other endpoint) and marks the route as approximate for staff.
 *
 * Default `liveGeocode: false` on list endpoints so Cloudflare/tunnel stays under timeout.
 * Pass `{ liveGeocode: true }` for fulfill preview / staff route recalculate.
 */
export async function routesFromOriginAddress(
  originAddress: string | null | undefined,
  destinationAddresses: Array<string | null | undefined>,
  options?: { liveGeocode?: boolean }
): Promise<DrivingRouteSummary[]> {
  const liveGeocode = options?.liveGeocode === true;
  const fromAddress = String(originAddress ?? '').trim() || null;
  if (!fromAddress) {
    return destinationAddresses.map((address) =>
      emptyDrivingRoute(null, String(address ?? '').trim() || null)
    );
  }

  const originHit = await geocodeAddressDetailed(fromAddress, null, { liveGeocode });
  if (!originHit) {
    return destinationAddresses.map((address) =>
      emptyDrivingRoute(fromAddress, String(address ?? '').trim() || null)
    );
  }

  const uniqueAddresses: string[] = [];
  const uniqueIndexByAddress = new Map<string, number>();
  for (const address of destinationAddresses) {
    const trimmed = String(address ?? '').trim();
    if (!trimmed) continue;
    const key = normalizeAddress(trimmed);
    if (!uniqueIndexByAddress.has(key)) {
      uniqueIndexByAddress.set(key, uniqueAddresses.length);
      uniqueAddresses.push(trimmed);
    }
  }

  // Prefer destination pin closest to origin when falling back to city matches.
  const uniqueHits = await Promise.all(
    uniqueAddresses.map((address) =>
      geocodeAddressDetailed(address, liveGeocode ? originHit.coords : null, { liveGeocode })
    )
  );
  const validDestinations: LatLon[] = [];
  const validMapIndex: number[] = [];
  uniqueHits.forEach((hit, index) => {
    if (hit) {
      validMapIndex.push(index);
      validDestinations.push(hit.coords);
    }
  });

  const osrmResults = await osrmTableFromOrigin(originHit.coords, validDestinations);
  const byUniqueIndex: DrivingRouteSummary[] = uniqueAddresses.map((toAddress, index) => {
    const destHit = uniqueHits[index];
    if (!destHit) {
      return emptyDrivingRoute(fromAddress, toAddress);
    }
    const urls = buildDirectionsUrls(originHit.coords, destHit.coords);
    const approx = buildApproximationMeta(originHit, destHit);
    const osrmSlot = validMapIndex.indexOf(index);
    const osrm = osrmSlot >= 0 ? osrmResults[osrmSlot] : null;
    if (osrm?.distanceMeters != null) {
      return {
        distanceMeters: osrm.distanceMeters,
        travelMinutes: osrm.travelMinutes,
        distanceLabel: formatDistanceLabel(osrm.distanceMeters),
        fromAddress,
        toAddress,
        from: originHit.coords,
        to: destHit.coords,
        mapEmbedUrl: urls.mapEmbedUrl,
        directionsUrl: urls.directionsUrl,
        source: 'osrm',
        ...approx,
      };
    }
    const meters = Math.round(haversineMeters(originHit.coords, destHit.coords));
    return {
      distanceMeters: meters,
      travelMinutes: Math.max(1, Math.round(meters / 500)),
      distanceLabel: formatDistanceLabel(meters),
      fromAddress,
      toAddress,
      from: originHit.coords,
      to: destHit.coords,
      mapEmbedUrl: urls.mapEmbedUrl,
      directionsUrl: urls.directionsUrl,
      source: 'haversine',
      approximate: true,
      staffNotice:
        approx.staffNotice ||
        'Road routing unavailable — distance is estimated. Edit the route if needed.',
      matchedCityFrom: approx.matchedCityFrom,
      matchedCityTo: approx.matchedCityTo,
    };
  });

  return destinationAddresses.map((address) => {
    const trimmed = String(address ?? '').trim();
    if (!trimmed) return emptyDrivingRoute(fromAddress, null);
    const idx = uniqueIndexByAddress.get(normalizeAddress(trimmed));
    if (idx == null) return emptyDrivingRoute(fromAddress, trimmed);
    return byUniqueIndex[idx];
  });
}
