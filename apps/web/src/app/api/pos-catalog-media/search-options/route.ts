import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  buildPosStyleImageSearchQuery,
  stripBarcodeTokensFromImageSearchQuery,
} from '@/lib/catalog-image-search-query';
import {
  getBuiltinGoogleImageSearchConfig,
  getGoogleImageSearchConfig,
  searchGoogleCatalogImageOptions,
} from '@/lib/pos-catalog-image-search';

export const runtime = 'nodejs';

/** Google image search for federation catalog (same Custom Search API as POS Inventory). */
export async function GET(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const name = String(req.nextUrl.searchParams.get('name') || '').trim();
    const brand = String(req.nextUrl.searchParams.get('brand') || '').trim();
    const size = String(req.nextUrl.searchParams.get('size') || '').trim();
    const supplier = String(req.nextUrl.searchParams.get('supplier') || '').trim();
    const legacyQuery = String(req.nextUrl.searchParams.get('query') || req.nextUrl.searchParams.get('q') || '').trim();

    const query =
      name || brand || size || supplier
        ? buildPosStyleImageSearchQuery({ name, brand, size, supplier })
        : stripBarcodeTokensFromImageSearchQuery(legacyQuery);

    if (!query) {
      return NextResponse.json(
        {
          success: false,
          message: 'Enter a product name before searching (same as POS Inventory: name, brand, size — not barcode).',
        },
        { status: 400 },
      );
    }

    const { config, source } = getGoogleImageSearchConfig();
    let result = await searchGoogleCatalogImageOptions(query, config);
    let configSource = source;

    const builtin = getBuiltinGoogleImageSearchConfig();
    const usingBuiltin =
      config.googleApiKey === builtin.googleApiKey && config.googleSearchEngineId === builtin.googleSearchEngineId;

    if (!result.images.length && !result.quotaExceeded && !result.apiError && !usingBuiltin) {
      const builtinResult = await searchGoogleCatalogImageOptions(query, builtin);
      if (builtinResult.images.length || builtinResult.apiError || builtinResult.quotaExceeded) {
        result = builtinResult;
        configSource = 'pos_builtin';
      }
    }

    if (result.apiError) {
      return NextResponse.json(
        { success: false, message: result.apiError, configSource },
        { status: 502 },
      );
    }

    if (result.quotaExceeded) {
      return NextResponse.json(
        {
          success: false,
          quotaExceeded: true,
          message: 'Google image search quota exceeded. Try again tomorrow or upload an image file.',
        },
        { status: 429 },
      );
    }

    if (!result.images.length) {
      return NextResponse.json(
        {
          success: false,
          message: 'No images found for this product. Try a shorter name or upload an image file.',
          configSource,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({ success: true, images: result.images, configSource });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error('[pos-catalog-media/search-options]', error);
    const message = error instanceof Error ? error.message : 'Image search failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
