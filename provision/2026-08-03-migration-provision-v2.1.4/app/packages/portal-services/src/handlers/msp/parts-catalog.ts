// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import { authErrorResult, requireRole, requireSession } from '@cd-v2/api-handlers';
import {
  getPartsCatalogMarkupPercent,
  listCatalogItems,
  listInventoryForClient,
  listPartRequestsForViewer,
  resolvePartsBuyerAddress,
  resolveStockOwnerForViewer,
  stripIncomingForClientSupplier,
  toPublicCatalogItem,
  withBuyerDistances,
  withListedUnitPrice,
  withStaffFulfillmentRoutes,
} from '@web/lib/parts-catalog';
import { attachPackageBillingToRequests } from '@web/lib/parts-billing';
import { getCompanySettings } from '@web/lib/company-settings';

function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

function buyerFacingRequest(request: {
  unitPrice: number;
  listedUnitPrice: number;
  [key: string]: unknown;
}) {
  return {
    ...request,
    // Buyers see the marketplace listed price only (no CD % breakdown).
    unitPrice: request.listedUnitPrice,
    listedUnitPrice: request.listedUnitPrice,
  };
}

export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin', 'technician', 'client');

    const params = searchParamsFrom(ctx);
    const search = params.get('search') ?? '';
    const lite = params.get('lite') === '1' || params.get('lite') === 'true';
    const stockOwner = await resolveStockOwnerForViewer(session.role, session.id);
    const markupPercent = await getPartsCatalogMarkupPercent();
    const excludeOwnClientId = stockOwner?.id ? String(stockOwner.id) : null;

    const [catalog, myInventory, requests, buyerAddress] = await Promise.all([
      lite
        ? Promise.resolve([])
        : listCatalogItems({ search, excludeClientId: excludeOwnClientId }),
      stockOwner ? listInventoryForClient(stockOwner.id) : Promise.resolve([]),
      listPartRequestsForViewer({
        role: session.role,
        userId: session.id,
        clientId: stockOwner?.id ?? null,
      }),
      lite ? Promise.resolve(null) : resolvePartsBuyerAddress(session.role, session.id),
    ]);

    const pricedCatalog = catalog.map((item) => toPublicCatalogItem(item, markupPercent));
    const catalogWithDistances = lite
      ? pricedCatalog
      : await withBuyerDistances(pricedCatalog, buyerAddress);

    const isCdStaff = session.role === 'admin' || session.role === 'technician';

    // Clients never see seller identity. CD staff always get real seller + location.
    // Double-filter own stock in case any row slipped through.
    const publicCatalog = catalogWithDistances
      .map((item) => {
        const listings = item.listings
          .filter(
            (listing) =>
              !excludeOwnClientId || String(listing.clientId) !== excludeOwnClientId
          )
          .map((listing) => {
            if (!isCdStaff) {
              return {
                ...listing,
                supplierName: 'Platform partner',
                supplierAddress: undefined,
                supplierStreetAddress: undefined,
                supplierLatitude: undefined,
                supplierLongitude: undefined,
                supplierMapEmbedUrl: undefined,
                supplierMapUrl: undefined,
              };
            }
            const sellerName =
              typeof listing.supplierName === 'string' && listing.supplierName.trim()
                ? listing.supplierName.trim()
                : 'Unknown seller';
            const street =
              typeof listing.supplierStreetAddress === 'string' &&
              listing.supplierStreetAddress.trim()
                ? listing.supplierStreetAddress.trim()
                : null;
            let lat =
              listing.supplierLatitude == null ? null : Number(listing.supplierLatitude);
            let lon =
              listing.supplierLongitude == null ? null : Number(listing.supplierLongitude);
            if (
              (lat == null || lon == null || !Number.isFinite(lat) || !Number.isFinite(lon)) &&
              typeof listing.supplierAddress === 'string'
            ) {
              const m = listing.supplierAddress
                .trim()
                .match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
              if (m) {
                lat = Number(m[1]);
                lon = Number(m[2]);
              }
            }
            const hasPin =
              lat != null && lon != null && Number.isFinite(lat) && Number.isFinite(lon);
            // Show street address to staff — never raw lat,lon as the label.
            const displayAddress = street || (hasPin ? 'Pinned map location' : null);
            const supplierMapEmbedUrl = hasPin
              ? `https://maps.google.com/maps?q=${lat},${lon}&z=16&output=embed`
              : null;
            const supplierMapUrl = hasPin
              ? `https://www.google.com/maps?q=${lat},${lon}`
              : street
                ? `https://www.google.com/maps?q=${encodeURIComponent(street)}`
                : null;

            return {
              ...listing,
              supplierName: sellerName,
              supplierAddress: displayAddress,
              supplierStreetAddress: street,
              supplierLatitude: hasPin ? lat : null,
              supplierLongitude: hasPin ? lon : null,
              supplierMapEmbedUrl,
              supplierMapUrl,
            };
          });

        if (!listings.length) return null;

        const supplierIds = new Set(listings.map((listing) => listing.clientId));
        return {
          ...item,
          listings,
          totalAvailable: listings.reduce((sum, listing) => sum + listing.availableQuantity, 0),
          listingCount: listings.length,
          supplierCount: supplierIds.size,
          lowestPrice: Math.min(...listings.map((listing) => listing.unitPrice)),
          highestPrice: Math.max(...listings.map((listing) => listing.unitPrice)),
        };
      })
      .filter(Boolean);

    const publicOutgoing = (
      await attachPackageBillingToRequests(requests.outgoing)
    ).map((request) => ({
      ...buyerFacingRequest(request),
      supplierName: 'Platform routed',
      supplierClientId: '',
    }));

    let incoming = await attachPackageBillingToRequests(requests.incoming);
    if (lite) {
      incoming = stripIncomingForClientSupplier(incoming);
    } else if (isCdStaff) {
      const company = await getCompanySettings().catch(() => null);
      const originAddress = company?.companyAddress?.trim() || null;
      incoming = await withStaffFulfillmentRoutes(incoming, originAddress);
    } else {
      incoming = stripIncomingForClientSupplier(incoming);
    }

    return {
      status: 200,
      body: {
        success: true,
        viewer: {
          role: session.role,
          clientId: stockOwner?.id ?? null,
          businessName: stockOwner
            ? stockOwner.companyName || stockOwner.name
            : null,
          stockLabel: session.role === 'client' ? 'My Stock' : 'Our Stock',
          revealMarketplaceSellers: isCdStaff,
        },
        catalog: publicCatalog,
        myInventory: myInventory.map((listing) => withListedUnitPrice(listing, markupPercent)),
        requests: {
          outgoing: publicOutgoing,
          // Suppliers see their own unit price (what they entered), not the platform listed price.
          incoming,
        },
      },
    };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}
