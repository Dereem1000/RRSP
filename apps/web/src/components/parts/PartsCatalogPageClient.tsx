'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  AlertTriangle,
  Boxes,
  ExternalLink,
  Laptop,
  MapPin,
  Package,
  RefreshCw,
  ShieldCheck,
  ShoppingCart,
  Smartphone,
  Store,
  Trash2,
  Pencil,
  Plus,
  Video,
  X,
} from 'lucide-react';
import {
  MAX_PARTS_LISTING_IMAGES,
  PARTS_CATEGORY_LABELS,
  PARTS_CONDITION_LABELS,
  PARTS_ITEM_CONDITIONS,
  PARTS_LISTING_CATEGORIES,
  categoryRequiresVideoVerification,
  fulfillmentVerificationClear,
  listingImageFilesFromRow,
  normalizeItemCondition,
  normalizePartsCategory,
  parseListingImageFilesJson,
  partsCatalogMediaUrl,
  VERIFICATION_STATUS_LABELS,
  type PartsItemCondition,
  type PartsListingCategory,
  type PartsRequestVerificationStatus,
} from '@/lib/parts-catalog-categories';
import { StatCard } from '@/components/dashboard/StatCard';
import { useUrlTab } from '@/lib/use-url-tab';
import {
  PARTS_DATA_CHANGED_KEY,
  PARTS_DATA_REFRESH_EVENT,
  PARTS_REFRESH_BURST_DELAYS_MS,
} from '@/lib/parts-live-sync';

const PARTS_TABS = ['marketplace', 'my-stock', 'outgoing', 'incoming', 'history'] as const;
type PartsTab = (typeof PARTS_TABS)[number];

const ACTIVE_REQUEST_STATUSES = new Set([
  'pending',
  'cancel_requested',
  'pending_delivery',
  'out_for_delivery',
]);
const HISTORY_REQUEST_STATUSES = new Set(['cancelled', 'fulfilled']);

/** Dismissed incoming toasts stay hidden until this window elapses (if still unfulfilled). */
const INCOMING_TOAST_SNOOZE_MS = 24 * 60 * 60 * 1000;
const INCOMING_TOAST_SNOOZE_KEY = 'cd-parts-incoming-toast-snooze';
const OUTGOING_TOAST_SEEN_KEY = 'cd-parts-outgoing-delivery-toast-seen';
const CANCEL_TOAST_SNOOZE_KEY = 'cd-parts-cancel-request-toast-snooze';

type IncomingToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  buyerLabel: string;
  quantity: number;
};

type CancelRequestToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  buyerLabel: string;
  quantity: number;
};

type OutgoingDeliveryToast = {
  id: string;
  requestNumber: string;
  itemName: string;
  quantity: number;
  status: 'pending_delivery' | 'out_for_delivery';
  etaLabel: string | null;
  paymentRequired?: boolean;
};

type PartsPackageBilling = {
  deliveryPackageId: string;
  quoteId: string | null;
  invoiceId: string | null;
  billingStatus: 'none' | 'quoted' | 'awaiting_payment' | 'paid';
  quoteNumber: string | null;
  invoiceNumber: string | null;
  amountDue: number | null;
  paymentUnpaid: boolean;
  quoteStatus: string | null;
  invoiceStatus: string | null;
  codRequested?: boolean;
  codRequestedAt?: string | null;
};

