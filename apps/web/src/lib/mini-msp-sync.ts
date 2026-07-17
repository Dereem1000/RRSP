import { createHash } from 'crypto';
import {
  getDefaultMspApiUrl,
  getMspSyncToken,
  getMspSyncTokenSettings,
  maskMspSyncToken,
} from '@/lib/msp-sync-token';
import { getMiniDockSettings, isMiniDockConfigured, miniProxyRequest } from '@/lib/mini-dock';

export type MiniMspSyncStatus = {
  docked: boolean;
  miniReachable: boolean;
  portalConfigured: boolean;
  portalTokenPreview: string | null;
  portalTokenFingerprint: string | null;
  portalMspApiUrl: string;
  miniConfigured: boolean;
  miniTokenPreview: string | null;
  miniTokenFingerprint: string | null;
  miniMspApiUrl: string | null;
  inSync: boolean;
  lastSyncedAt: string | null;
  message: string;
};

export function mspTokenFingerprint(token: string | null | undefined): string | null {
  const trimmed = String(token || '').trim();
  if (!trimmed) return null;
  return createHash('sha256').update(trimmed).digest('hex').slice(0, 16);
}

type MiniMspSyncStatusResponse = {
  ok?: boolean;
  cd_msp_sync?: {
    configured?: boolean;
    msp_api_url?: string | null;
    token_preview?: string | null;
    token_fingerprint?: string | null;
    synced_at?: string | null;
  };
  error?: string;
};

export async function getMiniMspSyncStatus(): Promise<MiniMspSyncStatus> {
  const [portalSettings, token, dock] = await Promise.all([
    getMspSyncTokenSettings(),
    getMspSyncToken(),
    getMiniDockSettings(),
  ]);

  const portalConfigured = Boolean(token);
  const portalMspApiUrl = portalSettings.mspApiUrl || getDefaultMspApiUrl();
  const portalTokenFingerprint = mspTokenFingerprint(token);

  if (!dock.docked) {
    return {
      docked: false,
      miniReachable: false,
      portalConfigured,
      portalTokenPreview: portalSettings.tokenPreview,
      portalTokenFingerprint,
      portalMspApiUrl,
      miniConfigured: false,
      miniTokenPreview: null,
      miniTokenFingerprint: null,
      miniMspApiUrl: null,
      inSync: false,
      lastSyncedAt: null,
      message: 'Mini is not docked. Configure Mini in Settings → Integrations before syncing the MSP token.',
    };
  }

  const miniStatus = await miniProxyRequest('/api/cd/msp-sync/status', { method: 'GET' }, { timeoutMs: 12_000 });
  const body = (miniStatus.body || {}) as MiniMspSyncStatusResponse;
  const miniSync = body.cd_msp_sync || {};
  const miniConfigured = Boolean(miniSync.configured);
  const miniTokenFingerprint = miniSync.token_fingerprint ?? null;
  const miniReachable = miniStatus.ok;
  const inSync = Boolean(
    portalConfigured &&
      miniConfigured &&
      portalTokenFingerprint &&
      miniTokenFingerprint &&
      portalTokenFingerprint === miniTokenFingerprint
  );

  let message = 'License sync token matches on CD portal and Mini.';
  if (!portalConfigured) {
    message = 'Configure the MSP sync token in CD portal Settings → Integrations.';
  } else if (!miniReachable) {
    message = 'Mini is docked but not reachable. Check the local Mini URL and API token.';
  } else if (!miniConfigured) {
    message = 'Mini does not have the CD MSP token yet. Click Sync to Mini in Settings → Integrations.';
  } else if (!inSync) {
    message =
      'Mini is out of sync with the portal MSP token. Open Settings → Integrations and click Sync to Mini.';
  }

  return {
    docked: true,
    miniReachable,
    portalConfigured,
    portalTokenPreview: portalSettings.tokenPreview,
    portalTokenFingerprint,
    portalMspApiUrl,
    miniConfigured,
    miniTokenPreview: miniSync.token_preview ?? null,
    miniTokenFingerprint,
    miniMspApiUrl: miniSync.msp_api_url ?? null,
    inSync,
    lastSyncedAt: miniSync.synced_at ?? null,
    message,
  };
}

export async function syncMspTokenToMini(): Promise<{
  success: boolean;
  message: string;
  miniSync?: MiniMspSyncStatus;
  tokenPreview?: string;
}> {
  const token = await getMspSyncToken();
  if (!token) {
    return {
      success: false,
      message: 'Configure the MSP sync token in Settings → Integrations before syncing to Mini.',
    };
  }

  const portalSettings = await getMspSyncTokenSettings();
  const mspApiUrl = portalSettings.mspApiUrl || getDefaultMspApiUrl();
  const dock = await getMiniDockSettings();
  if (!dock.docked) {
    return {
      success: false,
      message: 'Mini is not docked. Configure Mini in Settings → Integrations first.',
    };
  }

  const result = await miniProxyRequest(
    '/api/cd/msp-sync',
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        msp_api_url: mspApiUrl,
        msp_api_token: token,
        source: 'cd_portal_settings',
      }),
    },
    { timeoutMs: 20_000 }
  );

  const body = (result.body || {}) as { ok?: boolean; error?: string; token_preview?: string };
  if (!result.ok || !body.ok) {
    const error =
      typeof body.error === 'string'
        ? body.error
        : typeof (result.body as { error?: string })?.error === 'string'
          ? (result.body as { error: string }).error
          : 'Mini sync failed';
    return { success: false, message: error };
  }

  const miniSync = await getMiniMspSyncStatus();
  return {
    success: true,
    message: miniSync.inSync
      ? 'MSP sync token pushed to Mini. Project Guard can now deactivate licenses on baseline tamper.'
      : 'Token sent to Mini, but fingerprints still differ. Retry sync or check Mini runtime/local.env.',
    miniSync,
    tokenPreview: body.token_preview || maskMspSyncToken(token),
  };
}

export async function isMiniMspSyncConfigured(): Promise<boolean> {
  if (!(await isMiniDockConfigured())) return false;
  const status = await getMiniMspSyncStatus();
  return status.inSync;
}
