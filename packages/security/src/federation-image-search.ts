import { SystemConfig } from '@cd-v2/database';

export type FederationImageSearchProvider = 'google' | 'brave';

export const FederationImageSearchConfigKeys = {
  provider: 'federation_image_search_provider',
  apiKey: 'federation_google_image_api_key',
  searchEngineId: 'federation_google_search_engine_id',
  braveApiKey: 'federation_brave_search_api_key',
} as const;

export type FederationGoogleImageSearchConfig = {
  googleApiKey: string;
  googleSearchEngineId: string;
};

export type FederationImageSearchConfigSource = 'database' | 'environment' | 'unset';

export type FederationImageSearchRuntime =
  | {
      provider: FederationImageSearchProvider;
      source: FederationImageSearchConfigSource;
      google?: FederationGoogleImageSearchConfig;
      braveSubscriptionToken?: string;
    }
  | { provider: null; source: 'unset' };

const UUID_LIKE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseProvider(raw: string | null | undefined): FederationImageSearchProvider {
  return String(raw || '').trim().toLowerCase() === 'brave' ? 'brave' : 'google';
}

/** Programmable Search Engine ID (`cx`) — not a Firebase / GCP project ID. */
export function normalizeFederationSearchEngineId(raw: string): string {
  const trimmed = String(raw || '').trim();
  if (!trimmed) return '';
  const cxFromUrl = trimmed.match(/[?&]cx=([^&]+)/i)?.[1];
  if (cxFromUrl?.trim()) return decodeURIComponent(cxFromUrl.trim());
  return trimmed;
}

export function validateFederationImageSearchCredentials(input: {
  provider?: FederationImageSearchProvider;
  apiKey?: string;
  searchEngineId?: string;
  braveApiKey?: string;
}): { ok: true } | { ok: false; message: string } {
  if (input.provider === 'brave') {
    if (input.braveApiKey !== undefined && input.braveApiKey.trim()) {
      const token = input.braveApiKey.trim();
      if (token.length < 20) {
        return {
          ok: false,
          message: 'Brave Search API key looks too short. Paste the subscription token from the Brave Search API dashboard.',
        };
      }
    }
    return { ok: true };
  }

  if (input.apiKey !== undefined && input.apiKey.trim()) {
    const key = input.apiKey.trim();
    if (!key.startsWith('AIza')) {
      return {
        ok: false,
        message:
          'API key should be a Google API key (starts with AIza). Use the key from Google Cloud Console with Custom Search API enabled — not a Firebase project ID.',
      };
    }
  }

  if (input.searchEngineId !== undefined) {
    const cx = normalizeFederationSearchEngineId(input.searchEngineId);
    if (!cx) {
      return { ok: false, message: 'Search Engine ID (cx) is required.' };
    }
    if (UUID_LIKE.test(cx)) {
      return {
        ok: false,
        message:
          'That value looks like a project or app UUID, not a Programmable Search Engine ID (cx). In Google Programmable Search Engine, open your search engine → Setup → copy the Search engine ID (cx), usually a short alphanumeric string without dashes.',
      };
    }
    if (cx.length < 8 || cx.length > 64) {
      return {
        ok: false,
        message: 'Search Engine ID (cx) does not look valid. Copy it from Programmable Search Engine → Setup.',
      };
    }
  }

  return { ok: true };
}

async function getProviderFromDb(): Promise<FederationImageSearchProvider | null> {
  const fromDb = await SystemConfig.getConfig<string>(FederationImageSearchConfigKeys.provider, null);
  if (!fromDb?.trim()) return null;
  return parseProvider(fromDb);
}

async function getGoogleApiKeyFromDb(): Promise<string | null> {
  const fromDb = await SystemConfig.getConfig<string>(FederationImageSearchConfigKeys.apiKey, null);
  if (fromDb?.trim()) return fromDb.trim();
  return null;
}

async function getSearchEngineIdFromDb(): Promise<string | null> {
  const fromDb = await SystemConfig.getConfig<string>(FederationImageSearchConfigKeys.searchEngineId, null);
  if (fromDb?.trim()) return fromDb.trim();
  return null;
}

async function getBraveApiKeyFromDb(): Promise<string | null> {
  const fromDb = await SystemConfig.getConfig<string>(FederationImageSearchConfigKeys.braveApiKey, null);
  if (fromDb?.trim()) return fromDb.trim();
  return null;
}

function getGoogleApiKeyFromEnv(): string | null {
  return (
    process.env.GOOGLE_API_KEY?.trim() ||
    process.env.GOOGLE_IMAGE_API_KEY?.trim() ||
    null
  );
}

function getSearchEngineIdFromEnv(): string | null {
  return process.env.GOOGLE_SEARCH_ENGINE_ID?.trim() || null;
}

function getBraveApiKeyFromEnv(): string | null {
  return (
    process.env.BRAVE_SEARCH_API_KEY?.trim() ||
    process.env.BRAVE_SUBSCRIPTION_TOKEN?.trim() ||
    null
  );
}

function getProviderFromEnv(): FederationImageSearchProvider | null {
  const raw = process.env.FEDERATION_IMAGE_SEARCH_PROVIDER?.trim();
  if (!raw) return null;
  return parseProvider(raw);
}

