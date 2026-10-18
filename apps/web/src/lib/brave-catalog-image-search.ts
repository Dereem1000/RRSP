import https from 'https';
import { stripBarcodeTokensFromImageSearchQuery } from '@/lib/catalog-image-search-query';
import type { CatalogImageSearchOption } from '@/lib/pos-catalog-image-search';

type BraveImageResult = {
  title?: string;
  url?: string;
  source?: string;
  thumbnail?: { src?: string; width?: number; height?: number };
  properties?: { url?: string; width?: number; height?: number };
};

function httpsGetJson(
  url: string,
  headers: Record<string, string>,
  timeoutMs: number,
): Promise<{ statusCode: number; payload: unknown }> {
  return new Promise((resolve, reject) => {
    const req = https.request(url, { method: 'GET', headers }, (res) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        let payload: unknown = null;
        try {
          payload = JSON.parse(text);
        } catch {
          payload = { raw: text };
        }
        resolve({ statusCode: res.statusCode || 0, payload });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Brave image search timed out'));
    });
    req.end();
  });
}

function rankBraveResult(item: BraveImageResult): CatalogImageSearchOption & { priority: number } {
  const title = (item.title || '').toLowerCase();
  const link = String(item.properties?.url || item.url || '').toLowerCase();
  const source = (item.source || '').toLowerCase();

  const isTTImage =
    title.includes('trinidad') ||
    title.includes('tobago') ||
    link.includes('trinidad') ||
    link.includes('tobago') ||
    link.includes('.tt') ||
    source.includes('trinidad');

  let priority = 0;
  if (isTTImage) priority += 10;

  const url = String(item.properties?.url || item.url || '').trim();
  const thumbnail = String(item.thumbnail?.src || url).trim();

  return {
    url,
    thumbnail,
    title: item.title,
    snippet: item.source,
    width: item.properties?.width ?? item.thumbnail?.width,
    height: item.properties?.height ?? item.thumbnail?.height,
    priority,
  };
}

export async function searchBraveCatalogImageOptions(
  query: string,
  subscriptionToken: string,
): Promise<{ images: CatalogImageSearchOption[]; quotaExceeded: boolean; apiError?: string }> {
  const cleanQuery = stripBarcodeTokensFromImageSearchQuery(query.trim().replace(/\s+/g, ' '));
  if (!cleanQuery) {
    return { images: [], quotaExceeded: false };
  }

  async function runSearch(q: string): Promise<{
    images: CatalogImageSearchOption[];
    quotaExceeded: boolean;
    apiError?: string;
  }> {
    const params = new URLSearchParams({
      q,
      count: '10',
      safesearch: 'strict',
      country: 'ALL',
      search_lang: 'en',
    });
    const url = `https://api.search.brave.com/res/v1/images/search?${params.toString()}`;

    let statusCode: number;
    let payload: {
      results?: BraveImageResult[];
      message?: string;
      error?: { message?: string; detail?: string; status?: number };
    };

    try {
      const res = await httpsGetJson(
        url,
        {
          Accept: 'application/json',
          'X-Subscription-Token': subscriptionToken,
        },
        25_000,
      );
      statusCode = res.statusCode;
      payload = (res.payload || {}) as typeof payload;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return { images: [], quotaExceeded: false, apiError: `Brave image search failed: ${message}` };
    }

    if (statusCode === 429) {
      return { images: [], quotaExceeded: true };
    }

    if (statusCode === 401 || statusCode === 403) {
      return {
        images: [],
        quotaExceeded: false,
        apiError:
          payload.message ||
          payload.error?.message ||
          'Brave Search API rejected the subscription token. Check Settings → Integrations.',
      };
    }

    if (statusCode < 200 || statusCode >= 300) {
      return {
        images: [],
        quotaExceeded: false,
        apiError:
          payload.error?.detail ||
          payload.message ||
          payload.error?.message ||
          `Brave image search returned HTTP ${statusCode}`,
      };
    }

    const ranked = (payload.results || [])
      .map((item) => rankBraveResult(item))
      .filter((row) => Boolean(row.url))
      .sort((a, b) => b.priority - a.priority)
      .map(({ priority: _p, ...rest }) => rest);

    return { images: ranked, quotaExceeded: false };
  }

  let result = await runSearch(cleanQuery);
  if (result.quotaExceeded || result.apiError) return result;
  if (result.images.length > 0) return result;

  result = await runSearch(`${cleanQuery} product`);
  return result;
}
