/** Google Custom Search image API — same approach as POS `searchGoogleImageOptions`. */

import https from 'https';
import { stripBarcodeTokensFromImageSearchQuery } from '@/lib/catalog-image-search-query';
import {
  POS_BUILTIN_GOOGLE_IMAGE_API_KEY,
  POS_BUILTIN_GOOGLE_SEARCH_ENGINE_ID,
} from '@/lib/pos-google-image-search-defaults';

/**
 * CD federation catalog (no POS process required):
 * 1. Env `GOOGLE_API_KEY` + `GOOGLE_SEARCH_ENGINE_ID` (both required to override)
 * 2. Built-in defaults from POS `docs/IMAGE_SEARCH_SETUP.md` (same as POS Inventory)
 */
export type CatalogImageSearchOption = {
  url: string;
  thumbnail: string;
  title?: string;
  snippet?: string;
  width?: number;
  height?: number;
};

export type GoogleImageSearchConfig = {
  googleApiKey: string;
  googleSearchEngineId: string;
};

export type GoogleImageSearchConfigSource = 'environment' | 'pos_builtin';

export function getBuiltinGoogleImageSearchConfig(): GoogleImageSearchConfig {
  return {
    googleApiKey: POS_BUILTIN_GOOGLE_IMAGE_API_KEY,
    googleSearchEngineId: POS_BUILTIN_GOOGLE_SEARCH_ENGINE_ID,
  };
}

export function getGoogleImageSearchConfig(): {
  config: GoogleImageSearchConfig;
  source: GoogleImageSearchConfigSource;
} {
  const googleApiKey = String(process.env.GOOGLE_API_KEY || process.env.GOOGLE_IMAGE_API_KEY || '').trim();
  const googleSearchEngineId = String(process.env.GOOGLE_SEARCH_ENGINE_ID || '').trim();

  if (googleApiKey && googleSearchEngineId) {
    return {
      config: { googleApiKey, googleSearchEngineId },
      source: 'environment',
    };
  }

  return { config: getBuiltinGoogleImageSearchConfig(), source: 'pos_builtin' };
}

function rankImageItem(item: {
  title?: string;
  snippet?: string;
  link?: string;
  image?: { thumbnailLink?: string; contextLink?: string; width?: number; height?: number };
}): CatalogImageSearchOption & { priority: number } {
  const title = (item.title || '').toLowerCase();
  const snippet = (item.snippet || '').toLowerCase();
  const link = (item.link || '').toLowerCase();

  const isTTImage =
    title.includes('trinidad') ||
    title.includes('tobago') ||
    snippet.includes('trinidad') ||
    snippet.includes('tobago') ||
    link.includes('trinidad') ||
    link.includes('tobago') ||
    link.includes('.tt');

  const isWholesale =
    title.includes('wholesale') ||
    snippet.includes('wholesale') ||
    title.includes('distribution') ||
    snippet.includes('distribution') ||
    link.includes('wholesale') ||
    link.includes('distribution');

  const isCaribbean = title.includes('caribbean') || snippet.includes('caribbean');

  let priority = 0;
  if (isTTImage) priority += 10;
  if (isWholesale) priority += 5;
  if (isCaribbean) priority += 3;

  const url = String(item.link || '').trim();
  return {
    url,
    thumbnail: item.image?.thumbnailLink || item.link || '',
    title: item.title,
    snippet: item.snippet,
    width: item.image?.width,
    height: item.image?.height,
    priority,
  };
}

/** Same query string as POS `searchGoogleImageOptions` in `server/index.js`. */
const POS_GOOGLE_IMAGE_SEARCH_QUERY_SUFFIX =
  '&searchType=image&num=10&safe=active&fileType=jpg&imgSize=medium';

function httpsGetText(url: string, timeoutMs: number): Promise<{ statusCode: number; text: string }> {
  return new Promise((resolve, reject) => {
    const req = https.get(url, (res) => {
      let text = '';
      res.on('data', (chunk) => {
        text += chunk;
      });
      res.on('end', () => {
        resolve({ statusCode: res.statusCode || 0, text });
      });
    });
    req.on('error', reject);
    req.setTimeout(timeoutMs, () => {
      req.destroy();
      reject(new Error('Google image search timed out'));
    });
  });
}

export async function searchGoogleCatalogImageOptions(
  query: string,
  config: GoogleImageSearchConfig,
): Promise<{ images: CatalogImageSearchOption[]; quotaExceeded: boolean; apiError?: string }> {
  const cleanQuery = stripBarcodeTokensFromImageSearchQuery(query.trim().replace(/\s+/g, ' '));
  if (!cleanQuery) {
    return { images: [], quotaExceeded: false };
  }

  async function runSearch(q: string, suffix: string): Promise<{
    images: CatalogImageSearchOption[];
    quotaExceeded: boolean;
    apiError?: string;
  }> {
    const encodedQuery = encodeURIComponent(q);
    const url = `https://www.googleapis.com/customsearch/v1?key=${config.googleApiKey}&cx=${config.googleSearchEngineId}&q=${encodedQuery}${suffix}`;

    let statusCode: number;
    let text: string;
    try {
      const res = await httpsGetText(url, 25_000);
      statusCode = res.statusCode;
      text = res.text;
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Network error';
      return { images: [], quotaExceeded: false, apiError: `Google image search failed: ${message}` };
    }

    if (statusCode === 429) {
      return { images: [], quotaExceeded: true };
    }

    let payload: {
      items?: Array<Record<string, unknown>>;
      error?: { message?: string; errors?: Array<{ reason?: string }> };
    };
    try {
      payload = JSON.parse(text) as typeof payload;
    } catch {
      return { images: [], quotaExceeded: false, apiError: 'Invalid response from Google image search' };
    }

    const reason = payload.error?.errors?.[0]?.reason || '';
    if (
      reason === 'dailyLimitExceeded' ||
      reason === 'quotaExceeded' ||
      reason === 'userRateLimitExceeded'
    ) {
      return { images: [], quotaExceeded: true };
    }

    if (payload.error?.message) {
      return { images: [], quotaExceeded: false, apiError: payload.error.message };
    }

    if (statusCode < 200 || statusCode >= 300 || !Array.isArray(payload.items)) {
      return { images: [], quotaExceeded: false };
    }

    const ranked = payload.items
      .map((item) => rankImageItem(item as Parameters<typeof rankImageItem>[0]))
      .filter((row) => Boolean(row.url))
      .sort((a, b) => b.priority - a.priority)
      .map(({ priority: _p, ...rest }) => rest);

    return { images: ranked, quotaExceeded: false };
  }

  // Match POS `/api/search-image-options`: primary query, then append " product".
  let result = await runSearch(cleanQuery, POS_GOOGLE_IMAGE_SEARCH_QUERY_SUFFIX);
  if (result.quotaExceeded || result.apiError) return result;
  if (result.images.length > 0) return result;

  result = await runSearch(`${cleanQuery} product`, POS_GOOGLE_IMAGE_SEARCH_QUERY_SUFFIX);
  return result;
}