function readIncomingToastSnooze(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(INCOMING_TOAST_SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const ts = Number(value);
      if (Number.isFinite(ts)) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function writeIncomingToastSnooze(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(INCOMING_TOAST_SNOOZE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function pruneIncomingToastSnooze(pendingIds: Set<string>) {
  const map = readIncomingToastSnooze();
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!pendingIds.has(id) || now - map[id] >= INCOMING_TOAST_SNOOZE_MS) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeIncomingToastSnooze(map);
  return map;
}

function isIncomingToastSnoozed(id: string, map: Record<string, number>) {
  const dismissedAt = map[id];
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < INCOMING_TOAST_SNOOZE_MS;
}

function snoozeIncomingToast(id: string) {
  const map = readIncomingToastSnooze();
  map[id] = Date.now();
  writeIncomingToastSnooze(map);
}

function clearIncomingToastSnooze(id: string) {
  const map = readIncomingToastSnooze();
  if (!(id in map)) return;
  delete map[id];
  writeIncomingToastSnooze(map);
}

function readCancelToastSnooze(): Record<string, number> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(CANCEL_TOAST_SNOOZE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, number> = {};
    for (const [id, value] of Object.entries(parsed)) {
      const ts = Number(value);
      if (Number.isFinite(ts)) out[id] = ts;
    }
    return out;
  } catch {
    return {};
  }
}

function writeCancelToastSnooze(map: Record<string, number>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(CANCEL_TOAST_SNOOZE_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function pruneCancelToastSnooze(activeIds: Set<string>) {
  const map = readCancelToastSnooze();
  const now = Date.now();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!activeIds.has(id) || now - map[id] >= INCOMING_TOAST_SNOOZE_MS) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeCancelToastSnooze(map);
  return map;
}

function isCancelToastSnoozed(id: string, map: Record<string, number>) {
  const dismissedAt = map[id];
  if (!dismissedAt) return false;
  return Date.now() - dismissedAt < INCOMING_TOAST_SNOOZE_MS;
}

function snoozeCancelToast(id: string) {
  const map = readCancelToastSnooze();
  map[id] = Date.now();
  writeCancelToastSnooze(map);
}

function clearCancelToastSnooze(id: string) {
  const map = readCancelToastSnooze();
  if (!(id in map)) return;
  delete map[id];
  writeCancelToastSnooze(map);
}

function readOutgoingToastSeen(): Record<string, string> {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(OUTGOING_TOAST_SEEN_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const out: Record<string, string> = {};
    for (const [id, value] of Object.entries(parsed)) {
      if (typeof value === 'string' && value.trim()) out[id] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function writeOutgoingToastSeen(map: Record<string, string>) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(OUTGOING_TOAST_SEEN_KEY, JSON.stringify(map));
  } catch {
    // ignore quota / private mode
  }
}

function markOutgoingToastSeen(id: string, status: string) {
  const map = readOutgoingToastSeen();
  map[id] = status;
  writeOutgoingToastSeen(map);
}

function pruneOutgoingToastSeen(activeIds: Set<string>) {
  const map = readOutgoingToastSeen();
  let changed = false;
  for (const id of Object.keys(map)) {
    if (!activeIds.has(id)) {
      delete map[id];
      changed = true;
    }
  }
  if (changed) writeOutgoingToastSeen(map);
  return map;
}

function formatRequestStatus(status: string) {
  return status.replace(/_/g, ' ');
}

function statusBadgeClass(status: string) {
  if (status === 'fulfilled') return 'bg-emerald-50 text-emerald-800';
  if (status === 'out_for_delivery') return 'bg-sky-50 text-sky-800';
  if (status === 'pending_delivery') return 'bg-indigo-50 text-indigo-800';
  if (status === 'cancelled' || status === 'cancel_requested') return 'bg-slate-100 text-slate-600';
  return 'bg-amber-50 text-amber-800';
}

type InventoryListing = {
  id: string;
  clientId: string;
  itemName: string;
  normalizedName: string;
  partNumber: string | null;
  brand: string | null;
  notes: string | null;
  unitPrice: number;
  listedUnitPrice?: number;
  quantity: number;
  availableQuantity: number;
  createdAt: string;
  updatedAt: string;
  supplierName: string;
  /** CD staff only — street address for display. */
  supplierAddress?: string | null;
  supplierStreetAddress?: string | null;
  supplierLatitude?: number | null;
  supplierLongitude?: number | null;
  supplierMapEmbedUrl?: string | null;
  supplierMapUrl?: string | null;
  distanceMeters?: number | null;
  distanceLabel?: string | null;
  travelMinutes?: number | null;
  category: PartsListingCategory;
  itemCondition: PartsItemCondition;
  imageFile: string | null;
  imageFiles: string[];
  verificationVideoFile: string | null;
  requiresVerification: boolean;
};

type CatalogItem = {
  normalizedName: string;
  itemName: string;
  category: PartsListingCategory;
  totalAvailable: number;
  supplierCount: number;
  listingCount: number;
  lowestPrice: number;
  highestPrice: number;
  listings: InventoryListing[];
};

type PartRequestFulfillmentRoute = {
  distanceMeters: number | null;
  travelMinutes: number | null;
  distanceLabel: string | null;
  fromAddress: string | null;
  toAddress: string | null;
  mapEmbedUrl: string | null;
  directionsUrl: string | null;
  approximate?: boolean;
  staffNotice?: string | null;
};

type PartRequestRouteEditor = {
  hidden: boolean;
  fromAddress: string;
  toAddress: string;
};

type PartRequestView = {
  id: string;
  requestNumber: string;
  itemName: string;
  requestedQuantity: number;
  unitPrice: number;
  /** Marketplace / client-facing price (supplier + markup) at request time. */
  listedUnitPrice?: number;
  status: string;
  notes: string | null;
  createdAt: string;
  updatedAt?: string;
  buyerDisplayName: string;
  buyerName: string | null;
  supplierName: string;
  fulfillmentRoute?: PartRequestFulfillmentRoute | null;
  routeEditor?: PartRequestRouteEditor | null;
  deliveryEtaMinutes?: number | null;
  deliveryEtaLabel?: string | null;
  pendingDeliveryAt?: string | null;
  pickedUpAt?: string | null;
  completedAt?: string | null;
  cancelRequestedAt?: string | null;
  cancelledAt?: string | null;
  deliveryFromAddress?: string | null;
  deliveryToAddress?: string | null;
  deliveryMapEmbedUrl?: string | null;
  deliveryDirectionsUrl?: string | null;
  deliveryPackageId?: string | null;
  deliveryDistanceMeters?: number | null;
  /** Line delivery charge (package fee on anchor; 0 when sharing). */
  deliveryFee?: number | null;
  billing?: PartsPackageBilling | null;
  itemCategory?: PartsListingCategory;
  requiresVerificationSnapshot?: boolean;
  verificationStatus?: PartsRequestVerificationStatus;
  verificationVideoFile?: string | null;
  verificationNotes?: string | null;
  verificationRequestedAt?: string | null;
};

type DashboardPayload = {
  viewer: {
    role: string;
    clientId: string | null;
    businessName: string | null;
    stockLabel?: string;
    /** When true, marketplace listings include real seller name/location (CD staff). */
    revealMarketplaceSellers?: boolean;
  };
  catalog: CatalogItem[];
  myInventory: InventoryListing[];
  requests: {
    outgoing: PartRequestView[];
    incoming: PartRequestView[];
  };
};

type StockFormState = {
  id: string | null;
  itemName: string;
  partNumber: string;
  brand: string;
  unitPrice: string;
  quantity: string;
  availableQuantity: string;
  notes: string;
  category: PartsListingCategory;
  itemCondition: PartsItemCondition;
  requiresVerification: boolean;
  imageFiles: string[];
  verificationVideoFile: string | null;
};

const emptyStockForm: StockFormState = {
  id: null,
  itemName: '',
  partNumber: '',
  brand: '',
  unitPrice: '0',
  quantity: '1',
  availableQuantity: '1',
  notes: '',
  category: 'mobile_parts',
  itemCondition: 'new',
  requiresVerification: false,
  imageFiles: [],
  verificationVideoFile: null,
};

type MarketplaceCategoryFilter = 'all' | PartsListingCategory;

function catalogItemKey(item: Pick<CatalogItem, 'normalizedName' | 'category'>) {
  return `${item.normalizedName}::${item.category}`;
}

function coerceInventoryListing(raw: InventoryListing): InventoryListing {
  const imageFiles = listingImageFilesFromRow(
    Array.isArray(raw.imageFiles)
      ? raw.imageFiles.length
        ? JSON.stringify(raw.imageFiles)
        : null
      : typeof raw.imageFiles === 'string'
        ? raw.imageFiles
        : null,
    raw.imageFile
  );
  return {
    ...raw,
    imageFiles,
    imageFile: imageFiles[0] ?? null,
    itemCondition: normalizeItemCondition(raw.itemCondition),
  };
}

function listingImageUrls(listing: Pick<InventoryListing, 'imageFiles' | 'imageFile'>) {
  const files = listing.imageFiles?.length
    ? listing.imageFiles
    : listing.imageFile
      ? [listing.imageFile]
      : typeof listing.imageFiles === 'string'
        ? parseListingImageFilesJson(listing.imageFiles)
        : [];
  return files
    .map((file) => partsCatalogMediaUrl(file, 'image'))
    .filter(Boolean) as string[];
}

function StockListingThumbnail({ urls, size = 'md' }: { urls: string[]; size?: 'sm' | 'md' }) {
  const src = urls[0];
  const box = size === 'sm' ? 'h-10 w-10' : 'h-14 w-14';
  const icon = size === 'sm' ? 'h-4 w-4' : 'h-5 w-5';
  return (
    <div
      className={`${box} shrink-0 overflow-hidden rounded-lg border border-slate-200 bg-slate-50`}
    >
      {src ? (
        <img src={src} alt="" className="h-full w-full object-cover" loading="lazy" />
      ) : (
        <div className="flex h-full w-full items-center justify-center text-slate-400">
          <Package className={icon} />
        </div>
      )}
    </div>
  );
}

function pickCatalogCoverImages(item: CatalogItem) {
  for (const listing of item.listings) {
    const urls = listingImageUrls(listing);
    if (urls.length) return urls;
  }
  return [];
}

function pickCatalogItemCondition(item: CatalogItem): PartsItemCondition | null {
  const listing = item.listings[0];
  return listing?.itemCondition ?? null;
}

function collectCatalogDetailImages(item: CatalogItem): string[] {
  const seen = new Set<string>();
  const urls: string[] = [];
  for (const listing of item.listings) {
    for (const url of listingImageUrls(listing)) {
      if (!seen.has(url)) {
        seen.add(url);
        urls.push(url);
      }
    }
  }
  return urls;
}

function catalogNeedsVerification(item: CatalogItem) {
  return item.listings.some((listing) => listing.requiresVerification);
}

function categoryIcon(category: PartsListingCategory) {
  if (category === 'laptop_parts') return Laptop;
  if (category === 'full_devices') return Package;
  return Smartphone;
}

function formatMoney(value: number) {
  return new Intl.NumberFormat('en-US', {
    style: 'currency',
    currency: 'USD',
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(Math.round(value || 0));
}

function formatDate(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

/** What the buyer paid / was quoted (listed price with markup). */
function clientUnitPrice(request: Pick<PartRequestView, 'unitPrice' | 'listedUnitPrice'>) {
  const listed = Number(request.listedUnitPrice);
  if (Number.isFinite(listed) && listed > 0) return listed;
  return Number(request.unitPrice) || 0;
}

function partsSubtotal(request: Pick<PartRequestView, 'requestedQuantity' | 'unitPrice' | 'listedUnitPrice'>) {
  return request.requestedQuantity * clientUnitPrice(request);
}

function lineDeliveryFee(request: Pick<PartRequestView, 'deliveryFee'>) {
  const fee = Number(request.deliveryFee);
  return Number.isFinite(fee) && fee > 0 ? fee : 0;
}

/** Prefer package fee rolled into the line; for shared $0 lines look across siblings. */
function deliveryFeeForDisplay(
  request: Pick<PartRequestView, 'deliveryFee' | 'deliveryPackageId' | 'id'>,
  siblings: Array<Pick<PartRequestView, 'id' | 'deliveryFee' | 'deliveryPackageId'>>
) {
  const own = lineDeliveryFee(request);
  if (own > 0) return own;
  const packageId = request.deliveryPackageId?.trim();
  if (!packageId) return 0;
  let max = 0;
  for (const sibling of siblings) {
    if (sibling.deliveryPackageId !== packageId) continue;
    max = Math.max(max, lineDeliveryFee(sibling));
  }
  return max;
}

function formatDistanceMeters(meters: number | null | undefined) {
  if (meters == null || !Number.isFinite(meters)) return null;
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toFixed(1)} km`;
}

type FulfillPreviewPayload = {
  thisDistanceMeters: number | null;
  deliveryEtaMinutes: number | null;
  deliveryEtaLabel: string | null;
  package: null | {
    id: string;
    maxDistanceMeters: number | null;
    deliveryFee: number;
    ageMinutes: number;
  };
  mode: 'new' | 'share';
  suggestedDeliveryFee: number | null;
};

type FulfillModalState = {
  requestId: string;
  requestNumber: string;
  itemName: string;
  /** Staff see route + fee; client suppliers only confirm ready for CD collection. */
  mode: 'staff' | 'client';
  loading: boolean;
  preview: FulfillPreviewPayload | null;
  deliveryFee: string;
  error: string;
};

type HistoryTimelineStep = {
  key: string;
  label: string;
  at: string;
};

function buildHistoryTimeline(request: PartRequestView): HistoryTimelineStep[] {
  const steps: HistoryTimelineStep[] = [
    { key: 'requested', label: 'Requested', at: request.createdAt },
  ];
  if (request.cancelRequestedAt) {
    steps.push({ key: 'cancel_requested', label: 'Cancel requested', at: request.cancelRequestedAt });
  }
  if (request.cancelledAt) {
    steps.push({ key: 'cancelled', label: 'Cancelled', at: request.cancelledAt });
    return steps;
  }
  if (request.pendingDeliveryAt) {
    steps.push({ key: 'pending_delivery', label: 'Ready for delivery', at: request.pendingDeliveryAt });
  }
  if (request.pickedUpAt) {
    steps.push({ key: 'picked_up', label: 'Out for delivery', at: request.pickedUpAt });
  }
  if (request.completedAt) {
    steps.push({ key: 'completed', label: 'Delivered / received', at: request.completedAt });
  } else if (request.status === 'fulfilled' && request.updatedAt) {
    // Legacy rows fulfilled before timestamps existed.
    steps.push({ key: 'completed', label: 'Delivered / received', at: request.updatedAt });
  }
  return steps;
}

async function parseResponse(res: Response) {
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    throw new Error(data.message || 'Request failed');
  }
  return data;
}

const PARTS_MODAL_BACKDROP =
  'fixed inset-0 z-[80] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:p-4';
const PARTS_MODAL_PANEL =
  'max-h-[min(92dvh,42rem)] w-full overflow-y-auto overscroll-contain rounded-t-2xl bg-white p-4 shadow-2xl sm:rounded-2xl sm:p-6';

export function PartsCatalogPageClient({
  canManageStock,
  stockTabLabel = 'My Stock',
  hidePageHeader = false,
}: {
  canManageStock: boolean;
  stockTabLabel?: string;
  /** Hide the built-in page title when the parent route already renders one (e.g. RRSP shop parts). */
  hidePageHeader?: boolean;
}) {
  const [data, setData] = useState<DashboardPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState('');
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [showViewOutgoing, setShowViewOutgoing] = useState(false);
  const [searchInput, setSearchInput] = useState('');
  const [search, setSearch] = useState('');
  const [marketplaceCategory, setMarketplaceCategory] = useState<MarketplaceCategoryFilter>('all');
  const [mediaUploading, setMediaUploading] = useState('');
  const [verificationUploadingId, setVerificationUploadingId] = useState<string | null>(null);
  const [marketplaceImageIndex, setMarketplaceImageIndex] = useState<Record<string, number>>({});
  const [stockSearchInput, setStockSearchInput] = useState('');
  const [stockSearch, setStockSearch] = useState('');
  const [stockForm, setStockForm] = useState<StockFormState>(emptyStockForm);
  const [stockModalOpen, setStockModalOpen] = useState(false);
  const [requestItem, setRequestItem] = useState<CatalogItem | null>(null);
  const [requestListing, setRequestListing] = useState<InventoryListing | null>(null);
  const [priceDetailItem, setPriceDetailItem] = useState<CatalogItem | null>(null);
  const [detailModalImageIndex, setDetailModalImageIndex] = useState(0);
  const [requestQuantity, setRequestQuantity] = useState('1');
  const [requestNotes, setRequestNotes] = useState('');
  const [tab, setTab] = useUrlTab(PARTS_TABS, 'marketplace');
  const [toasts, setToasts] = useState<IncomingToast[]>([]);
  const [cancelToasts, setCancelToasts] = useState<CancelRequestToast[]>([]);
  const [outgoingToasts, setOutgoingToasts] = useState<OutgoingDeliveryToast[]>([]);
  const [toastSnoozeEpoch, setToastSnoozeEpoch] = useState(0);
  const [routeEditId, setRouteEditId] = useState<string | null>(null);
  const [routeEditFrom, setRouteEditFrom] = useState('');
  const [routeEditTo, setRouteEditTo] = useState('');
  const [fulfillModal, setFulfillModal] = useState<FulfillModalState | null>(null);
  const [addToStockPrompt, setAddToStockPrompt] = useState<{
    request: PartRequestView;
    stockLabel: string;
    qty: number;
    price: number;
  } | null>(null);
  const [deliveryEditId, setDeliveryEditId] = useState<string | null>(null);
  const [deliveryEditFee, setDeliveryEditFee] = useState('');
  const [sellerMapListingId, setSellerMapListingId] = useState<string | null>(null);
  const stockItemNameRef = useRef<HTMLInputElement | null>(null);
  /** Bumps to cancel an in-flight post-change refresh burst. */
  const refreshBurstIdRef = useRef(0);
  const loadInFlightRef = useRef(false);

  const resolvedStockLabel = data?.viewer.stockLabel || stockTabLabel;

  const visibleTabs = useMemo(() => {
    const tabs: Array<{ key: PartsTab; label: string; count?: number }> = [
      { key: 'marketplace', label: 'Marketplace' },
      ...(canManageStock ? [{ key: 'my-stock' as const, label: resolvedStockLabel }] : []),
      { key: 'outgoing', label: 'Outgoing', count: undefined },
      ...(canManageStock ? [{ key: 'incoming' as const, label: 'Incoming' }] : []),
      { key: 'history', label: 'History', count: undefined },
    ];
    return tabs;
  }, [canManageStock, resolvedStockLabel]);

  useEffect(() => {
    if (!visibleTabs.some((item) => item.key === tab)) {
      setTab('marketplace');
    }
  }, [tab, visibleTabs, setTab]);

  const loadData = useCallback(async (options?: { silent?: boolean }) => {
    const silent = Boolean(options?.silent);
    if (silent && loadInFlightRef.current) return;
    if (!silent) {
      setLoading(true);
      setError('');
    }
    loadInFlightRef.current = true;
    try {
      const params = new URLSearchParams();
      if (search.trim()) params.set('search', search.trim());
      const res = await fetch(`/api/msp/parts-catalog?${params.toString()}`, {
        cache: 'no-store',
      });
      const payload = await parseResponse(res);
      const myInventory = Array.isArray(payload.myInventory)
        ? payload.myInventory.map((row: InventoryListing) => coerceInventoryListing(row))
        : [];
      setData({ ...payload, myInventory });
    } catch (err) {
      if (!silent) {
        setError(err instanceof Error ? err.message : 'Failed to load parts catalog');
      }
    } finally {
      loadInFlightRef.current = false;
      if (!silent) setLoading(false);
    }
  }, [search]);

  /**
   * After any parts button/mutation: refresh immediately, then a few short silent polls.
   * Also stamps localStorage so other tabs wake; server activity wakes CD/client portals.
   */
  const refreshAfterChange = useCallback(async () => {
    const burstId = ++refreshBurstIdRef.current;
    await loadData();
    try {
      window.localStorage.setItem(PARTS_DATA_CHANGED_KEY, String(Date.now()));
    } catch {
      // ignore quota / private mode
    }
    void (async () => {
      for (const delay of PARTS_REFRESH_BURST_DELAYS_MS) {
        await new Promise((resolve) => setTimeout(resolve, delay));
        if (refreshBurstIdRef.current !== burstId) return;
        await loadData({ silent: true });
      }
    })();
  }, [loadData]);

  useEffect(() => {
    void loadData();
    return () => {
      refreshBurstIdRef.current += 1;
    };
  }, [loadData]);

  // Portal-wide activity sync asks Parts pages to reload cards (no continuous full poll here).
  useEffect(() => {
    function onRefresh() {
      void loadData({ silent: true });
    }
    window.addEventListener(PARTS_DATA_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(PARTS_DATA_REFRESH_EVENT, onRefresh);
  }, [loadData]);

  // Another tab changed parts data — run the same short burst here, then stop.
  useEffect(() => {
    function onStorage(event: StorageEvent) {
      if (event.key !== PARTS_DATA_CHANGED_KEY || !event.newValue) return;
      const burstId = ++refreshBurstIdRef.current;
      void (async () => {
        await loadData({ silent: true });
        for (const delay of PARTS_REFRESH_BURST_DELAYS_MS) {
          await new Promise((resolve) => setTimeout(resolve, delay));
          if (refreshBurstIdRef.current !== burstId) return;
          await loadData({ silent: true });
        }
      })();
    }
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [loadData]);

  /** Marketplace options from other sellers only — never the viewer's own stock. */
  const marketplaceCatalog = useMemo(() => {
    const ownId = data?.viewer.clientId ? String(data.viewer.clientId) : null;
    const source = data?.catalog ?? [];
    if (!ownId) return source;
    return source
      .map((item) => {
        const listings = item.listings.filter((listing) => String(listing.clientId) !== ownId);
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
      .filter(Boolean) as CatalogItem[];
  }, [data]);

  const filteredMarketplaceCatalog = useMemo(() => {
    if (marketplaceCategory === 'all') return marketplaceCatalog;
    return marketplaceCatalog.filter((item) => item.category === marketplaceCategory);
  }, [marketplaceCatalog, marketplaceCategory]);

  const totalAvailable = useMemo(
    () => marketplaceCatalog.reduce((sum, item) => sum + item.totalAvailable, 0),
    [marketplaceCatalog]
  );
  const totalSuppliers = useMemo(() => {
    const ids = new Set<string>();
    for (const item of marketplaceCatalog) {
      for (const listing of item.listings) ids.add(listing.clientId);
    }
    return ids.size;
  }, [marketplaceCatalog]);

  const groupedOutgoing = useMemo(() => {
    const grouped = new Map<
      string,
      PartRequestView & {
        requestedQuantity: number;
        unitPrice: number;
        partsSubtotal: number;
        deliveryFee: number;
      }
    >();
    for (const request of data?.requests.outgoing ?? []) {
      const lineParts = partsSubtotal(request);
      const lineFee = lineDeliveryFee(request);
      const existing = grouped.get(request.requestNumber);
      if (!existing) {
        grouped.set(request.requestNumber, {
          ...request,
          partsSubtotal: lineParts,
          deliveryFee: lineFee,
        });
        continue;
      }
      existing.requestedQuantity += request.requestedQuantity;
      existing.unitPrice += request.requestedQuantity * request.unitPrice;
      existing.partsSubtotal += lineParts;
      // Sum line fees in this checkout; shared $0 lines do not inflate the total.
      existing.deliveryFee += lineFee;
      if (!existing.notes && request.notes) existing.notes = request.notes;
      if (!existing.deliveryPackageId && request.deliveryPackageId) {
        existing.deliveryPackageId = request.deliveryPackageId;
      }
      if (
        request.billing?.paymentUnpaid ||
        (!existing.billing?.paymentUnpaid && request.billing)
      ) {
        existing.billing = request.billing;
      }
      // Prefer actionable / terminal statuses when rows are split across suppliers.
      const rank = (status: string) =>
        status === 'out_for_delivery'
          ? 5
          : status === 'pending_delivery'
            ? 4
            : status === 'cancel_requested'
              ? 3
              : status === 'pending'
                ? 2
                : status === 'cancelled'
                  ? 1
                  : status === 'fulfilled'
                    ? 0
                    : 0;
      if (rank(request.status) > rank(existing.status)) existing.status = request.status;
      const existingEta = Number(existing.deliveryEtaMinutes ?? NaN);
      const nextEta = Number(request.deliveryEtaMinutes ?? NaN);
      if (Number.isFinite(nextEta) && (!Number.isFinite(existingEta) || nextEta > existingEta)) {
        existing.deliveryEtaMinutes = nextEta;
        existing.deliveryEtaLabel = request.deliveryEtaLabel ?? existing.deliveryEtaLabel;
      } else if (!existing.deliveryEtaLabel && request.deliveryEtaLabel) {
        existing.deliveryEtaLabel = request.deliveryEtaLabel;
      }
      const preferEarlier = (a?: string | null, b?: string | null) => {
        if (!a) return b ?? null;
        if (!b) return a;
        return new Date(a).getTime() <= new Date(b).getTime() ? a : b;
      };
      const preferLater = (a?: string | null, b?: string | null) => {
        if (!a) return b ?? null;
        if (!b) return a;
        return new Date(a).getTime() >= new Date(b).getTime() ? a : b;
      };
      existing.pendingDeliveryAt = preferEarlier(existing.pendingDeliveryAt, request.pendingDeliveryAt);
      existing.pickedUpAt = preferEarlier(existing.pickedUpAt, request.pickedUpAt);
      existing.completedAt = preferLater(existing.completedAt, request.completedAt);
      existing.cancelRequestedAt = preferEarlier(existing.cancelRequestedAt, request.cancelRequestedAt);
      existing.cancelledAt = preferLater(existing.cancelledAt, request.cancelledAt);
      if (!existing.deliveryFromAddress && request.deliveryFromAddress) {
        existing.deliveryFromAddress = request.deliveryFromAddress;
      }
      if (!existing.deliveryToAddress && request.deliveryToAddress) {
        existing.deliveryToAddress = request.deliveryToAddress;
      }
      if (!existing.deliveryMapEmbedUrl && request.deliveryMapEmbedUrl) {
        existing.deliveryMapEmbedUrl = request.deliveryMapEmbedUrl;
        existing.deliveryDirectionsUrl = request.deliveryDirectionsUrl ?? existing.deliveryDirectionsUrl;
      }
      if (!existing.updatedAt && request.updatedAt) existing.updatedAt = request.updatedAt;
      else if (existing.updatedAt && request.updatedAt) {
        existing.updatedAt = preferLater(existing.updatedAt, request.updatedAt) ?? existing.updatedAt;
      }
    }
    return Array.from(grouped.values()).map((request) => ({
      ...request,
      unitPrice:
        request.requestedQuantity > 0 ? request.unitPrice / request.requestedQuantity : request.unitPrice,
    }));
  }, [data]);

  const activeOutgoing = useMemo(
    () => groupedOutgoing.filter((request) => ACTIVE_REQUEST_STATUSES.has(request.status)),
    [groupedOutgoing]
  );
  const pendingVerificationReviewCount = useMemo(
    () =>
      (data?.requests.incoming ?? []).filter(
        (request) => request.verificationStatus === 'pending_review'
      ).length,
    [data?.requests.incoming]
  );

  const activeIncoming = useMemo(
    () => (data?.requests.incoming ?? []).filter((request) => ACTIVE_REQUEST_STATUSES.has(request.status)),
    [data]
  );
  const pendingIncoming = useMemo(
    () => activeIncoming.filter((request) => request.status === 'pending'),
    [activeIncoming]
  );
  const historyRequests = useMemo(() => {
    const outgoingHistory = groupedOutgoing.filter((request) =>
      HISTORY_REQUEST_STATUSES.has(request.status)
    );
    const incomingHistory = (data?.requests.incoming ?? []).filter((request) =>
      HISTORY_REQUEST_STATUSES.has(request.status)
    );
    const byNumber = new Map<string, PartRequestView & { source: string }>();
    for (const request of outgoingHistory) {
      byNumber.set(request.requestNumber, { ...request, source: 'Outgoing' });
    }
    for (const request of incomingHistory) {
      const existing = byNumber.get(request.requestNumber);
      if (!existing) {
        byNumber.set(request.requestNumber, {
          ...request,
          source: 'Incoming',
          partsSubtotal: partsSubtotal(request),
          deliveryFee: lineDeliveryFee(request),
        } as PartRequestView & { source: string; partsSubtotal: number; deliveryFee: number });
        continue;
      }
      existing.source = 'Both';
      // Keep the marketplace / client price even when merging supplier (incoming) rows.
      const incomingListed = Number(request.listedUnitPrice);
      if (Number.isFinite(incomingListed) && incomingListed > 0) {
        existing.listedUnitPrice = incomingListed;
      }
      const withTotals = existing as PartRequestView & {
        source: string;
        partsSubtotal?: number;
        deliveryFee?: number;
      };
      withTotals.deliveryFee = Math.max(
        Number(withTotals.deliveryFee) || 0,
        lineDeliveryFee(request)
      );
    }
    return Array.from(byNumber.values()).sort(
      (a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()
    );
  }, [groupedOutgoing, data]);

  const pendingCancelRequests = useMemo(
    () => activeOutgoing.filter((request) => request.status === 'cancel_requested'),
    [activeOutgoing]
  );

  useEffect(() => {
    if (!canManageStock) {
      setToasts([]);
      return;
    }
    const pendingIds = new Set(pendingIncoming.map((request) => request.id));
    const snooze = pruneIncomingToastSnooze(pendingIds);
    setToasts(
      pendingIncoming
        .filter((request) => !isIncomingToastSnoozed(request.id, snooze))
        .map((request) => ({
          id: request.id,
          requestNumber: request.requestNumber,
          itemName: request.itemName,
          buyerLabel: request.buyerDisplayName || request.buyerName || 'Buyer',
          quantity: request.requestedQuantity,
        }))
    );

    // Re-show snoozed toasts when the 24h window elapses (page still open).
    const now = Date.now();
    let soonestWake: number | null = null;
    for (const request of pendingIncoming) {
      const dismissedAt = snooze[request.id];
      if (!dismissedAt) continue;
      const remaining = INCOMING_TOAST_SNOOZE_MS - (now - dismissedAt);
      if (remaining <= 0) continue;
      if (soonestWake === null || remaining < soonestWake) soonestWake = remaining;
    }
    if (soonestWake === null) return;
    const timer = window.setTimeout(() => {
      const nextSnooze = pruneIncomingToastSnooze(pendingIds);
      setToasts(
        pendingIncoming
          .filter((request) => !isIncomingToastSnoozed(request.id, nextSnooze))
          .map((request) => ({
            id: request.id,
            requestNumber: request.requestNumber,
            itemName: request.itemName,
            buyerLabel: request.buyerDisplayName || request.buyerName || 'Buyer',
            quantity: request.requestedQuantity,
          }))
      );
    }, soonestWake + 25);
    return () => window.clearTimeout(timer);
  }, [canManageStock, pendingIncoming, toastSnoozeEpoch]);

  useEffect(() => {
    const isAdmin = data?.viewer.role === 'admin';
    if (!isAdmin) {
      setCancelToasts([]);
      return;
    }
    const activeIds = new Set(pendingCancelRequests.map((request) => request.id));
    const snooze = pruneCancelToastSnooze(activeIds);
    setCancelToasts(
      pendingCancelRequests
        .filter((request) => !isCancelToastSnoozed(request.id, snooze))
        .map((request) => ({
          id: request.id,
          requestNumber: request.requestNumber,
          itemName: request.itemName,
          buyerLabel: request.buyerDisplayName || request.buyerName || 'Buyer',
          quantity: request.requestedQuantity,
        }))
    );

    const now = Date.now();
    let soonestWake: number | null = null;
    for (const request of pendingCancelRequests) {
      const dismissedAt = snooze[request.id];
      if (!dismissedAt) continue;
      const remaining = INCOMING_TOAST_SNOOZE_MS - (now - dismissedAt);
      if (remaining <= 0) continue;
      if (soonestWake === null || remaining < soonestWake) soonestWake = remaining;
    }
    if (soonestWake === null) return;
    const timer = window.setTimeout(() => {
      const nextSnooze = pruneCancelToastSnooze(activeIds);
      setCancelToasts(
        pendingCancelRequests
          .filter((request) => !isCancelToastSnoozed(request.id, nextSnooze))
          .map((request) => ({
            id: request.id,
            requestNumber: request.requestNumber,
            itemName: request.itemName,
            buyerLabel: request.buyerDisplayName || request.buyerName || 'Buyer',
            quantity: request.requestedQuantity,
          }))
      );
    }, soonestWake + 25);
    return () => window.clearTimeout(timer);
  }, [data?.viewer.role, pendingCancelRequests, toastSnoozeEpoch]);

  useEffect(() => {
    const deliveryOutgoing = activeOutgoing.filter(
      (request) =>
        request.status === 'pending_delivery' || request.status === 'out_for_delivery'
    );
    const activeIds = new Set(deliveryOutgoing.map((request) => request.id));
    const seen = pruneOutgoingToastSeen(activeIds);
    setOutgoingToasts(
      deliveryOutgoing
        .filter((request) => seen[request.id] !== request.status)
        .map((request) => ({
          id: request.id,
          requestNumber: request.requestNumber,
          itemName: request.itemName,
          quantity: request.requestedQuantity,
          status: request.status as 'pending_delivery' | 'out_for_delivery',
          etaLabel: request.deliveryEtaLabel ?? null,
          paymentRequired: Boolean(request.billing?.paymentUnpaid),
        }))
    );
  }, [activeOutgoing]);

  function dismissIncomingToast(id: string) {
    snoozeIncomingToast(id);
    setToasts((prev) => prev.filter((toast) => toast.id !== id));
    setToastSnoozeEpoch((n) => n + 1);
  }

  function dismissCancelToast(id: string) {
    snoozeCancelToast(id);
    setCancelToasts((prev) => prev.filter((toast) => toast.id !== id));
    setToastSnoozeEpoch((n) => n + 1);
  }

  function dismissOutgoingToast(id: string, status: string) {
    markOutgoingToastSeen(id, status);
    setOutgoingToasts((prev) => prev.filter((toast) => toast.id !== id));
  }

  const filteredInventory = useMemo(() => {
    const query = stockSearch.trim().toLowerCase();
    const listings = data?.myInventory ?? [];
    if (!query) return listings;
    return listings.filter((listing) => {
      const haystack = [
        listing.itemName,
        listing.partNumber ?? '',
        listing.brand ?? '',
        listing.notes ?? '',
      ]
        .join(' ')
        .toLowerCase();
      return haystack.includes(query);
    });
  }, [data, stockSearch]);

  function resetStockForm() {
    setStockForm(emptyStockForm);
  }

  function closeStockModal() {
    setStockModalOpen(false);
    resetStockForm();
    setError('');
  }

  function openAddListing() {
    resetStockForm();
    setError('');
    setStockModalOpen(true);
  }

  function beginEdit(listing: InventoryListing) {
    setStockForm({
      id: listing.id,
      itemName: listing.itemName,
      partNumber: listing.partNumber ?? '',
      brand: listing.brand ?? '',
      unitPrice: String(listing.unitPrice ?? 0),
      quantity: String(listing.quantity ?? 0),
      availableQuantity: String(listing.availableQuantity ?? 0),
      notes: listing.notes ?? '',
      category: listing.category,
      itemCondition: listing.itemCondition,
      requiresVerification: listing.requiresVerification,
      imageFiles: listing.imageFiles?.length
        ? [...listing.imageFiles]
        : listing.imageFile
          ? [listing.imageFile]
          : [],
      verificationVideoFile: listing.verificationVideoFile,
    });
    setError('');
    setStockModalOpen(true);
  }

  async function uploadPartsMedia(file: File, kind: 'image' | 'video') {
    const form = new FormData();
    form.set('kind', kind);
    form.set('file', file);
    const res = await fetch('/api/parts-catalog-media', { method: 'POST', body: form });
    const payload = await parseResponse(res);
    return String(payload.fileName ?? '');
  }

  async function handleStockImagesPick(fileList: FileList | null) {
    if (!fileList?.length) return;
    const remaining = MAX_PARTS_LISTING_IMAGES - stockForm.imageFiles.length;
    if (remaining <= 0) {
      setError(`You can upload up to ${MAX_PARTS_LISTING_IMAGES} photos per listing.`);
      return;
    }
    const files = Array.from(fileList).slice(0, remaining);
    setMediaUploading('image');
    setError('');
    try {
      const uploaded: string[] = [];
      for (const file of files) {
        uploaded.push(await uploadPartsMedia(file, 'image'));
      }
      setStockForm((prev) => ({
        ...prev,
        imageFiles: [...prev.imageFiles, ...uploaded].slice(0, MAX_PARTS_LISTING_IMAGES),
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Image upload failed');
    } finally {
      setMediaUploading('');
    }
  }

  function removeStockImage(fileName: string) {
    setStockForm((prev) => ({
      ...prev,
      imageFiles: prev.imageFiles.filter((f) => f !== fileName),
    }));
  }

  async function handleStockVideoPick(file: File | null) {
    if (!file) return;
    setMediaUploading('video');
    setError('');
    try {
      const fileName = await uploadPartsMedia(file, 'video');
      setStockForm((prev) => ({ ...prev, verificationVideoFile: fileName }));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Video upload failed');
    } finally {
      setMediaUploading('');
    }
  }

  useEffect(() => {
    if (!stockModalOpen) return;
    window.requestAnimationFrame(() => stockItemNameRef.current?.focus());
  }, [stockModalOpen]);

  async function saveStockListing() {
    setSubmitting('stock');
    setError('');
    setNotice('');
    try {
      const category = normalizePartsCategory(stockForm.category);
      const requiresVerification =
        categoryRequiresVideoVerification(category) || stockForm.requiresVerification;
      const body = {
        itemName: stockForm.itemName,
        partNumber: stockForm.partNumber,
        brand: stockForm.brand,
        unitPrice: Number(stockForm.unitPrice),
        quantity: Number(stockForm.quantity),
        availableQuantity: Number(stockForm.availableQuantity),
        notes: stockForm.notes,
        category,
        itemCondition: normalizeItemCondition(stockForm.itemCondition),
        requiresVerification,
        imageFiles: stockForm.imageFiles,
        imageFile: stockForm.imageFiles[0] ?? null,
        verificationVideoFile: stockForm.verificationVideoFile,
      };

      const res = await fetch(
        stockForm.id ? `/api/msp/parts-catalog/listings/${stockForm.id}` : '/api/msp/parts-catalog/listings',
        {
          method: stockForm.id ? 'PUT' : 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(stockForm.id ? body : { ...body, availableQuantity: undefined }),
        }
      );
      await parseResponse(res);
      setNotice(stockForm.id ? 'Stock listing updated.' : 'Stock listing added.');
      closeStockModal();
      setTab('my-stock');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save stock listing');
    } finally {
      setSubmitting('');
    }
  }

  async function deleteListing(id: string) {
    if (!window.confirm('Delete this stock listing?')) return;
    setSubmitting(`delete-${id}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/msp/parts-catalog/listings/${id}`, { method: 'DELETE' });
      await parseResponse(res);
      setNotice('Stock listing deleted.');
      if (stockForm.id === id) resetStockForm();
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete stock listing');
    } finally {
      setSubmitting('');
    }
  }

  function openMarketplaceDetail(item: CatalogItem) {
    setDetailModalImageIndex(0);
    setSellerMapListingId(null);
    setPriceDetailItem(item);
  }

  function closeMarketplaceDetail() {
    setPriceDetailItem(null);
    setSellerMapListingId(null);
    setDetailModalImageIndex(0);
  }

  function openRequestForItem(item: CatalogItem, listing?: InventoryListing | null) {
    setRequestItem(item);
    setRequestListing(listing ?? null);
    setRequestQuantity('1');
    setRequestNotes('');
    closeMarketplaceDetail();
  }

  async function reviewRequestVerification(
    requestId: string,
    action: 'accept' | 'deny' | 'skip'
  ) {
    const notes =
      action === 'deny'
        ? window.prompt('Optional note for the seller (denial reason):') ?? ''
        : '';
    setSubmitting(`verify-review:${requestId}`);
    setError('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/verification/review', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, notes: notes.trim() || undefined }),
      });
      await parseResponse(res);
      setNotice(
        action === 'accept'
          ? 'Verification accepted — fulfillment can proceed.'
          : action === 'skip'
            ? 'Verification skipped — fulfillment can proceed.'
            : 'Verification denied.'
      );
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update verification');
    } finally {
      setSubmitting('');
    }
  }

  async function requestSellerVerification(requestId: string) {
    const notes = window.prompt('Optional note to the seller about what to show in the video:') ?? '';
    setSubmitting(`verify-request:${requestId}`);
    setError('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/verification/request-seller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, notes: notes.trim() || undefined }),
      });
      await parseResponse(res);
      setNotice('Verification requested from the seller.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request verification');
    } finally {
      setSubmitting('');
    }
  }

  async function submitSellerVerificationVideo(requestId: string, file: File) {
    setVerificationUploadingId(requestId);
    setError('');
    try {
      const fileName = await uploadPartsMedia(file, 'video');
      const res = await fetch('/api/msp/parts-catalog/requests/verification/seller-video', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, verificationVideoFile: fileName }),
      });
      await parseResponse(res);
      setNotice('Verification video submitted for Computer Dynamics review.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to upload verification video');
    } finally {
      setVerificationUploadingId(null);
    }
  }

  async function submitRequest() {
    if (!requestItem) return;
    setSubmitting('request');
    setError('');
    setNotice('');
    setShowViewOutgoing(false);
    try {
      const res = await fetch('/api/msp/parts-catalog/requests', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          itemName: requestItem.itemName,
          quantity: Number(requestQuantity),
          notes: requestNotes,
          preferredInventoryId: requestListing?.id ?? null,
          category: requestItem.category,
        }),
      });
      const payload = await parseResponse(res);
      setNotice(
        payload.message ||
          'Parts request submitted. You can keep browsing the marketplace or view your outgoing requests.'
      );
      setShowViewOutgoing(true);
      setRequestItem(null);
      setRequestListing(null);
      setRequestQuantity('1');
      setRequestNotes('');
      setTab('marketplace');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to submit parts request');
    } finally {
      setSubmitting('');
    }
  }

  async function cancelOutgoingRequest(requestNumber: string, action: 'cancel' | 'request_cancel') {
    const confirmMessage =
      action === 'request_cancel'
        ? `Request cancellation for ${requestNumber}? Staff will confirm.`
        : `Cancel request ${requestNumber}? Reserved stock will be released.`;
    if (!window.confirm(confirmMessage)) return;

    setSubmitting(`cancel:${requestNumber}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/cancel', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestNumber, action }),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Request updated.');
      // Clear admin cancel toasts for this request when staff confirms cancel.
      if (action === 'cancel') {
        const matched = activeOutgoing.filter((request) => request.requestNumber === requestNumber);
        for (const request of matched) {
          clearCancelToastSnooze(request.id);
          setCancelToasts((prev) => prev.filter((toast) => toast.id !== request.id));
        }
      }
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update request');
    } finally {
      setSubmitting('');
    }
  }

  async function openFulfillModal(request: PartRequestView) {
    setError('');
    setNotice('');
    const isStaff =
      data?.viewer.role === 'admin' || data?.viewer.role === 'technician';

    if (!isStaff) {
      setFulfillModal({
        requestId: request.id,
        requestNumber: request.requestNumber,
        itemName: request.itemName,
        mode: 'client',
        loading: false,
        preview: null,
        deliveryFee: '',
        error: '',
      });
      return;
    }

    setFulfillModal({
      requestId: request.id,
      requestNumber: request.requestNumber,
      itemName: request.itemName,
      mode: 'staff',
      loading: true,
      preview: null,
      deliveryFee: '',
      error: '',
    });
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/fulfill-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId: request.id }),
      });
      const payload = await parseResponse(res);
      const preview = payload.preview as FulfillPreviewPayload;
      const suggested =
        preview.mode === 'share'
          ? '0'
          : preview.suggestedDeliveryFee != null
            ? String(Math.round(Number(preview.suggestedDeliveryFee)))
            : '';
      setFulfillModal({
        requestId: request.id,
        requestNumber: request.requestNumber,
        itemName: request.itemName,
        mode: 'staff',
        loading: false,
        preview,
        deliveryFee: suggested,
        error: '',
      });
    } catch (err) {
      setFulfillModal((prev) =>
        prev
          ? {
              ...prev,
              loading: false,
              error: err instanceof Error ? err.message : 'Failed to load delivery preview',
            }
          : null
      );
    }
  }

  async function confirmFulfillModal() {
    if (!fulfillModal) return;
    const isStaffModal = fulfillModal.mode === 'staff';
    const body: { requestId: string; deliveryFee?: number } = {
      requestId: fulfillModal.requestId,
    };
    // Fee is optional — CD can set it later via Edit delivery.
    if (isStaffModal) {
      const feeRaw = fulfillModal.deliveryFee.trim();
      if (feeRaw !== '') {
        if (!Number.isFinite(Number(feeRaw)) || Number(feeRaw) < 0) {
          setFulfillModal({
            ...fulfillModal,
            error: 'Delivery fee must be whole dollars (0 or more), or leave blank to set later.',
          });
          return;
        }
        body.deliveryFee = Math.round(Number(feeRaw));
      }
    }
    setSubmitting(`fulfill:${fulfillModal.requestId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/fulfill', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const payload = await parseResponse(res);
      setNotice(
        payload.message ||
          (isStaffModal
            ? 'Request marked pending delivery.'
            : 'Marked ready — Computer Dynamics will collect and deliver.')
      );
      clearIncomingToastSnooze(fulfillModal.requestId);
      setToasts((prev) => prev.filter((toast) => toast.id !== fulfillModal.requestId));
      setFulfillModal(null);
      await refreshAfterChange();
    } catch (err) {
      setFulfillModal({
        ...fulfillModal,
        error: err instanceof Error ? err.message : 'Failed to fulfill request',
      });
    } finally {
      setSubmitting('');
    }
  }

  function openDeliveryFeeEditor(request: PartRequestView, siblings: PartRequestView[]) {
    const current = deliveryFeeForDisplay(request, siblings);
    setDeliveryEditId(request.id);
    setDeliveryEditFee(String(Math.round(current)));
  }

  async function saveDeliveryFee(requestId: string) {
    const feeRaw = deliveryEditFee.trim();
    if (feeRaw === '' || !Number.isFinite(Number(feeRaw)) || Number(feeRaw) < 0) {
      setError('Enter a delivery fee in whole dollars (0 or more).');
      return;
    }
    setSubmitting(`delivery-fee:${requestId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/delivery-fee', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, deliveryFee: Math.round(Number(feeRaw)) }),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Delivery fee updated.');
      setDeliveryEditId(null);
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update delivery fee');
    } finally {
      setSubmitting('');
    }
  }

  async function pickupIncomingRequest(requestId: string, requestNumber: string) {
    if (!window.confirm(`Mark request ${requestNumber} as collected and out for delivery?`)) return;

    setSubmitting(`pickup:${requestId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/pickup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId }),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Request marked out for delivery.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark collected');
    } finally {
      setSubmitting('');
    }
  }

  async function addReceivedRequestToStock(request: PartRequestView) {
    const qty = Number(request.requestedQuantity) || 0;
    const unitPrice = clientUnitPrice(request);
    if (qty <= 0) throw new Error('Invalid quantity for stock');

    const res = await fetch('/api/msp/parts-catalog/listings', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        itemName: request.itemName,
        unitPrice,
        quantity: qty,
        notes: `Added from received request ${request.requestNumber}`,
      }),
    });
    await parseResponse(res);
  }

  function offerAddReceivedToStock(request: PartRequestView | undefined) {
    if (!canManageStock || !request) return;
    const stockLabel = data?.viewer.stockLabel || stockTabLabel || 'My Stock';
    const qty = request.requestedQuantity;
    const price = clientUnitPrice(request);
    setAddToStockPrompt({ request, stockLabel, qty, price });
  }

  async function confirmAddReceivedToStock() {
    if (!addToStockPrompt) return;
    const { request, stockLabel, qty } = addToStockPrompt;
    setAddToStockPrompt(null);

    setSubmitting(`stock-from:${request.requestNumber}`);
    try {
      await addReceivedRequestToStock(request);
      setNotice(
        `Request ${request.requestNumber} received, and ${qty}× ${request.itemName} was added to ${stockLabel}.`
      );
      setTab('my-stock');
      await refreshAfterChange();
    } catch (err) {
      setError(
        err instanceof Error
          ? err.message
          : 'Received, but failed to add the item to your stock'
      );
    } finally {
      setSubmitting('');
    }
  }

  async function receiveOutgoingRequest(requestNumber: string) {
    if (!window.confirm(`Confirm you received request ${requestNumber}? This completes fulfillment.`)) {
      return;
    }

    const receivedRequest = activeOutgoing.find((request) => request.requestNumber === requestNumber);

    setSubmitting(`receive:${requestNumber}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestNumber }),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Request marked received.');
      await refreshAfterChange();
      await offerAddReceivedToStock(receivedRequest);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to confirm receipt');
    } finally {
      setSubmitting('');
    }
  }

  async function markDeliveredAsAdmin(requestNumber: string) {
    if (
      !window.confirm(
        `Mark request ${requestNumber} as delivered? Use this when the buyer did not press Receive.`
      )
    ) {
      return;
    }

    setSubmitting(`deliver:${requestNumber}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/receive', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestNumber }),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Request marked delivered.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark delivered');
    } finally {
      setSubmitting('');
    }
  }

  async function acceptPackageQuote(packageId: string) {
    setSubmitting(`accept-quote:${packageId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/msp/parts-catalog/packages/${packageId}/accept-quote`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Quote accepted. Invoice created — you can pay online now.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to accept quote');
    } finally {
      setSubmitting('');
    }
  }

  async function payPackageOnline(packageId: string) {
    setSubmitting(`pay:${packageId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/msp/parts-catalog/packages/${packageId}/pay`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await parseResponse(res);
      const url = typeof payload.url === 'string' ? payload.url : '';
      if (!url) throw new Error(payload.message || 'Payment URL was not returned');
      window.location.href = url;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to start online payment');
      setSubmitting('');
    }
  }

  async function markPackageCashPaid(packageId: string) {
    if (
      !window.confirm(
        'Mark this parts package as paid in cash? This accepts the quote (if needed), creates the invoice, and clears the unpaid warning.'
      )
    ) {
      return;
    }
    setSubmitting(`cash:${packageId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/msp/parts-catalog/packages/${packageId}/mark-cash-paid`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Package marked paid (cash).');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to mark cash paid');
    } finally {
      setSubmitting('');
    }
  }

  async function requestPackageCod(packageId: string) {
    if (
      !window.confirm(
        'Request cash on delivery? Accept the quote if needed, then pay cash when your order is delivered. Staff will confirm payment on delivery.'
      )
    ) {
      return;
    }
    setSubmitting(`cod:${packageId}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch(`/api/msp/parts-catalog/packages/${packageId}/request-cod`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      const payload = await parseResponse(res);
      setNotice(payload.message || 'Cash on delivery requested.');
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to request COD');
    } finally {
      setSubmitting('');
    }
  }

  function openRouteEditor(request: PartRequestView) {
    setRouteEditId(request.id);
    setRouteEditFrom(request.routeEditor?.fromAddress || request.fulfillmentRoute?.fromAddress || '');
    setRouteEditTo(request.routeEditor?.toAddress || request.fulfillmentRoute?.toAddress || '');
  }

  function patchIncomingRoute(
    requestId: string,
    fulfillmentRoute: PartRequestFulfillmentRoute | null,
    routeEditor: PartRequestRouteEditor
  ) {
    setData((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        requests: {
          ...prev.requests,
          incoming: prev.requests.incoming.map((request) =>
            request.id === requestId ? { ...request, fulfillmentRoute, routeEditor } : request
          ),
        },
      };
    });
  }

  async function submitRouteAction(
    requestId: string,
    action: 'remove' | 'update' | 'reset',
    fromAddress?: string,
    toAddress?: string
  ) {
    setSubmitting(`route:${requestId}:${action}`);
    setError('');
    setNotice('');
    try {
      const res = await fetch('/api/msp/parts-catalog/requests/route', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ requestId, action, fromAddress, toAddress }),
      });
      const payload = await parseResponse(res);
      patchIncomingRoute(
        requestId,
        (payload.fulfillmentRoute as PartRequestFulfillmentRoute | null) ?? null,
        payload.routeEditor as PartRequestRouteEditor
      );
      setNotice(payload.message || 'Route updated.');
      setRouteEditId(null);
      await refreshAfterChange();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update route');
    } finally {
      setSubmitting('');
    }
  }

  const incomingCount = activeIncoming.length;
  const tabItems = visibleTabs.map((item) => {
    if (item.key === 'outgoing') return { ...item, count: activeOutgoing.length };
    if (item.key === 'incoming') return { ...item, count: incomingCount };
    if (item.key === 'history') return { ...item, count: historyRequests.length };
    if (item.key === 'my-stock') return { ...item, count: data?.myInventory.length ?? 0 };
    if (item.key === 'marketplace') return { ...item, count: marketplaceCatalog.length };
    return item;
  });

  // Toasts are handled portal-wide by PartsLiveSync (works off the Parts page too).
  const showPageToasts = false;
  return (
    <div className="flex min-h-0 flex-1 flex-col gap-3 touch-manipulation sm:gap-4">
      {showPageToasts && (toasts.length > 0 || outgoingToasts.length > 0 || cancelToasts.length > 0) && (
        <div
          className={`pointer-events-none fixed right-6 z-[90] flex max-h-[min(70vh,28rem)] w-full max-w-sm flex-col-reverse gap-2 overflow-y-auto ${
            data?.viewer.role === 'admin'
              ? 'bottom-24 max-lg:bottom-[calc(8.5rem+env(safe-area-inset-bottom,0px))]'
              : 'bottom-6'
          }`}
        >
          {cancelToasts.map((toast) => (
            <div
              key={`cancel-${toast.id}`}
              className="pointer-events-auto rounded-2xl border border-rose-200 bg-white px-4 py-3 text-sm text-rose-950 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">Cancel requested</p>
                  <p className="mt-0.5 text-rose-900/80">
                    {toast.quantity}× {toast.itemName}
                  </p>
                  <p className="mt-1 text-xs text-rose-900/60">
                    {toast.requestNumber} · {toast.buyerLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('outgoing')}
                    className="rounded-lg bg-rose-100 px-2.5 py-1 text-xs font-semibold text-rose-900 hover:bg-rose-200"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissCancelToast(toast.id)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
          {outgoingToasts.map((toast) => (
            <div
              key={`out-${toast.id}-${toast.status}`}
              className={`pointer-events-auto rounded-2xl border bg-white px-4 py-3 text-sm shadow-xl ${
                toast.paymentRequired
                  ? 'border-amber-200 text-amber-950'
                  : 'border-sky-200 text-sky-950'
              }`}
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">
                    {toast.paymentRequired
                      ? 'Payment required for your parts order'
                      : toast.status === 'pending_delivery'
                        ? 'Ready for delivery'
                        : 'Out for delivery'}
                  </p>
                  <p
                    className={`mt-0.5 ${toast.paymentRequired ? 'text-amber-900/80' : 'text-sky-900/80'}`}
                  >
                    {toast.quantity}× {toast.itemName}
                  </p>
                  <p
                    className={`mt-1 text-xs ${toast.paymentRequired ? 'text-amber-900/60' : 'text-sky-900/60'}`}
                  >
                    {toast.requestNumber}
                    {toast.etaLabel ? ` · ETA ${toast.etaLabel}` : ''}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('outgoing')}
                    className={`rounded-lg px-2.5 py-1 text-xs font-semibold ${
                      toast.paymentRequired
                        ? 'bg-amber-100 text-amber-900 hover:bg-amber-200'
                        : 'bg-sky-100 text-sky-900 hover:bg-sky-200'
                    }`}
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissOutgoingToast(toast.id, toast.status)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
          {toasts.map((toast) => (
            <div
              key={toast.id}
              className="pointer-events-auto rounded-2xl border border-amber-200 bg-white px-4 py-3 text-sm text-amber-950 shadow-xl"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="font-semibold">Incoming parts</p>
                  <p className="mt-0.5 text-amber-900/80">
                    {toast.quantity}× {toast.itemName}
                  </p>
                  <p className="mt-1 text-xs text-amber-900/60">
                    {toast.requestNumber} · {toast.buyerLabel}
                  </p>
                </div>
                <div className="flex shrink-0 items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setTab('incoming')}
                    className="rounded-lg bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-200"
                  >
                    View
                  </button>
                  <button
                    type="button"
                    onClick={() => dismissIncomingToast(toast.id)}
                    className="rounded-lg px-2 py-1 text-xs text-slate-500 hover:bg-slate-100"
                  >
                    Dismiss
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      {hidePageHeader ? (
        <div className="flex shrink-0 justify-end">
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || !!submitting}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      ) : (
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0">
            <h1 className="text-xl font-bold tracking-tight text-slate-900 sm:text-2xl">Parts Catalog</h1>
            <p className="mt-1 hidden text-sm text-slate-500 sm:block">
              Shared marketplace stock for businesses and technicians, routed through the platform.
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadData()}
            disabled={loading || !!submitting}
            className="inline-flex min-h-11 items-center gap-2 rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
            Refresh
          </button>
        </div>
      )}

      {notice && (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="min-w-0 flex-1">{notice}</p>
          {showViewOutgoing && (
            <button
              type="button"
              onClick={() => {
                setShowViewOutgoing(false);
                setTab('outgoing');
              }}
              className="shrink-0 rounded-lg border border-emerald-300 bg-white px-3 py-1.5 text-xs font-medium text-emerald-900 hover:bg-emerald-100"
            >
              View outgoing
            </button>
          )}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
          {error}
        </div>
      )}

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:gap-4 xl:grid-cols-4">
        <button type="button" onClick={() => setTab('marketplace')} className="text-left">
          <StatCard
            compact
            label="Catalog items"
            value={marketplaceCatalog.length}
            icon={Boxes}
            accent="bg-blue-50 text-blue-600"
          />
        </button>
        <StatCard compact label="Units available" value={totalAvailable} icon={Package} accent="bg-emerald-50 text-emerald-600" />
        <StatCard compact label="Businesses listing stock" value={totalSuppliers} icon={Store} accent="bg-amber-50 text-amber-700" />
        <button type="button" onClick={() => setTab('outgoing')} className="text-left">
          <StatCard
            compact
            label="Your outgoing requests"
            value={activeOutgoing.length}
            icon={ShoppingCart}
            accent="bg-violet-50 text-violet-700"
          />
        </button>
      </div>

      <label className="block shrink-0 sm:hidden">
        <span className="mb-1 block text-[10px] font-medium uppercase tracking-wide text-slate-500">
          Section
        </span>
        <select
          value={tab}
          onChange={(e) => setTab(e.target.value as PartsTab)}
          className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-sm font-medium text-slate-800"
        >
          {tabItems.map((item) => (
            <option key={item.key} value={item.key}>
              {item.label}
              {typeof item.count === 'number' ? ` (${item.count})` : ''}
            </option>
          ))}
        </select>
      </label>

      <div className="hidden shrink-0 flex-wrap gap-1 rounded-xl border border-slate-200 bg-white p-1 sm:flex">
        {tabItems.map((item) => (
          <button
            key={item.key}
            type="button"
            onClick={() => setTab(item.key)}
            className={`shrink-0 whitespace-nowrap rounded-lg px-3 py-2 text-sm font-medium transition sm:px-4 ${
              tab === item.key ? 'bg-indigo-600 text-white' : 'text-slate-600 hover:bg-slate-50'
            }`}
          >
            {item.label}
            {typeof item.count === 'number' ? (
              <span
                className={`ml-2 rounded-full px-2 py-0.5 text-xs ${
                  tab === item.key ? 'bg-white/20 text-white' : 'bg-slate-100 text-slate-600'
                }`}
              >
                {item.count}
              </span>
            ) : null}
          </button>
        ))}
      </div>

      <div className="max-lg:min-h-0 max-lg:flex-1 max-lg:overflow-y-auto max-lg:overscroll-contain">
      {tab === 'marketplace' && (
        <section className="space-y-4">
          <div className="overflow-hidden rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-600 via-indigo-700 to-slate-900 px-4 py-5 text-white shadow-sm sm:px-6 sm:py-6">
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-200">Shop marketplace</p>
            <h2 className="mt-1 text-xl font-bold tracking-tight sm:text-2xl">Parts &amp; devices from the network</h2>
            <p className="mt-2 max-w-2xl text-sm text-indigo-100/90">
              Browse like a shop — filter by category, compare sellers, and request what you need. Verified
              listings may include working-condition video from the seller.
            </p>
          </div>

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => setMarketplaceCategory('all')}
              className={`rounded-full px-4 py-2 text-sm font-medium transition ${
                marketplaceCategory === 'all'
                  ? 'bg-slate-900 text-white'
                  : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
              }`}
            >
              All
            </button>
            {PARTS_LISTING_CATEGORIES.map((cat) => {
              const Icon = categoryIcon(cat);
              return (
                <button
                  key={cat}
                  type="button"
                  onClick={() => setMarketplaceCategory(cat)}
                  className={`inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition ${
                    marketplaceCategory === cat
                      ? 'bg-indigo-600 text-white'
                      : 'border border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                  }`}
                >
                  <Icon className="h-4 w-4" />
                  {PARTS_CATEGORY_LABELS[cat]}
                </button>
              );
            })}
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                setSearch(searchInput);
              }}
            >
              <input
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                placeholder="Search parts, brands, or part numbers..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
              >
                Search
              </button>
            </form>
          </div>

          {loading && !data ? (
            <div className="rounded-2xl border border-slate-200 bg-white p-6 text-sm text-slate-500 shadow-sm">
              Loading parts catalog...
            </div>
          ) : !marketplaceCatalog.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No parts from other sellers are listed yet.
            </div>
          ) : !filteredMarketplaceCatalog.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No listings in this category yet. Try another filter or clear your search.
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-2.5 sm:gap-3 md:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4 2xl:grid-cols-5">
              {filteredMarketplaceCatalog.map((item) => {
                const cardKey = catalogItemKey(item);
                const coverImages = pickCatalogCoverImages(item);
                const imageIndex = Math.min(
                  marketplaceImageIndex[cardKey] ?? 0,
                  Math.max(0, coverImages.length - 1)
                );
                const cover = coverImages[imageIndex] ?? null;
                const itemCondition = pickCatalogItemCondition(item);
                const CategoryIcon = categoryIcon(item.category);
                const verified = catalogNeedsVerification(item);
                const compareOptions = item.listings.length > 1;
                return (
                  <article
                    key={cardKey}
                    role="button"
                    tabIndex={0}
                    onClick={() => openMarketplaceDetail(item)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        openMarketplaceDetail(item);
                      }
                    }}
                    className="group flex cursor-pointer flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition hover:border-indigo-200 hover:shadow-md focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500"
                  >
                    <div className="relative flex h-28 items-center justify-center bg-slate-100 sm:h-32">
                      {cover ? (
                        <img
                          src={cover}
                          alt=""
                          className="max-h-full max-w-full object-contain object-center"
                          loading="lazy"
                        />
                      ) : (
                        <div className="flex h-full flex-col items-center justify-center gap-1 text-slate-400">
                          <CategoryIcon className="h-7 w-7 opacity-60" />
                          <span className="text-[10px] font-medium">No photo</span>
                        </div>
                      )}
                      {coverImages.length > 1 && (
                        <div
                          className="absolute bottom-1 right-1 flex items-center gap-0.5"
                          onClick={(e) => e.stopPropagation()}
                        >
                          <button
                            type="button"
                            onClick={() =>
                              setMarketplaceImageIndex((prev) => ({
                                ...prev,
                                [cardKey]: (imageIndex - 1 + coverImages.length) % coverImages.length,
                              }))
                            }
                            className="rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/70"
                          >
                            ‹
                          </button>
                          <span className="rounded-full bg-black/50 px-1.5 py-0.5 text-[9px] font-medium text-white">
                            {imageIndex + 1}/{coverImages.length}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setMarketplaceImageIndex((prev) => ({
                                ...prev,
                                [cardKey]: (imageIndex + 1) % coverImages.length,
                              }))
                            }
                            className="rounded-full bg-black/50 px-1.5 py-0.5 text-[10px] font-medium text-white hover:bg-black/70"
                          >
                            ›
                          </button>
                        </div>
                      )}
                      <div className="absolute left-1.5 top-1.5 flex max-w-[calc(100%-0.75rem)] flex-wrap gap-1">
                        <span className="inline-flex items-center gap-0.5 rounded-full bg-white/95 px-1.5 py-0.5 text-[9px] font-semibold text-slate-800 shadow-sm">
                          <CategoryIcon className="h-2.5 w-2.5" />
                          <span className="max-w-[5.5rem] truncate sm:max-w-[7rem]">
                            {PARTS_CATEGORY_LABELS[item.category]}
                          </span>
                        </span>
                        {itemCondition && (
                          <span className="rounded-full bg-slate-900/85 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                            {PARTS_CONDITION_LABELS[itemCondition]}
                          </span>
                        )}
                        {verified && (
                          <span className="inline-flex items-center gap-0.5 rounded-full bg-emerald-600/95 px-1.5 py-0.5 text-[9px] font-semibold text-white shadow-sm">
                            <ShieldCheck className="h-2.5 w-2.5" />
                            Verified
                          </span>
                        )}
                      </div>
                    </div>

                    <div className="flex flex-1 flex-col p-2.5 sm:p-3">
                      <h3 className="line-clamp-2 text-sm font-semibold leading-snug text-slate-900">
                        {item.itemName}
                      </h3>
                      <p className="mt-0.5 text-[10px] leading-tight text-slate-500">
                        {item.totalAvailable} avail · {item.supplierCount} seller
                        {item.supplierCount === 1 ? '' : 's'}
                        {compareOptions ? ` · ${item.listingCount} opts` : ''}
                      </p>

                      <div className="mt-1.5 flex flex-wrap gap-1 text-[10px] text-slate-600">
                        {item.listings.find((l) => l.partNumber)?.partNumber && (
                          <span className="rounded bg-slate-100 px-1.5 py-0.5">
                            #{item.listings.find((l) => l.partNumber)?.partNumber}
                          </span>
                        )}
                        {item.listings.find((l) => l.brand)?.brand && (
                          <span className="max-w-[6rem] truncate rounded bg-slate-100 px-1.5 py-0.5">
                            {item.listings.find((l) => l.brand)?.brand}
                          </span>
                        )}
                      </div>

                      <div className="mt-2 flex flex-col gap-2 border-t border-slate-100 pt-2 sm:flex-row sm:items-end sm:justify-between">
                        <div className="min-w-0">
                          <p className="text-[9px] font-medium uppercase tracking-wide text-slate-400">From</p>
                          <p className="text-base font-bold leading-tight text-slate-900">
                            {formatMoney(item.lowestPrice)}
                          </p>
                          {item.highestPrice !== item.lowestPrice && (
                            <p className="text-[10px] text-slate-500">
                              Up to {formatMoney(item.highestPrice)}
                            </p>
                          )}
                        </div>
                        <div className="flex shrink-0 gap-1.5" onClick={(e) => e.stopPropagation()}>
                          <button
                            type="button"
                            onClick={() => openMarketplaceDetail(item)}
                            className="rounded-lg border border-slate-200 px-2 py-1.5 text-[10px] font-medium text-slate-700 hover:bg-slate-50 sm:text-xs"
                          >
                            {compareOptions ? 'Options' : 'Details'}
                          </button>
                          <button
                            type="button"
                            onClick={() => openRequestForItem(item, null)}
                            className="inline-flex min-h-8 flex-1 items-center justify-center gap-1 rounded-lg bg-indigo-600 px-2 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 sm:flex-initial sm:px-2.5"
                          >
                            <ShoppingCart className="h-3.5 w-3.5" />
                            Request
                          </button>
                        </div>
                      </div>
                    </div>
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}

      {tab === 'my-stock' && canManageStock && (
        <section className="space-y-4">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-slate-900">{resolvedStockLabel}</h2>
              <p className="hidden text-sm text-slate-500 sm:block">
                {resolvedStockLabel === 'Our Stock'
                  ? 'List Computer Dynamics parts here so they appear in the shared marketplace catalog.'
                  : 'Add your available parts here so they appear in the shared marketplace catalog. Enter your unit price — buyers see a platform-adjusted listed price.'}
              </p>
            </div>
            <button
              type="button"
              onClick={openAddListing}
              className="inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
            >
              <Plus className="h-4 w-4" />
              Add listing
            </button>
          </div>

          <div className="rounded-2xl border border-slate-200 bg-white p-3 shadow-sm sm:p-4">
            <form
              className="flex flex-col gap-2 sm:flex-row sm:flex-wrap"
              onSubmit={(e) => {
                e.preventDefault();
                setStockSearch(stockSearchInput);
              }}
            >
              <input
                value={stockSearchInput}
                onChange={(e) => setStockSearchInput(e.target.value)}
                placeholder="Search by item name, part number, or brand..."
                className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2.5 text-sm"
              />
              <button
                type="submit"
                className="min-h-11 w-full rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 sm:w-auto"
              >
                Search
              </button>
            </form>
          </div>

          {!data?.myInventory.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-center shadow-sm">
              <p className="text-sm text-slate-500">You have not listed any parts yet.</p>
              <button
                type="button"
                onClick={openAddListing}
                className="mt-4 inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800"
              >
                <Plus className="h-4 w-4" />
                Add listing
              </button>
            </div>
          ) : !filteredInventory.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No stock listings match your search.
            </div>
          ) : (
            <>
              <div className="space-y-3 sm:hidden">
                {filteredInventory.map((listing) => {
                  const listingImages = listingImageUrls(listing);
                  return (
                  <article
                    key={listing.id}
                    className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
                  >
                    <div className="flex items-start justify-between gap-3">
                      <StockListingThumbnail urls={listingImages} />
                      <div className="min-w-0 flex-1">
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">{listing.itemName}</p>
                          <span className="rounded-md bg-slate-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                            {PARTS_CONDITION_LABELS[listing.itemCondition]}
                          </span>
                          {listingImages.length > 1 && (
                            <span className="text-[10px] text-slate-500">
                              {listingImages.length} photos
                            </span>
                          )}
                        </div>
                        {listing.notes && <p className="mt-1 text-xs text-slate-500">{listing.notes}</p>}
                      </div>
                      <div className="flex shrink-0 gap-1">
                        <button
                          type="button"
                          onClick={() => beginEdit(listing)}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                          title="Edit listing"
                        >
                          <Pencil className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => void deleteListing(listing.id)}
                          disabled={submitting === `delete-${listing.id}`}
                          className="inline-flex min-h-10 min-w-10 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                          title="Delete listing"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </div>
                    <dl className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-xs text-slate-600">
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Part #</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">{listing.partNumber ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Brand</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">{listing.brand ?? '—'}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Your price</dt>
                        <dd className="mt-0.5 font-medium text-slate-900">{formatMoney(listing.unitPrice)}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Listed</dt>
                        <dd className="mt-0.5 font-medium text-indigo-700">
                          {formatMoney(listing.listedUnitPrice ?? listing.unitPrice)}
                        </dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Qty</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">{listing.quantity}</dd>
                      </div>
                      <div>
                        <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-400">Available</dt>
                        <dd className="mt-0.5 font-medium text-slate-800">{listing.availableQuantity}</dd>
                      </div>
                    </dl>
                    <p className="mt-3 text-[11px] text-slate-500">Updated {formatDate(listing.updatedAt)}</p>
                  </article>
                  );
                })}
              </div>
              <div className="hidden overflow-x-auto rounded-2xl border border-slate-200 bg-white shadow-sm sm:block">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-100 bg-slate-50/80">
                    {['Photo', 'Item', 'Condition', 'Part #', 'Brand', 'Your price', 'Listed price', 'Qty', 'Available', 'Updated', ''].map(
                      (heading) => (
                      <th key={heading || 'actions'} className="px-4 py-3 font-semibold text-slate-600">
                        {heading}
                      </th>
                    )
                    )}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredInventory.map((listing) => {
                    const listingImages = listingImageUrls(listing);
                    const thumb = listingImages[0];
                    return (
                    <tr key={listing.id} className="hover:bg-slate-50/50">
                      <td className="px-4 py-3">
                        <StockListingThumbnail urls={listingImages} size="sm" />
                      </td>
                      <td className="px-4 py-3">
                        <p className="font-medium text-slate-900">{listing.itemName}</p>
                        {listing.notes && <p className="text-xs text-slate-500">{listing.notes}</p>}
                        {listingImages.length > 1 && (
                          <p className="text-[11px] text-slate-500">
                            {listingImages.length} photos
                          </p>
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {PARTS_CONDITION_LABELS[listing.itemCondition]}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{listing.partNumber ?? '—'}</td>
                      <td className="px-4 py-3 text-slate-600">{listing.brand ?? '—'}</td>
                      <td className="px-4 py-3 font-medium text-slate-900">{formatMoney(listing.unitPrice)}</td>
                      <td className="px-4 py-3 font-medium text-indigo-700">
                        {formatMoney(listing.listedUnitPrice ?? listing.unitPrice)}
                      </td>
                      <td className="px-4 py-3 text-slate-600">{listing.quantity}</td>
                      <td className="px-4 py-3 text-slate-600">{listing.availableQuantity}</td>
                      <td className="px-4 py-3 text-slate-600">{formatDate(listing.updatedAt)}</td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            type="button"
                            onClick={() => beginEdit(listing)}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-slate-200 text-slate-700 hover:bg-slate-50"
                            title="Edit listing"
                          >
                            <Pencil className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => void deleteListing(listing.id)}
                            disabled={submitting === `delete-${listing.id}`}
                            className="inline-flex h-8 w-8 items-center justify-center rounded-lg border border-red-200 text-red-700 hover:bg-red-50 disabled:opacity-60"
                            title="Delete listing"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </>
          )}
        </section>
      )}

      {tab === 'outgoing' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Outgoing Requests</h2>
            <p className="hidden text-sm text-slate-500 sm:block">
              {data?.viewer.role === 'client'
                ? 'Requests you placed through the catalog remain platform-managed. Use Request cancel if you need staff to cancel one.'
                : 'Your outgoing requests plus client cancel requests waiting for confirmation. Cancel releases reserved stock.'}
            </p>
          </div>
          {!activeOutgoing.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No active outgoing requests.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {activeOutgoing.map((request) => (
                <article key={request.id} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{request.itemName}</h3>
                      <p className="text-sm text-slate-500">Request {request.requestNumber}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {request.billing?.paymentUnpaid &&
                        (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                          <span title="Payment not received">
                            <AlertTriangle
                              className="h-10 w-10 text-amber-500"
                              strokeWidth={2.5}
                              aria-label="Payment not received"
                            />
                          </span>
                        )}
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(request.status)}`}
                      >
                        {formatRequestStatus(request.status)}
                      </span>
                    </div>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>Quantity: {request.requestedQuantity}</p>
                    <p>Parts: {formatMoney(Number(request.partsSubtotal ?? partsSubtotal(request)))}</p>
                    <p>
                      Delivery:{' '}
                      {formatMoney(
                        Number(
                          request.deliveryFee ??
                            deliveryFeeForDisplay(request, data?.requests.outgoing ?? [])
                        )
                      )}
                    </p>
                    <p className="font-medium text-slate-800">
                      Full total:{' '}
                      {formatMoney(
                        Number(request.partsSubtotal ?? partsSubtotal(request)) +
                          Number(
                            request.deliveryFee ??
                              deliveryFeeForDisplay(request, data?.requests.outgoing ?? [])
                          )
                      )}
                    </p>
                    <p>Created: {formatDate(request.createdAt)}</p>
                    <p>Fulfillment: Platform routed</p>
                    {(request.status === 'pending_delivery' ||
                      request.status === 'out_for_delivery') && (
                      <p className="sm:col-span-2 font-medium text-sky-800">
                        ETA:{' '}
                        {request.deliveryEtaLabel ||
                          (request.deliveryEtaMinutes != null
                            ? `~${request.deliveryEtaMinutes} min drive`
                            : 'Calculating / unavailable')}
                      </p>
                    )}
                  </div>
                  {request.billing?.paymentUnpaid && (
                    <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 px-3 py-3 text-sm text-amber-950">
                      <p className="font-semibold">Payment required</p>
                      <p className="mt-1 text-amber-900/80">
                        {request.billing.billingStatus === 'quoted'
                          ? 'Accept the quote, then pay online (WiPay) or arrange cash with staff.'
                          : 'Invoice ready — pay online (WiPay) or arrange cash with staff.'}
                        {request.billing.quoteNumber ? ` Quote ${request.billing.quoteNumber}.` : ''}
                        {request.billing.invoiceNumber
                          ? ` Invoice ${request.billing.invoiceNumber}.`
                          : ''}
                        {request.billing.amountDue != null
                          ? ` Amount due: ${formatMoney(request.billing.amountDue)}.`
                          : ''}
                      </p>
                      <p className="mt-1 text-xs text-amber-900/60">
                        {request.billing.codRequested
                          ? 'COD requested — pay cash on delivery. Staff will confirm when they collect.'
                          : 'Or choose cash on delivery (COD) and pay when the order arrives.'}
                      </p>
                      <div className="mt-3 flex flex-wrap gap-2">
                        {data?.viewer.role === 'client' &&
                          request.billing.billingStatus === 'quoted' &&
                          request.deliveryPackageId && (
                            <button
                              type="button"
                              disabled={submitting === `accept-quote:${request.deliveryPackageId}`}
                              onClick={() => void acceptPackageQuote(request.deliveryPackageId!)}
                              className="rounded-xl bg-amber-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-amber-700 disabled:opacity-60"
                            >
                              {submitting === `accept-quote:${request.deliveryPackageId}`
                                ? 'Accepting…'
                                : 'Accept quote'}
                            </button>
                          )}
                        {data?.viewer.role === 'client' &&
                          request.billing.billingStatus === 'awaiting_payment' &&
                          !request.billing.codRequested &&
                          request.deliveryPackageId && (
                            <button
                              type="button"
                              disabled={submitting === `pay:${request.deliveryPackageId}`}
                              onClick={() => void payPackageOnline(request.deliveryPackageId!)}
                              className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {submitting === `pay:${request.deliveryPackageId}`
                                ? 'Opening…'
                                : 'Pay online (WiPay)'}
                            </button>
                          )}
                        {data?.viewer.role === 'client' &&
                          request.billing.paymentUnpaid &&
                          !request.billing.codRequested &&
                          request.deliveryPackageId && (
                            <button
                              type="button"
                              disabled={submitting === `cod:${request.deliveryPackageId}`}
                              onClick={() => void requestPackageCod(request.deliveryPackageId!)}
                              className="rounded-xl border border-amber-400 bg-white px-3 py-1.5 text-sm font-semibold text-amber-950 hover:bg-amber-100 disabled:opacity-60"
                            >
                              {submitting === `cod:${request.deliveryPackageId}`
                                ? 'Saving…'
                                : 'Pay cash on delivery (COD)'}
                            </button>
                          )}
                        {data?.viewer.role === 'client' && request.billing.codRequested && (
                          <span className="rounded-xl border border-amber-300 bg-amber-100 px-3 py-1.5 text-sm font-medium text-amber-950">
                            COD selected
                          </span>
                        )}
                        {(data?.viewer.role === 'admin' || data?.viewer.role === 'technician') &&
                          request.deliveryPackageId && (
                            <button
                              type="button"
                              disabled={submitting === `cash:${request.deliveryPackageId}`}
                              onClick={() => void markPackageCashPaid(request.deliveryPackageId!)}
                              className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                            >
                              {submitting === `cash:${request.deliveryPackageId}`
                                ? 'Saving…'
                                : request.billing.codRequested
                                  ? 'Confirm COD payment'
                                  : 'Mark cash paid (COD)'}
                            </button>
                          )}
                      </div>
                    </div>
                  )}
                  {request.notes && <p className="mt-3 text-sm text-slate-500">{request.notes}</p>}
                  {request.buyerDisplayName &&
                    (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                      <p className="mt-2 text-xs text-slate-500">Buyer: {request.buyerDisplayName}</p>
                    )}
                  <div className="mt-4 flex flex-wrap gap-2">
                    {(request.status === 'pending' || request.status === 'pending_delivery') &&
                      data?.viewer.role === 'client' && (
                      <button
                        type="button"
                        disabled={submitting === `cancel:${request.requestNumber}`}
                        onClick={() => void cancelOutgoingRequest(request.requestNumber, 'request_cancel')}
                        className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-1.5 text-sm font-medium text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                      >
                        Request cancel
                      </button>
                    )}
                    {(request.status === 'pending' || request.status === 'pending_delivery') &&
                      (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                        <button
                          type="button"
                          disabled={submitting === `cancel:${request.requestNumber}`}
                          onClick={() => void cancelOutgoingRequest(request.requestNumber, 'cancel')}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Cancel request
                        </button>
                      )}
                    {request.status === 'cancel_requested' &&
                      (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                        <button
                          type="button"
                          disabled={submitting === `cancel:${request.requestNumber}`}
                          onClick={() => void cancelOutgoingRequest(request.requestNumber, 'cancel')}
                          className="rounded-xl border border-rose-200 bg-rose-50 px-3 py-1.5 text-sm font-medium text-rose-800 hover:bg-rose-100 disabled:opacity-60"
                        >
                          Confirm cancel
                        </button>
                      )}
                    {request.status === 'cancel_requested' && data?.viewer.role === 'client' && (
                      <p className="text-sm text-amber-700">Waiting for staff to confirm cancellation.</p>
                    )}
                    {request.status === 'pending_delivery' && !request.billing?.paymentUnpaid && (
                      <p className="text-sm text-indigo-700">
                        Ready for delivery — Computer Dynamics is handling logistics to your shop.
                      </p>
                    )}
                    {request.status === 'out_for_delivery' && (
                      <div className="flex flex-wrap items-center gap-3">
                        <button
                          type="button"
                          disabled={submitting === `receive:${request.requestNumber}`}
                          onClick={() => void receiveOutgoingRequest(request.requestNumber)}
                          className="rounded-xl bg-sky-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-sky-700 disabled:opacity-60"
                        >
                          {submitting === `receive:${request.requestNumber}` ? 'Confirming…' : 'Receive'}
                        </button>
                        {(data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                          <button
                            type="button"
                            disabled={submitting === `deliver:${request.requestNumber}`}
                            onClick={() => void markDeliveredAsAdmin(request.requestNumber)}
                            className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:opacity-60"
                          >
                            {submitting === `deliver:${request.requestNumber}`
                              ? 'Marking…'
                              : 'Mark delivered'}
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'incoming' && canManageStock && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Incoming Requests</h2>
            <p className="hidden text-sm text-slate-500 sm:block">
              {data?.viewer.role === 'client'
                ? 'Fulfill pending requests from your stock. Mark orders ready — Computer Dynamics collects from your shop and delivers to the buyer.'
                : 'Fulfill seller orders, then collect from suppliers and run delivery to buyers.'}
            </p>
          </div>
          {pendingVerificationReviewCount > 0 &&
            (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
              <div className="rounded-xl border border-indigo-200 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
                <span className="font-semibold">{pendingVerificationReviewCount}</span> incoming
                request{pendingVerificationReviewCount === 1 ? '' : 's'} need verification review
                (accept, deny, or skip) before fulfillment can continue.
              </div>
            )}
          {!activeIncoming.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No active incoming requests.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {activeIncoming.map((request) => (
                <article
                  key={request.id}
                  className={`rounded-2xl border bg-white p-4 shadow-sm sm:p-5 ${
                    request.billing?.paymentUnpaid
                      ? 'border-amber-300 ring-1 ring-amber-200'
                      : 'border-slate-200'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{request.itemName}</h3>
                      <p className="text-sm text-slate-500">Request {request.requestNumber}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2">
                      {request.billing?.paymentUnpaid &&
                        (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                          <AlertTriangle
                            className="h-10 w-10 shrink-0 text-amber-500"
                            strokeWidth={2.5}
                            aria-label="Payment not received"
                          />
                        )}
                      <span
                        className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(request.status)}`}
                      >
                        {formatRequestStatus(request.status)}
                      </span>
                    </div>
                  </div>
                  {request.billing?.paymentUnpaid &&
                    (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                      <div className="mt-3 flex flex-wrap items-center gap-2 rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                        <span className="font-semibold">
                          {request.billing.codRequested ? 'COD requested — payment not received' : 'Payment not received'}
                        </span>
                        {request.billing.amountDue != null && (
                          <span>Due {formatMoney(request.billing.amountDue)}</span>
                        )}
                        {request.deliveryPackageId && (
                          <button
                            type="button"
                            disabled={submitting === `cash:${request.deliveryPackageId}`}
                            onClick={() => void markPackageCashPaid(request.deliveryPackageId!)}
                            className="rounded-lg border border-amber-300 bg-white px-2.5 py-1 text-xs font-semibold text-amber-900 hover:bg-amber-100 disabled:opacity-60"
                          >
                            {submitting === `cash:${request.deliveryPackageId}`
                              ? 'Saving…'
                              : request.billing.codRequested
                                ? 'Confirm COD payment'
                                : 'Mark cash paid (COD)'}
                          </button>
                        )}
                      </div>
                    )}
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>Buyer: {request.buyerName ?? request.buyerDisplayName}</p>
                    <p>Quantity: {request.requestedQuantity}</p>
                    <p>Created: {formatDate(request.createdAt)}</p>
                    <p>Unit price: {formatMoney(request.unitPrice)}</p>
                    {(data?.viewer.role === 'admin' || data?.viewer.role === 'technician') &&
                      request.supplierName && (
                        <p className="sm:col-span-2">
                          Seller stock: {request.supplierName}
                        </p>
                      )}
                  </div>
                  {request.notes && <p className="mt-3 text-sm text-slate-500">{request.notes}</p>}
                  {request.verificationStatus && request.verificationStatus !== 'none' && (
                    <div className="mt-4 space-y-3 rounded-xl border border-violet-200 bg-violet-50/80 p-3 text-sm text-violet-950">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="font-medium">
                          {VERIFICATION_STATUS_LABELS[request.verificationStatus]}
                        </p>
                        {request.itemCategory === 'full_devices' && (
                          <span className="rounded-full bg-violet-200/80 px-2 py-0.5 text-[11px] font-semibold">
                            Full device
                          </span>
                        )}
                      </div>
                      {request.verificationNotes && (
                        <p className="text-xs text-violet-900/80">{request.verificationNotes}</p>
                      )}
                      {request.verificationVideoFile && (
                        <a
                          href={partsCatalogMediaUrl(request.verificationVideoFile, 'video') ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-xs font-semibold text-indigo-700 underline underline-offset-2"
                        >
                          <Video className="h-3.5 w-3.5" />
                          View verification video
                        </a>
                      )}
                      {(data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                        <div className="flex flex-wrap gap-2">
                          {request.verificationStatus === 'pending_review' && (
                            <>
                              <button
                                type="button"
                                disabled={!!submitting}
                                onClick={() => void reviewRequestVerification(request.id, 'accept')}
                                className="rounded-lg bg-emerald-600 px-2.5 py-1 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                              >
                                Accept
                              </button>
                              <button
                                type="button"
                                disabled={!!submitting}
                                onClick={() => void reviewRequestVerification(request.id, 'deny')}
                                className="rounded-lg border border-red-300 bg-white px-2.5 py-1 text-xs font-semibold text-red-800 hover:bg-red-50 disabled:opacity-60"
                              >
                                Deny
                              </button>
                              <button
                                type="button"
                                disabled={!!submitting}
                                onClick={() => void reviewRequestVerification(request.id, 'skip')}
                                className="rounded-lg border border-violet-300 bg-white px-2.5 py-1 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
                              >
                                Skip
                              </button>
                            </>
                          )}
                        </div>
                      )}
                      {data?.viewer.role === 'client' &&
                        request.verificationStatus === 'awaiting_seller' && (
                          <div className="space-y-2">
                            <p className="text-xs text-violet-900/90">
                              Upload a short video showing the item works (power on / basic function).
                            </p>
                            <input
                              type="file"
                              accept="video/*"
                              disabled={verificationUploadingId === request.id}
                              onChange={(e) => {
                                const file = e.target.files?.[0];
                                if (file) void submitSellerVerificationVideo(request.id, file);
                                e.target.value = '';
                              }}
                              className="block w-full text-xs text-violet-900 file:mr-2 file:rounded-lg file:border-0 file:bg-violet-700 file:px-2 file:py-1 file:text-xs file:font-semibold file:text-white"
                            />
                            {verificationUploadingId === request.id && (
                              <p className="text-xs text-violet-800/80">Uploading video…</p>
                            )}
                          </div>
                        )}
                      {request.status === 'pending' &&
                        !fulfillmentVerificationClear(request.verificationStatus) && (
                          <p className="text-xs font-medium text-amber-900">
                            Fulfillment is blocked until verification is resolved.
                          </p>
                        )}
                    </div>
                  )}
                  {(data?.viewer.role === 'admin' || data?.viewer.role === 'technician') &&
                    request.status === 'pending' &&
                    (!request.verificationStatus || request.verificationStatus === 'none') && (
                      <div className="mt-3">
                        <button
                          type="button"
                          disabled={!!submitting}
                          onClick={() => void requestSellerVerification(request.id)}
                          className="text-xs font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:opacity-60"
                        >
                          Request verification from seller
                        </button>
                      </div>
                    )}
                  {data?.viewer.role !== 'client' && request.routeEditor && (
                    <div className="mt-4 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-700">
                          {request.routeEditor.hidden ? (
                            <span className="text-slate-500">Route removed from this card</span>
                          ) : (
                            <>
                              <span className="inline-flex items-center gap-1.5 font-medium">
                                <MapPin className="h-4 w-4 text-indigo-600" />
                                {request.fulfillmentRoute?.distanceLabel ?? 'Distance unavailable'}
                              </span>
                              {request.fulfillmentRoute?.travelMinutes != null && (
                                <span>~{request.fulfillmentRoute.travelMinutes} min drive</span>
                              )}
                            </>
                          )}
                        </div>
                        <button
                          type="button"
                          title="Edit route"
                          onClick={() =>
                            routeEditId === request.id ? setRouteEditId(null) : openRouteEditor(request)
                          }
                          className="rounded-lg border border-slate-200 bg-white p-1.5 text-slate-600 hover:bg-slate-100"
                        >
                          {routeEditId === request.id ? (
                            <X className="h-4 w-4" />
                          ) : (
                            <Pencil className="h-4 w-4" />
                          )}
                        </button>
                      </div>

                      {request.fulfillmentRoute?.approximate && request.fulfillmentRoute.staffNotice && (
                        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-900">
                          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <div>
                            <p className="font-medium">Approximate location</p>
                            <p className="mt-0.5 opacity-90">{request.fulfillmentRoute.staffNotice}</p>
                            {routeEditId !== request.id && (
                              <button
                                type="button"
                                onClick={() => openRouteEditor(request)}
                                className="mt-1.5 font-medium text-amber-950 underline underline-offset-2 hover:no-underline"
                              >
                                Edit route manually
                              </button>
                            )}
                          </div>
                        </div>
                      )}

                      {routeEditId === request.id ? (
                        <div className="space-y-3 rounded-lg border border-slate-200 bg-white p-3">
                          <p className="text-xs text-slate-500">
                            Edit From / To (address or lat,lon), then recalculate with OSRM. Or remove the
                            route from this card.
                          </p>
                          <label className="block text-xs font-medium text-slate-600">
                            From
                            <textarea
                              rows={2}
                              value={routeEditFrom}
                              onChange={(e) => setRouteEditFrom(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                              placeholder="Company address or 10.66,-61.52"
                            />
                          </label>
                          <label className="block text-xs font-medium text-slate-600">
                            To
                            <textarea
                              rows={2}
                              value={routeEditTo}
                              onChange={(e) => setRouteEditTo(e.target.value)}
                              className="mt-1 w-full rounded-lg border border-slate-200 px-3 py-2 text-sm text-slate-800"
                              placeholder="Buyer address or lat,lon"
                            />
                          </label>
                          <div className="flex flex-wrap gap-2">
                            <button
                              type="button"
                              disabled={
                                submitting === `route:${request.id}:update` ||
                                !routeEditFrom.trim() ||
                                !routeEditTo.trim()
                              }
                              onClick={() =>
                                void submitRouteAction(
                                  request.id,
                                  'update',
                                  routeEditFrom.trim(),
                                  routeEditTo.trim()
                                )
                              }
                              className="rounded-lg bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                            >
                              {submitting === `route:${request.id}:update`
                                ? 'Recalculating…'
                                : 'Recalculate OSRM'}
                            </button>
                            <button
                              type="button"
                              disabled={submitting === `route:${request.id}:reset`}
                              onClick={() => void submitRouteAction(request.id, 'reset')}
                              className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              Reset defaults
                            </button>
                            <button
                              type="button"
                              disabled={submitting === `route:${request.id}:remove`}
                              onClick={() => void submitRouteAction(request.id, 'remove')}
                              className="rounded-lg border border-rose-200 px-3 py-1.5 text-sm font-medium text-rose-700 hover:bg-rose-50 disabled:opacity-60"
                            >
                              Remove route
                            </button>
                          </div>
                        </div>
                      ) : (
                        !request.routeEditor.hidden &&
                        request.fulfillmentRoute && (
                          <>
                            {(request.fulfillmentRoute.fromAddress ||
                              request.fulfillmentRoute.toAddress) && (
                              <div className="space-y-1 text-xs text-slate-500">
                                {request.fulfillmentRoute.fromAddress && (
                                  <p>
                                    <span className="font-medium text-slate-600">From:</span>{' '}
                                    {request.fulfillmentRoute.fromAddress}
                                  </p>
                                )}
                                {request.fulfillmentRoute.toAddress && (
                                  <p>
                                    <span className="font-medium text-slate-600">To:</span>{' '}
                                    {request.fulfillmentRoute.toAddress}
                                  </p>
                                )}
                              </div>
                            )}
                            {request.fulfillmentRoute.mapEmbedUrl && (
                              <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                                <iframe
                                  title={`Directions for ${request.requestNumber}`}
                                  src={request.fulfillmentRoute.mapEmbedUrl}
                                  className="h-48 w-full border-0"
                                  loading="lazy"
                                  referrerPolicy="no-referrer-when-downgrade"
                                />
                              </div>
                            )}
                            {request.fulfillmentRoute.directionsUrl && (
                              <a
                                href={request.fulfillmentRoute.directionsUrl}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                              >
                                Open turn-by-turn directions
                                <ExternalLink className="h-3.5 w-3.5" />
                              </a>
                            )}
                          </>
                        )
                      )}
                    </div>
                  )}
                  {request.status === 'pending' && (
                    <div className="mt-4">
                      <button
                        type="button"
                        disabled={
                          submitting === `fulfill:${request.id}` ||
                          fulfillModal?.requestId === request.id ||
                          !fulfillmentVerificationClear(request.verificationStatus)
                        }
                        onClick={() => void openFulfillModal(request)}
                        className="rounded-xl bg-emerald-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
                      >
                        {fulfillModal?.requestId === request.id && fulfillModal.loading
                          ? 'Loading…'
                          : 'Fulfill'}
                      </button>
                    </div>
                  )}
                  {(request.status === 'pending_delivery' ||
                    request.status === 'out_for_delivery') &&
                    data?.viewer.role === 'client' && (
                      <p className="mt-3 text-sm text-indigo-700">
                        {request.status === 'pending_delivery'
                          ? 'Fulfilled — Computer Dynamics is collecting and delivering.'
                          : 'Out for delivery — waiting for the buyer to confirm Receive.'}
                      </p>
                    )}
                  {(request.status === 'pending_delivery' || request.status === 'out_for_delivery') &&
                    (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                    <div className="mt-3 space-y-2">
                      <div className="flex flex-wrap items-center gap-2 text-sm text-slate-600">
                        <span>
                          Delivery fee:{' '}
                          {formatMoney(
                            deliveryFeeForDisplay(request, data?.requests.incoming ?? [])
                          )}
                          {lineDeliveryFee(request) === 0 && request.deliveryPackageId
                            ? ' (shared package)'
                            : ''}
                        </span>
                        {deliveryEditId !== request.id ? (
                          <button
                            type="button"
                            onClick={() =>
                              openDeliveryFeeEditor(request, data?.requests.incoming ?? [])
                            }
                            className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
                          >
                            Edit delivery
                          </button>
                        ) : null}
                      </div>
                      {deliveryEditId === request.id && (
                        <div className="flex flex-wrap items-end gap-2">
                          <label className="text-xs font-medium text-slate-600">
                            Delivery fee ($)
                            <input
                              type="number"
                              min={0}
                              step={1}
                              value={deliveryEditFee}
                              onChange={(e) => setDeliveryEditFee(e.target.value)}
                              className="mt-1 block w-28 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-800"
                            />
                          </label>
                          <button
                            type="button"
                            disabled={submitting === `delivery-fee:${request.id}`}
                            onClick={() => void saveDeliveryFee(request.id)}
                            className="rounded-xl bg-slate-800 px-3 py-1.5 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-60"
                          >
                            {submitting === `delivery-fee:${request.id}` ? 'Saving…' : 'Save'}
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeliveryEditId(null)}
                            className="rounded-xl border border-slate-200 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Cancel
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                  {request.status === 'pending_delivery' &&
                    (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                    <div className="mt-4 flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={submitting === `pickup:${request.id}`}
                        onClick={() => void pickupIncomingRequest(request.id, request.requestNumber)}
                        className="rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
                      >
                        {submitting === `pickup:${request.id}` ? 'Marking…' : 'Mark collected'}
                      </button>
                      <p className="text-sm text-indigo-700">Pending delivery — mark collected when CD picks up from the seller.</p>
                    </div>
                  )}
                  {request.status === 'out_for_delivery' &&
                    (data?.viewer.role === 'admin' || data?.viewer.role === 'technician') && (
                    <div className="mt-3 space-y-1">
                      <p className="text-sm text-sky-700">
                        Out for delivery — waiting for the buyer to confirm Receive.
                      </p>
                      <button
                        type="button"
                        disabled={submitting === `deliver:${request.requestNumber}`}
                        onClick={() => void markDeliveredAsAdmin(request.requestNumber)}
                        className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900 disabled:opacity-60"
                      >
                        {submitting === `deliver:${request.requestNumber}`
                          ? 'Marking…'
                          : 'Mark delivered'}
                      </button>
                    </div>
                  )}
                  {request.status === 'cancel_requested' && (
                    <p className="mt-3 text-sm text-amber-700">
                      Buyer requested cancellation — wait for staff to confirm. Do not release the part
                      until this is resolved.
                    </p>
                  )}
                </article>
              ))}
            </div>
          )}
        </section>
      )}

      {tab === 'history' && (
        <section className="space-y-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Request history</h2>
            <p className="hidden text-sm text-slate-500 sm:block">
              Fulfilled and cancelled requests from outgoing and incoming.
            </p>
          </div>
          {!historyRequests.length ? (
            <div className="rounded-2xl border border-dashed border-slate-300 bg-white p-8 text-sm text-slate-500 shadow-sm">
              No fulfilled or cancelled requests yet.
            </div>
          ) : (
            <div className="grid gap-4 lg:grid-cols-2">
              {historyRequests.map((request) => {
                const timeline = buildHistoryTimeline(request);
                return (
                <article key={`${request.source}-${request.id}`} className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-5">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <h3 className="font-semibold text-slate-900">{request.itemName}</h3>
                      <p className="text-sm text-slate-500">
                        Request {request.requestNumber} · {request.source}
                      </p>
                    </div>
                    <span
                      className={`rounded-full px-3 py-1 text-xs font-medium capitalize ${statusBadgeClass(request.status)}`}
                    >
                      {formatRequestStatus(request.status)}
                    </span>
                  </div>
                  <div className="mt-4 grid gap-2 text-sm text-slate-600 sm:grid-cols-2">
                    <p>Quantity: {request.requestedQuantity}</p>
                    <p>Created: {formatDate(request.createdAt)}</p>
                    {(request.buyerName || request.buyerDisplayName) && (
                      <p>Buyer: {request.buyerName ?? request.buyerDisplayName}</p>
                    )}
                    <p>
                      Parts:{' '}
                      {formatMoney(
                        Number(
                          (request as PartRequestView & { partsSubtotal?: number }).partsSubtotal ??
                            partsSubtotal(request)
                        )
                      )}
                    </p>
                    <p>
                      Delivery:{' '}
                      {formatMoney(
                        Number(
                          (request as PartRequestView & { deliveryFee?: number }).deliveryFee ??
                            deliveryFeeForDisplay(request, [
                              ...(data?.requests.outgoing ?? []),
                              ...(data?.requests.incoming ?? []),
                            ])
                        )
                      )}
                    </p>
                    <p className="font-medium text-slate-800 sm:col-span-2">
                      Client total:{' '}
                      {formatMoney(
                        Number(
                          (request as PartRequestView & { partsSubtotal?: number }).partsSubtotal ??
                            partsSubtotal(request)
                        ) +
                          Number(
                            (request as PartRequestView & { deliveryFee?: number }).deliveryFee ??
                              deliveryFeeForDisplay(request, [
                                ...(data?.requests.outgoing ?? []),
                                ...(data?.requests.incoming ?? []),
                              ])
                          )
                      )}
                    </p>
                    {data?.viewer.role !== 'client' &&
                      Number(request.unitPrice) > 0 &&
                      Number(request.listedUnitPrice) > 0 &&
                      Number(request.unitPrice) !== Number(request.listedUnitPrice) && (
                        <p className="text-xs text-slate-500 sm:col-span-2">
                          Stock unit price: {formatMoney(request.unitPrice)} · Listed:{' '}
                          {formatMoney(Number(request.listedUnitPrice))}
                        </p>
                      )}
                    {request.deliveryEtaLabel && (
                      <p className="sm:col-span-2">Travel ETA at fulfill: {request.deliveryEtaLabel}</p>
                    )}
                  </div>

                  {timeline.length > 0 && (
                    <ol className="mt-4 space-y-2 border-t border-slate-100 pt-4">
                      {timeline.map((step, index) => (
                        <li key={step.key} className="flex gap-3 text-sm">
                          <span className="mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-slate-100 text-[10px] font-semibold text-slate-600">
                            {index + 1}
                          </span>
                          <div className="min-w-0">
                            <p className="font-medium text-slate-800">{step.label}</p>
                            <p className="text-xs text-slate-500">{formatDate(step.at)}</p>
                          </div>
                        </li>
                      ))}
                    </ol>
                  )}

                  {(request.deliveryFromAddress ||
                    request.deliveryToAddress ||
                    request.deliveryMapEmbedUrl) && (
                    <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-3">
                      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                        Delivery location
                      </p>
                      {request.deliveryFromAddress && (
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-slate-500">From:</span>{' '}
                          {request.deliveryFromAddress}
                        </p>
                      )}
                      {request.deliveryToAddress && (
                        <p className="text-sm text-slate-700">
                          <span className="font-medium text-slate-500">To:</span>{' '}
                          {request.deliveryToAddress}
                        </p>
                      )}
                      {request.deliveryMapEmbedUrl && (
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <iframe
                            title={`Delivery map ${request.requestNumber}`}
                            src={request.deliveryMapEmbedUrl}
                            className="h-44 w-full"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                      )}
                      {request.deliveryDirectionsUrl && (
                        <a
                          href={request.deliveryDirectionsUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800"
                        >
                          Open directions
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  )}
                </article>
                );
              })}
            </div>
          )}
        </section>
      )}
      </div>

      {stockModalOpen && (
        <div className={PARTS_MODAL_BACKDROP}>
          <div className={`${PARTS_MODAL_PANEL} max-w-2xl`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">
                  {stockForm.id ? 'Edit listing' : 'Add listing'}
                </h2>
                <p className="mt-1 text-sm text-slate-500">
                  {stockForm.id
                    ? 'Update this stock listing, then save.'
                    : 'Enter your unit price — buyers see a platform-adjusted listed price.'}
                </p>
              </div>
              <button
                type="button"
                onClick={closeStockModal}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-3 sm:grid-cols-2">
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">Category</span>
                <select
                  value={stockForm.category}
                  onChange={(e) => {
                    const category = normalizePartsCategory(e.target.value);
                    setStockForm((prev) => ({
                      ...prev,
                      category,
                      requiresVerification: categoryRequiresVideoVerification(category)
                        ? true
                        : prev.requiresVerification,
                    }));
                  }}
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                >
                  {PARTS_LISTING_CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>
                      {PARTS_CATEGORY_LABELS[cat]}
                    </option>
                  ))}
                </select>
                {categoryRequiresVideoVerification(stockForm.category) && (
                  <span className="mt-1 block text-xs text-amber-800">
                    Full devices must include a short video proving the device powers on and works.
                  </span>
                )}
              </label>

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Condition <span className="text-red-600">*</span>
                </span>
                <select
                  value={stockForm.itemCondition}
                  onChange={(e) =>
                    setStockForm((prev) => ({
                      ...prev,
                      itemCondition: normalizeItemCondition(e.target.value),
                    }))
                  }
                  className="w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm"
                  required
                >
                  {PARTS_ITEM_CONDITIONS.map((condition) => (
                    <option key={condition} value={condition}>
                      {PARTS_CONDITION_LABELS[condition]}
                    </option>
                  ))}
                </select>
              </label>

              <div className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Product photos{' '}
                  <span className="font-normal text-slate-400">
                    (optional, up to {MAX_PARTS_LISTING_IMAGES})
                  </span>
                </span>
                {stockForm.imageFiles.length > 0 && (
                  <div className="mb-3 flex flex-wrap gap-2">
                    {stockForm.imageFiles.map((fileName) => (
                      <div
                        key={fileName}
                        className="relative h-20 w-20 overflow-hidden rounded-lg border border-slate-200"
                      >
                        <img
                          src={partsCatalogMediaUrl(fileName, 'image') ?? ''}
                          alt=""
                          className="h-full w-full object-cover"
                        />
                        <button
                          type="button"
                          onClick={() => removeStockImage(fileName)}
                          className="absolute right-0.5 top-0.5 rounded bg-black/60 px-1 text-[10px] font-medium text-white"
                        >
                          ×
                        </button>
                      </div>
                    ))}
                  </div>
                )}
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  disabled={
                    mediaUploading === 'image' ||
                    stockForm.imageFiles.length >= MAX_PARTS_LISTING_IMAGES
                  }
                  onChange={(e) => {
                    void handleStockImagesPick(e.target.files);
                    e.target.value = '';
                  }}
                  className="block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-slate-900 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                />
                {mediaUploading === 'image' && (
                  <p className="mt-1 text-xs text-slate-500">Uploading photos…</p>
                )}
              </div>

              {(categoryRequiresVideoVerification(stockForm.category) ||
                stockForm.requiresVerification) && (
                <div className="block sm:col-span-2">
                  <span className="mb-1 flex items-center gap-2 text-sm font-medium text-slate-700">
                    <Video className="h-4 w-4 text-indigo-600" />
                    Working-condition video
                    {categoryRequiresVideoVerification(stockForm.category) ? ' (required)' : ''}
                  </span>
                  <input
                    type="file"
                    accept="video/*"
                    disabled={mediaUploading === 'video'}
                    onChange={(e) => void handleStockVideoPick(e.target.files?.[0] ?? null)}
                    className="mt-1 block w-full text-sm text-slate-600 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-600 file:px-3 file:py-2 file:text-sm file:font-medium file:text-white"
                  />
                  {stockForm.verificationVideoFile && (
                    <p className="mt-2 text-xs text-emerald-700">Video uploaded and ready to save.</p>
                  )}
                  {mediaUploading === 'video' && (
                    <p className="mt-1 text-xs text-slate-500">Uploading video…</p>
                  )}
                </div>
              )}

              {!categoryRequiresVideoVerification(stockForm.category) && (
                <label className="flex items-start gap-3 sm:col-span-2">
                  <input
                    type="checkbox"
                    checked={stockForm.requiresVerification}
                    onChange={(e) =>
                      setStockForm((prev) => ({
                        ...prev,
                        requiresVerification: e.target.checked,
                      }))
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300"
                  />
                  <span className="text-sm text-slate-600">
                    <span className="font-medium text-slate-800">Requires verification</span>
                    <span className="mt-0.5 block text-xs text-slate-500">
                      Flag this listing for extra checks before fulfillment (optional video above).
                    </span>
                  </span>
                </label>
              )}

              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">Item name</span>
                <input
                  ref={stockItemNameRef}
                  value={stockForm.itemName}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, itemName: e.target.value }))}
                  placeholder="e.g. Brake pad set"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Part number <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  value={stockForm.partNumber}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, partNumber: e.target.value }))}
                  placeholder="OEM / SKU"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Brand <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <input
                  value={stockForm.brand}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, brand: e.target.value }))}
                  placeholder="Manufacturer"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">Your unit price</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockForm.unitPrice}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, unitPrice: e.target.value }))}
                  placeholder="0.00"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Your selling price. Marketplace buyers see a platform-adjusted listed price.
                </span>
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Total quantity</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockForm.quantity}
                  onChange={(e) =>
                    setStockForm((prev) => {
                      const nextQuantity = e.target.value;
                      return {
                        ...prev,
                        quantity: nextQuantity,
                        availableQuantity: prev.id ? prev.availableQuantity : nextQuantity,
                      };
                    })
                  }
                  placeholder="1"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Available quantity</span>
                <input
                  type="number"
                  min="0"
                  step="1"
                  value={stockForm.availableQuantity}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, availableQuantity: e.target.value }))}
                  placeholder="1"
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
                <span className="mt-1 block text-xs text-slate-500">
                  Cannot exceed total quantity.
                </span>
              </label>
              <label className="block sm:col-span-2">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Notes <span className="font-normal text-slate-400">(optional)</span>
                </span>
                <textarea
                  value={stockForm.notes}
                  onChange={(e) => setStockForm((prev) => ({ ...prev, notes: e.target.value }))}
                  placeholder="Condition, compatibility, location…"
                  rows={3}
                  className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            </div>

            {error && stockModalOpen && (
              <div className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                {error}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={closeStockModal}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void saveStockListing()}
                disabled={submitting === 'stock' || !!mediaUploading}
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-sm font-medium text-white hover:bg-slate-800 disabled:opacity-60"
              >
                <Plus className="h-4 w-4" />
                {submitting === 'stock'
                  ? 'Saving…'
                  : stockForm.id
                    ? 'Save listing'
                    : 'Add listing'}
              </button>
            </div>
          </div>
        </div>
      )}

      {priceDetailItem && (
        <div className={PARTS_MODAL_BACKDROP} onClick={closeMarketplaceDetail}>
          <div
            className={`${PARTS_MODAL_PANEL} max-w-2xl`}
            onClick={(e) => e.stopPropagation()}
          >
            {(() => {
              const detailImages = collectCatalogDetailImages(priceDetailItem);
              const safeImageIndex = Math.min(
                detailModalImageIndex,
                Math.max(0, detailImages.length - 1)
              );
              const detailCondition = pickCatalogItemCondition(priceDetailItem);
              const detailVerified = catalogNeedsVerification(priceDetailItem);
              const DetailCategoryIcon = categoryIcon(priceDetailItem.category);
              const partNum = priceDetailItem.listings.find((l) => l.partNumber)?.partNumber;
              const brand = priceDetailItem.listings.find((l) => l.brand)?.brand;
              return (
                <>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <h2 className="text-lg font-semibold text-slate-900 sm:text-xl">
                        {priceDetailItem.itemName}
                      </h2>
                      <div className="mt-2 flex flex-wrap gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-medium text-slate-700">
                          <DetailCategoryIcon className="h-3.5 w-3.5" />
                          {PARTS_CATEGORY_LABELS[priceDetailItem.category]}
                        </span>
                        {detailCondition && (
                          <span className="rounded-full bg-slate-900 px-2.5 py-1 text-xs font-medium text-white">
                            {PARTS_CONDITION_LABELS[detailCondition]}
                          </span>
                        )}
                        {detailVerified && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-600 px-2.5 py-1 text-xs font-medium text-white">
                            <ShieldCheck className="h-3.5 w-3.5" />
                            Verified listing
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={closeMarketplaceDetail}
                      className="shrink-0 rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
                      aria-label="Close"
                    >
                      <X className="h-5 w-5" />
                    </button>
                  </div>

                  <div className="mt-4 overflow-hidden rounded-xl border border-slate-200 bg-slate-100">
                    <div className="relative flex h-44 items-center justify-center sm:h-52">
                      {detailImages[safeImageIndex] ? (
                        <img
                          src={detailImages[safeImageIndex]}
                          alt=""
                          className="max-h-full max-w-full object-contain object-center"
                        />
                      ) : (
                        <div className="flex flex-col items-center gap-2 text-slate-400">
                          <DetailCategoryIcon className="h-12 w-12 opacity-50" />
                          <span className="text-sm">No photos for this item</span>
                        </div>
                      )}
                      {detailImages.length > 1 && (
                        <div className="absolute bottom-2 right-2 flex items-center gap-1">
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModalImageIndex(
                                (safeImageIndex - 1 + detailImages.length) % detailImages.length
                              )
                            }
                            className="rounded-full bg-black/55 px-2.5 py-1 text-sm font-medium text-white hover:bg-black/70"
                          >
                            ‹
                          </button>
                          <span className="rounded-full bg-black/55 px-2.5 py-1 text-xs font-medium text-white">
                            {safeImageIndex + 1}/{detailImages.length}
                          </span>
                          <button
                            type="button"
                            onClick={() =>
                              setDetailModalImageIndex((safeImageIndex + 1) % detailImages.length)
                            }
                            className="rounded-full bg-black/55 px-2.5 py-1 text-sm font-medium text-white hover:bg-black/70"
                          >
                            ›
                          </button>
                        </div>
                      )}
                    </div>
                    {detailImages.length > 1 && (
                      <div className="flex gap-1 overflow-x-auto border-t border-slate-200 bg-white p-2">
                        {detailImages.map((url, thumbIndex) => (
                          <button
                            key={url}
                            type="button"
                            onClick={() => setDetailModalImageIndex(thumbIndex)}
                            className={`h-14 w-14 shrink-0 overflow-hidden rounded-lg border-2 ${
                              thumbIndex === safeImageIndex
                                ? 'border-indigo-600'
                                : 'border-transparent opacity-80 hover:opacity-100'
                            }`}
                          >
                            <img src={url} alt="" className="h-full w-full object-contain bg-slate-50" />
                          </button>
                        ))}
                      </div>
                    )}
                  </div>

                  <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        From
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {formatMoney(priceDetailItem.lowestPrice)}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Available
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {priceDetailItem.totalAvailable}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Sellers
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {priceDetailItem.supplierCount}
                      </dd>
                    </div>
                    <div className="rounded-lg bg-slate-50 px-3 py-2">
                      <dt className="text-[10px] font-medium uppercase tracking-wide text-slate-500">
                        Options
                      </dt>
                      <dd className="mt-0.5 font-semibold text-slate-900">
                        {priceDetailItem.listingCount}
                      </dd>
                    </div>
                  </dl>

                  {(partNum || brand) && (
                    <p className="mt-3 text-sm text-slate-600">
                      {partNum ? <span className="font-medium">Part #{partNum}</span> : null}
                      {partNum && brand ? ' · ' : null}
                      {brand ? <span>{brand}</span> : null}
                    </p>
                  )}

                  <h3 className="mt-6 text-sm font-semibold text-slate-900">
                    Seller options
                    <span className="ml-2 font-normal text-slate-500">
                      Lowest price first, then by distance
                    </span>
                  </h3>
                </>
              );
            })()}

            <div className="mt-3 space-y-3">
              {priceDetailItem.listings.map((listing, index) => {
                const isLowest = listing.unitPrice === priceDetailItem.lowestPrice;
                const isStaff =
                  Boolean(data?.viewer.revealMarketplaceSellers) ||
                  data?.viewer.role === 'admin' ||
                  data?.viewer.role === 'technician';
                const distanceBits = [
                  listing.distanceLabel ? listing.distanceLabel : null,
                  listing.travelMinutes != null ? `~${listing.travelMinutes} min drive` : null,
                ].filter(Boolean);
                const mapOpen = sellerMapListingId === listing.id;
                const canShowMap = Boolean(
                  listing.supplierMapEmbedUrl || listing.supplierMapUrl
                );
                const optionLabel = isLowest
                  ? index === 0
                    ? 'Lowest price'
                    : 'Lowest price · closer'
                  : `Option ${index + 1}`;
                const listingThumb = listingImageUrls(listing)[0];
                return (
                  <div
                    key={listing.id}
                    className={`rounded-xl border px-4 py-3 text-sm ${
                      isLowest
                        ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
                        : 'border-slate-200 bg-slate-50 text-slate-700'
                    }`}
                  >
                    <div className="flex gap-3">
                      {listingThumb ? (
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-lg border border-white/80 bg-white">
                          <img
                            src={listingThumb}
                            alt=""
                            className="h-full w-full object-contain"
                          />
                        </div>
                      ) : null}
                      <div className="min-w-0 flex-1">
                      <p className="font-medium">{optionLabel}</p>
                      <p className="mt-0.5 text-base font-semibold">
                        {formatMoney(listing.unitPrice)}
                        <span className="ml-2 text-xs font-normal opacity-70">listed</span>
                      </p>
                      <p className="mt-1 text-xs font-medium opacity-90">
                        Seller: {listing.supplierName || (isStaff ? 'Unknown seller' : 'Platform partner')}
                      </p>
                      {isStaff && listing.supplierAddress && (
                        <button
                          type="button"
                          disabled={!canShowMap}
                          onClick={() =>
                            setSellerMapListingId((prev) =>
                              prev === listing.id ? null : listing.id
                            )
                          }
                          className={`mt-0.5 inline-flex max-w-full items-start gap-1 break-words text-left text-xs opacity-90 ${
                            canShowMap
                              ? 'font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900'
                              : 'opacity-70'
                          }`}
                          title={canShowMap ? 'Show map pin' : undefined}
                        >
                          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                          <span>Location: {listing.supplierAddress}</span>
                        </button>
                      )}
                      <p className="mt-1 text-xs opacity-80">
                        {listing.availableQuantity} available
                        {listing.itemCondition
                          ? ` · ${PARTS_CONDITION_LABELS[listing.itemCondition]}`
                          : ''}
                        {listing.brand ? ` · ${listing.brand}` : ''}
                        {listing.partNumber ? ` · #${listing.partNumber}` : ''}
                        {distanceBits.length ? ` · ${distanceBits.join(' · ')}` : ''}
                      </p>
                      {listing.requiresVerification && listing.verificationVideoFile && (
                        <a
                          href={partsCatalogMediaUrl(listing.verificationVideoFile, 'video') ?? '#'}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="mt-2 inline-flex items-center gap-1 text-xs font-medium text-indigo-700 underline underline-offset-2"
                        >
                          <Video className="h-3.5 w-3.5" />
                          View working video
                        </a>
                      )}
                      {listing.notes?.trim() && (
                        <p className="mt-1 text-xs opacity-70">Notes: {listing.notes.trim()}</p>
                      )}
                      </div>
                    </div>
                    {isStaff && mapOpen && listing.supplierMapEmbedUrl && (
                      <div className="mt-3 space-y-2">
                        <div className="overflow-hidden rounded-lg border border-slate-200 bg-white">
                          <iframe
                            title={`Seller map for ${listing.supplierName}`}
                            src={listing.supplierMapEmbedUrl}
                            className="h-48 w-full border-0"
                            loading="lazy"
                            referrerPolicy="no-referrer-when-downgrade"
                          />
                        </div>
                        {listing.supplierMapUrl && (
                          <a
                            href={listing.supplierMapUrl}
                            target="_blank"
                            rel="noopener noreferrer"
                            className="inline-flex items-center gap-1.5 text-xs font-medium text-indigo-600 hover:text-indigo-800"
                          >
                            Open map pin
                            <ExternalLink className="h-3.5 w-3.5" />
                          </a>
                        )}
                      </div>
                    )}
                    <div className="mt-3 flex justify-end">
                      <button
                        type="button"
                        onClick={() => openRequestForItem(priceDetailItem, listing)}
                        className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-3 py-1.5 text-sm font-medium text-white hover:bg-indigo-700"
                      >
                        <ShoppingCart className="h-4 w-4" />
                        Request this option
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="mt-6 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4">
              <button
                type="button"
                onClick={() => openRequestForItem(priceDetailItem, null)}
                className="text-sm font-medium text-slate-600 underline underline-offset-2 hover:text-slate-900"
              >
                Request cheapest available (auto)
              </button>
              <button
                type="button"
                onClick={closeMarketplaceDetail}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {requestItem && (
        <div className={PARTS_MODAL_BACKDROP}>
          <div className={`${PARTS_MODAL_PANEL} max-w-lg`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Request Part</h2>
                <p className="mt-1 text-sm text-slate-500">{requestItem.itemName}</p>
              </div>
              <button
                type="button"
                onClick={() => {
                  setRequestItem(null);
                  setRequestListing(null);
                }}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            <div className="mt-5 grid gap-4">
              {(requestListing?.requiresVerification ||
                requestItem.listings.some((l) => l.requiresVerification)) && (
                <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-950">
                  <p className="flex items-center gap-2 font-medium">
                    <ShieldCheck className="h-4 w-4" />
                    Verified listing
                  </p>
                  <p className="mt-1 text-xs text-emerald-900/80">
                    This item may require seller verification. Full devices include a working-condition
                    video when provided by the seller.
                  </p>
                </div>
              )}
              {requestListing ? (
                <div className="rounded-xl border border-indigo-100 bg-indigo-50 px-4 py-3 text-sm text-indigo-950">
                  <p className="font-medium">Selected option</p>
                  <p className="mt-1">
                    Listed price: {formatMoney(requestListing.unitPrice)}
                    {' · '}
                    {requestListing.availableQuantity} available
                  </p>
                  <p className="mt-0.5 text-xs opacity-90">
                    Seller: {requestListing.supplierName || 'Platform partner'}
                    {requestListing.supplierAddress ? ` · ${requestListing.supplierAddress}` : ''}
                  </p>
                  {(requestListing.distanceLabel || requestListing.travelMinutes != null) && (
                    <p className="mt-0.5 text-xs opacity-80">
                      {[
                        requestListing.distanceLabel,
                        requestListing.travelMinutes != null
                          ? `~${requestListing.travelMinutes} min drive`
                          : null,
                      ]
                        .filter(Boolean)
                        .join(' · ')}
                    </p>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      openMarketplaceDetail(requestItem);
                      setRequestItem(null);
                      setRequestListing(null);
                    }}
                    className="mt-2 text-xs font-medium text-indigo-800 underline underline-offset-2 hover:text-indigo-950"
                  >
                    Choose a different option
                  </button>
                </div>
              ) : (
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  Platform will allocate the cheapest available stock first.
                  <br />
                  Available now:{' '}
                  <span className="font-semibold text-slate-900">{requestItem.totalAvailable}</span>{' '}
                  units · From{' '}
                  <span className="font-semibold text-slate-900">
                    {formatMoney(requestItem.lowestPrice)}
                  </span>
                  {requestItem.highestPrice !== requestItem.lowestPrice && (
                    <>
                      {' '}
                      (up to{' '}
                      <span className="font-semibold text-slate-900">
                        {formatMoney(requestItem.highestPrice)}
                      </span>
                      )
                    </>
                  )}
                  <button
                    type="button"
                    onClick={() => {
                      openMarketplaceDetail(requestItem);
                      setRequestItem(null);
                    }}
                    className="mt-2 block text-xs font-medium text-indigo-700 underline underline-offset-2 hover:text-indigo-900"
                  >
                    Compare and pick a specific option
                  </button>
                </div>
              )}
              <input
                type="number"
                min="1"
                max={requestListing?.availableQuantity || requestItem.totalAvailable}
                step="1"
                value={requestQuantity}
                onChange={(e) => setRequestQuantity(e.target.value)}
                placeholder="Quantity"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
              <textarea
                value={requestNotes}
                onChange={(e) => setRequestNotes(e.target.value)}
                rows={4}
                placeholder="Notes for the platform team or supplier (optional)"
                className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
              />
            </div>

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => {
                  setRequestItem(null);
                  setRequestListing(null);
                }}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={() => void submitRequest()}
                disabled={submitting === 'request'}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                {submitting === 'request' ? 'Submitting...' : 'Submit request'}
              </button>
            </div>
          </div>
        </div>
      )}

      {fulfillModal && (
        <div className={PARTS_MODAL_BACKDROP}>
          <div className={`${PARTS_MODAL_PANEL} max-w-md`}>
            <div className="flex items-start justify-between gap-4">
              <div>
                <h2 className="text-lg font-semibold text-slate-900">Fulfill request</h2>
                <p className="mt-1 text-sm text-slate-500">
                  {fulfillModal.itemName} · {fulfillModal.requestNumber}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setFulfillModal(null)}
                className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-50"
              >
                Close
              </button>
            </div>

            {fulfillModal.mode === 'client' ? (
              <div className="mt-5 space-y-3">
                <p className="text-sm text-slate-600">
                  Mark this item ready for collection. Computer Dynamics handles the delivery fee,
                  collection from your shop, and delivery to the buyer.
                </p>
                {fulfillModal.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {fulfillModal.error}
                  </div>
                )}
              </div>
            ) : fulfillModal.loading ? (
              <p className="mt-5 text-sm text-slate-500">Calculating route and delivery package…</p>
            ) : (
              <div className="mt-5 space-y-4">
                <div className="rounded-xl bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <p>
                    Route:{' '}
                    <span className="font-medium text-slate-900">
                      {fulfillModal.preview?.deliveryEtaLabel ||
                        formatDistanceMeters(fulfillModal.preview?.thisDistanceMeters) ||
                        'Distance unavailable'}
                    </span>
                  </p>
                  {fulfillModal.preview?.thisDistanceMeters != null && (
                    <p className="mt-1 text-xs text-slate-500">
                      {formatDistanceMeters(fulfillModal.preview.thisDistanceMeters)}
                    </p>
                  )}
                </div>

                {fulfillModal.preview?.mode === 'share' ? (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                    Shared package — no extra delivery
                    {fulfillModal.preview.package ? (
                      <span className="mt-1 block text-xs opacity-90">
                        Joining package with {formatMoney(fulfillModal.preview.package.deliveryFee)}{' '}
                        fee (opened {fulfillModal.preview.package.ageMinutes} min ago).
                      </span>
                    ) : null}
                  </div>
                ) : (
                  <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                    New delivery — fee optional now (set later with Edit delivery)
                  </div>
                )}

                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">
                    Delivery fee ($) — optional
                  </span>
                  <input
                    type="number"
                    min={0}
                    step={1}
                    value={fulfillModal.deliveryFee}
                    onChange={(e) =>
                      setFulfillModal((prev) =>
                        prev ? { ...prev, deliveryFee: e.target.value, error: '' } : prev
                      )
                    }
                    className="w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                    placeholder="Leave blank to set later"
                  />
                  <span className="mt-1 block text-xs text-slate-500">
                    Whole dollars only. Leave blank to fulfill now and set the fee later.
                  </span>
                </label>

                {fulfillModal.error && (
                  <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                    {fulfillModal.error}
                  </div>
                )}
              </div>
            )}

            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setFulfillModal(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  fulfillModal.loading || submitting === `fulfill:${fulfillModal.requestId}`
                }
                onClick={() => void confirmFulfillModal()}
                className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {submitting === `fulfill:${fulfillModal.requestId}`
                  ? 'Fulfilling…'
                  : fulfillModal.mode === 'client'
                    ? 'Mark ready for collection'
                    : 'Confirm fulfill'}
              </button>
            </div>
          </div>
        </div>
      )}

      {addToStockPrompt && (
        <div className="fixed inset-0 z-[90] flex items-end justify-center bg-slate-950/40 p-3 backdrop-blur-sm sm:items-center sm:p-4">
          <div className={`${PARTS_MODAL_PANEL} max-w-md`}>
            <h2 className="text-lg font-semibold text-slate-900">Add to stock?</h2>
            <p className="mt-3 text-sm text-slate-600">
              Received {addToStockPrompt.qty}× {addToStockPrompt.request.itemName}.
            </p>
            <p className="mt-2 text-sm text-slate-600">
              Add this to {addToStockPrompt.stockLabel}? Your stock price will start at{' '}
              {formatMoney(addToStockPrompt.price)} (what you paid). You can edit it later.
            </p>
            <div className="mt-6 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAddToStockPrompt(null)}
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                No
              </button>
              <button
                type="button"
                disabled={!!submitting}
                onClick={() => void confirmAddReceivedToStock()}
                className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
              >
                Yes
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
