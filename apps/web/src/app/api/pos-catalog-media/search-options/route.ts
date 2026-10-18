import { NextRequest, NextResponse } from 'next/server';
import { AuthError, authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import {
  buildPosStyleImageSearchQuery,
  stripBarcodeTokensFromImageSearchQuery,
} from '@/lib/catalog-image-search-query';
import { searchBraveCatalogImageOptions } from '@/lib/brave-catalog-image-search';
import {
  getFederationImageSearchRuntime,
  searchGoogleCatalogImageOptions,
} from '@/lib/pos-catalog-image-search';

export const runtime = 'nodejs';

/** Online image search for federation catalog (Google Custom Search or Brave Image Search). */
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

    const runtime = await getFederationImageSearchRuntime();
    const configSource = runtime.source;
    const provider = runtime.provider;

    if (!provider) {
      return NextResponse.json(
        {
          success: false,
          message:
            'Federation image search is not configured. Open Settings → Integrations → Federation image search and choose Google or Brave, then save credentials.',
          configSource,
        },
        { status: 503 },
      );
    }

    const result =
      provider === 'brave'
        ? await searchBraveCatalogImageOptions(query, runtime.braveSubscriptionToken || '')
        : await searchGoogleCatalogImageOptions(query, runtime.google!);

    if (result.apiError) {
      let message = result.apiError;
      if (provider === 'google' && /invalid argument/i.test(message)) {
        message +=
          ' Check Settings → Integrations: Search Engine ID must be the Programmable Search cx value (not a Firebase or GCP project UUID).';
      }
      return NextResponse.json(
        { success: false, message, configSource, provider },
        { status: 502 },
      );
    }

    if (result.quotaExceeded) {
      return NextResponse.json(
        {
          success: false,
          quotaExceeded: true,
          message: `${provider === 'brave' ? 'Brave' : 'Google'} image search quota exceeded. Try again later or upload an image file.`,
          provider,
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
          provider,
        },
        { status: 404 },
      );
    }

    return NextResponse.json({
      success: true,
      images: result.images,
      configSource,
      provider,
    });
  } catch (error) {
    if (error instanceof AuthError) return authErrorResponse(error);
    console.error('[pos-catalog-media/search-options]', error);
    const message = error instanceof Error ? error.message : 'Image search failed';
    return NextResponse.json({ success: false, message }, { status: 500 });
  }
}