/** @deprecated Use resolveFederationImageSearchRuntime */
export async function resolveFederationGoogleImageSearchConfig(): Promise<{
  config: FederationGoogleImageSearchConfig | null;
  source: FederationImageSearchConfigSource;
}> {
  const runtime = await resolveFederationImageSearchRuntime();
  if (runtime.provider !== 'google' || !runtime.google) {
    return { config: null, source: runtime.source };
  }
  return { config: runtime.google, source: runtime.source };
}

export async function resolveFederationImageSearchRuntime(): Promise<FederationImageSearchRuntime> {
  const [dbProvider, envProvider] = await Promise.all([
    getProviderFromDb(),
    Promise.resolve(getProviderFromEnv()),
  ]);
  const provider = dbProvider || envProvider || 'google';

  if (provider === 'brave') {
    const dbToken = await getBraveApiKeyFromDb();
    const envToken = getBraveApiKeyFromEnv();
    const braveSubscriptionToken = dbToken || envToken;
    if (!braveSubscriptionToken) {
      return { provider: null, source: 'unset' };
    }
    const source: FederationImageSearchConfigSource =
      dbToken && envToken ? (dbToken === braveSubscriptionToken ? 'database' : 'environment') : dbToken
        ? 'database'
        : 'environment';
    return { provider: 'brave', source, braveSubscriptionToken };
  }

  const dbKey = await getGoogleApiKeyFromDb();
  const dbCx = await getSearchEngineIdFromDb();
  const envKey = getGoogleApiKeyFromEnv();
  const envCx = getSearchEngineIdFromEnv();
  const googleApiKey = dbKey || envKey;
  const googleSearchEngineId = dbCx || envCx;

  if (googleApiKey && googleSearchEngineId) {
    const source: FederationImageSearchConfigSource =
      dbKey && dbCx ? 'database' : envKey && envCx ? 'environment' : dbKey || dbCx ? 'database' : 'environment';
    return {
      provider: 'google',
      source,
      google: { googleApiKey, googleSearchEngineId },
    };
  }

  return { provider: null, source: 'unset' };
}

export async function saveFederationImageSearchSettings(input: {
  provider?: FederationImageSearchProvider;
  apiKey?: string;
  searchEngineId?: string;
  braveApiKey?: string;
}) {
  const provider = input.provider ?? (await getProviderFromDb()) ?? 'google';
  const validation = validateFederationImageSearchCredentials({ ...input, provider });
  if (!validation.ok) {
    throw new Error(validation.message);
  }

  if (input.provider !== undefined) {
    await SystemConfig.setConfig(
      FederationImageSearchConfigKeys.provider,
      provider,
      'string',
      'integrations',
    );
  }

  if (input.searchEngineId !== undefined) {
    const cx = normalizeFederationSearchEngineId(input.searchEngineId);
    await SystemConfig.setConfig(
      FederationImageSearchConfigKeys.searchEngineId,
      cx,
      'string',
      'integrations',
    );
  }
  if (input.apiKey !== undefined && input.apiKey.trim()) {
    await SystemConfig.setConfig(
      FederationImageSearchConfigKeys.apiKey,
      input.apiKey.trim(),
      'string',
      'integrations',
    );
  }
  if (input.braveApiKey !== undefined && input.braveApiKey.trim()) {
    await SystemConfig.setConfig(
      FederationImageSearchConfigKeys.braveApiKey,
      input.braveApiKey.trim(),
      'string',
      'integrations',
    );
  }
}

export async function getFederationImageSearchSettingsForAdmin() {
  const [dbProvider, dbKey, dbCx, dbBrave, envKey, envCx, envBrave, envProvider] = await Promise.all([
    getProviderFromDb(),
    getGoogleApiKeyFromDb(),
    getSearchEngineIdFromDb(),
    getBraveApiKeyFromDb(),
    Promise.resolve(getGoogleApiKeyFromEnv()),
    Promise.resolve(getSearchEngineIdFromEnv()),
    Promise.resolve(getBraveApiKeyFromEnv()),
    Promise.resolve(getProviderFromEnv()),
  ]);

  const provider = dbProvider || envProvider || 'google';
  const searchEngineId = dbCx || envCx || '';
  const googleApiKeyConfigured = Boolean(dbKey || envKey);
  const braveApiKeyConfigured = Boolean(dbBrave || envBrave);

  const searchEngineIdSource: 'database' | 'environment' | 'none' = dbCx
    ? 'database'
    : envCx
      ? 'environment'
      : 'none';
  const googleApiKeySource: 'database' | 'environment' | 'none' = dbKey
    ? 'database'
    : envKey
      ? 'environment'
      : 'none';
  const braveApiKeySource: 'database' | 'environment' | 'none' = dbBrave
    ? 'database'
    : envBrave
      ? 'environment'
      : 'none';

  const googleReady = Boolean((dbKey || envKey) && (dbCx || envCx));
  const braveReady = Boolean(dbBrave || envBrave);
  const ready = provider === 'brave' ? braveReady : googleReady;

  return {
    provider,
    apiKeyConfigured: googleApiKeyConfigured,
    apiKeySource: googleApiKeySource,
    searchEngineId,
    searchEngineIdSource,
    braveApiKeyConfigured,
    braveApiKeySource,
    envOverride: Boolean(envKey || envCx || envBrave || envProvider),
    ready,
  };
}
