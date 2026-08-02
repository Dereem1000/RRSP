'use client';

import { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Loader2, MapPin, Crosshair } from 'lucide-react';

export type AddressLocation = {
  latitude: number | null;
  longitude: number | null;
  locationSource: 'geocode' | 'pin' | null;
};

export type AddressMapPickerHandle = {
  /** Current pin from React state or the live Leaflet marker. */
  getLocation: () => AddressLocation;
};

type AddressMapPickerProps = {
  address: string;
  value: AddressLocation;
  onChange: (next: AddressLocation) => void;
  required?: boolean;
};

const DEFAULT_CENTER = { lat: 10.6918, lon: -61.2225 };
const LEAFLET_CSS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
const LEAFLET_JS = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
const LEAFLET_IMG = 'https://unpkg.com/leaflet@1.9.4/dist/images';

type LeafletNS = {
  map: (el: HTMLElement, opts: Record<string, unknown>) => LeafletMap;
  tileLayer: (url: string, opts: Record<string, unknown>) => { addTo: (map: LeafletMap) => void };
  marker: (latlng: [number, number], opts: Record<string, unknown>) => LeafletMarker;
  Icon: {
    Default: {
      prototype: Record<string, unknown>;
      mergeOptions: (opts: Record<string, string>) => void;
    };
  };
};

type LeafletMap = {
  setView: (latlng: [number, number], zoom?: number) => void;
  getZoom: () => number;
  invalidateSize: () => void;
  remove: () => void;
  on: (event: string, handler: (e: { latlng: { lat: number; lng: number } }) => void) => void;
};

type LeafletMarker = {
  addTo: (map: LeafletMap) => LeafletMarker;
  setLatLng: (latlng: [number, number]) => void;
  getLatLng: () => { lat: number; lng: number };
  remove: () => void;
  on: (event: string, handler: () => void) => void;
};

declare global {
  interface Window {
    L?: LeafletNS;
  }
}

let leafletLoader: Promise<LeafletNS> | null = null;

function fixLeafletIcons(L: LeafletNS) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: `${LEAFLET_IMG}/marker-icon-2x.png`,
    iconUrl: `${LEAFLET_IMG}/marker-icon.png`,
    shadowUrl: `${LEAFLET_IMG}/marker-shadow.png`,
  });
}

function loadLeaflet(): Promise<LeafletNS> {
  if (typeof window === 'undefined') {
    return Promise.reject(new Error('Leaflet requires a browser'));
  }
  if (window.L) {
    fixLeafletIcons(window.L);
    return Promise.resolve(window.L);
  }
  if (leafletLoader) return leafletLoader;

  leafletLoader = new Promise((resolve, reject) => {
    if (!document.querySelector(`link[href="${LEAFLET_CSS}"]`)) {
      const link = document.createElement('link');
      link.rel = 'stylesheet';
      link.href = LEAFLET_CSS;
      document.head.appendChild(link);
    }
    const existing = document.querySelector(`script[src="${LEAFLET_JS}"]`) as HTMLScriptElement | null;
    const script = existing ?? document.createElement('script');
    if (!existing) {
      script.src = LEAFLET_JS;
      script.async = true;
      document.body.appendChild(script);
    }
    const done = () => {
      if (window.L) {
        fixLeafletIcons(window.L);
        resolve(window.L);
      } else reject(new Error('Leaflet failed to load'));
    };
    if (window.L) {
      done();
      return;
    }
    script.addEventListener('load', done);
    script.addEventListener('error', () => reject(new Error('Leaflet failed to load')));
  });
  return leafletLoader;
}

function refreshMapSize(map: LeafletMap | null) {
  if (!map) return;
  requestAnimationFrame(() => {
    map.invalidateSize();
    window.setTimeout(() => map.invalidateSize(), 100);
  });
}

export const AddressMapPicker = forwardRef<AddressMapPickerHandle, AddressMapPickerProps>(
  function AddressMapPicker({ address, value, onChange, required }, ref) {
  const mapEl = useRef<HTMLDivElement | null>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const markerRef = useRef<LeafletMarker | null>(null);
  const dropModeRef = useRef(false);
  const onChangeRef = useRef(onChange);
  const addressRef = useRef(address);
  const valueRef = useRef(value);
  const lastGeocodedAddress = useRef('');
  const skipFirstGeocode = useRef(value.latitude != null && value.longitude != null);
  /** Once the user drops/drags a pin, ignore geocode results until the address text changes. */
  const manualPinLockRef = useRef(value.locationSource === 'pin');
  const geocodeSeqRef = useRef(0);

  const [mapReady, setMapReady] = useState(false);
  const [resolving, setResolving] = useState(false);
  const [dropMode, setDropMode] = useState(false);
  const [status, setStatus] = useState(
    value.latitude != null
      ? 'Saved location loaded — edit the address or drop a new pin to update.'
      : 'Enter an address to locate it, or drop a pin on the map.'
  );
  const [statusTone, setStatusTone] = useState<'neutral' | 'ok' | 'warn' | 'error'>(
    value.latitude != null ? 'ok' : 'neutral'
  );

  dropModeRef.current = dropMode;
  onChangeRef.current = onChange;
  addressRef.current = address;
  valueRef.current = value;

  useImperativeHandle(ref, () => ({
    getLocation: () => {
      const marker = markerRef.current?.getLatLng();
      if (marker && Number.isFinite(marker.lat) && Number.isFinite(marker.lng)) {
        return {
          latitude: marker.lat,
          longitude: marker.lng,
          locationSource: valueRef.current.locationSource ?? 'pin',
        };
      }
      return valueRef.current;
    },
  }));

  function applyManualPin(lat: number, lon: number) {
    manualPinLockRef.current = true;
    geocodeSeqRef.current += 1; // invalidate in-flight geocode
    lastGeocodedAddress.current = addressRef.current.trim();
    onChangeRef.current({ latitude: lat, longitude: lon, locationSource: 'pin' });
    setStatus('Pin set — click Save details to store this location.');
    setStatusTone('ok');
    setDropMode(false);
    refreshMapSize(mapRef.current);
  }

  function placeMarker(L: LeafletNS, map: LeafletMap, lat: number, lon: number) {
    if (markerRef.current) {
      markerRef.current.setLatLng([lat, lon]);
      return;
    }
    markerRef.current = L.marker([lat, lon], { draggable: true }).addTo(map);
    markerRef.current.on('dragend', () => {
      const pos = markerRef.current?.getLatLng();
      if (!pos) return;
      applyManualPin(pos.lat, pos.lng);
    });
  }

  async function resolveAddress(trimmed: string, { force = false }: { force?: boolean } = {}) {
    if (!force && manualPinLockRef.current) {
      setStatus('Using your dropped pin. Change the address text to look it up again, or drop a new pin.');
      setStatusTone('ok');
      return;
    }

    const seq = ++geocodeSeqRef.current;
    setResolving(true);
    setStatus('Looking up address…');
    setStatusTone('neutral');
    try {
      const res = await fetch('/api/auth/geocode', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: trimmed }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Lookup failed');

      // Stale response after pin drop / newer lookup — ignore.
      if (seq !== geocodeSeqRef.current || manualPinLockRef.current) {
        return;
      }

      lastGeocodedAddress.current = trimmed;

      if (!data.found) {
        // Keep any existing pin; just prompt the user to place one.
        setDropMode(true);
        setStatus(
          data.message ||
            'Address not found. Click “Drop pin”, then click the map to mark your location.'
        );
        setStatusTone('warn');
        refreshMapSize(mapRef.current);
        return;
      }

      const lat = Number(data.latitude);
      const lon = Number(data.longitude);
      if (!Number.isFinite(lat) || !Number.isFinite(lon)) {
        setDropMode(true);
        setStatus('Lookup returned an invalid location. Drop a pin instead.');
        setStatusTone('warn');
        return;
      }

      onChangeRef.current({ latitude: lat, longitude: lon, locationSource: 'geocode' });
      if (data.approximate) {
        setDropMode(true);
        setStatus(
          data.message ||
            'Closest city match shown. Drop a pin on the exact spot for better routing.'
        );
        setStatusTone('warn');
      } else {
        setDropMode(false);
        setStatus(data.message || 'Address located. Drag the pin or drop a new one to adjust.');
        setStatusTone('ok');
      }
      refreshMapSize(mapRef.current);
    } catch (err) {
      if (seq !== geocodeSeqRef.current || manualPinLockRef.current) return;
      setStatus(err instanceof Error ? err.message : 'Lookup failed');
      setStatusTone('error');
      setDropMode(true);
      refreshMapSize(mapRef.current);
    } finally {
      if (seq === geocodeSeqRef.current) setResolving(false);
    }
  }

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const L = await loadLeaflet();
        if (cancelled || !mapEl.current || mapRef.current) return;

        const startLat = value.latitude ?? DEFAULT_CENTER.lat;
        const startLon = value.longitude ?? DEFAULT_CENTER.lon;
        const map = L.map(mapEl.current, {
          center: [startLat, startLon],
          zoom: value.latitude != null ? 15 : 9,
        });
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
          attribution: '&copy; OpenStreetMap',
          maxZoom: 19,
        }).addTo(map);

        map.on('click', (event) => {
          if (!dropModeRef.current) return;
          const { lat, lng } = event.latlng;
          placeMarker(L, map, lat, lng);
          applyManualPin(lat, lng);
        });

        mapRef.current = map;
        if (value.latitude != null && value.longitude != null) {
          placeMarker(L, map, value.latitude, value.longitude);
        }
        setMapReady(true);
        refreshMapSize(map);
      } catch {
        if (!cancelled) {
          setStatus('Map could not load. You can still save your address text.');
          setStatusTone('error');
        }
      }
    })();

    return () => {
      cancelled = true;
      if (mapRef.current) {
        mapRef.current.remove();
        mapRef.current = null;
        markerRef.current = null;
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!mapReady || !mapRef.current || !window.L) return;
    if (value.latitude == null || value.longitude == null) {
      // Never remove a marker solely because a stale geocode cleared parent state
      // while a manual pin lock is active — parent should keep the pin.
      if (manualPinLockRef.current) return;
      if (markerRef.current) {
        markerRef.current.remove();
        markerRef.current = null;
      }
      return;
    }
    placeMarker(window.L, mapRef.current, value.latitude, value.longitude);
    mapRef.current.setView(
      [value.latitude, value.longitude],
      Math.max(mapRef.current.getZoom(), 14)
    );
    refreshMapSize(mapRef.current);
  }, [mapReady, value.latitude, value.longitude]);

  useEffect(() => {
    refreshMapSize(mapRef.current);
  }, [dropMode, status, resolving]);

  useEffect(() => {
    const trimmed = address.trim();
    if (!trimmed || trimmed.length < 5) return;
    if (trimmed === lastGeocodedAddress.current) return;

    // Address text changed after a manual pin — allow lookup again.
    manualPinLockRef.current = false;

    if (skipFirstGeocode.current) {
      skipFirstGeocode.current = false;
      lastGeocodedAddress.current = trimmed;
      return;
    }

    const timer = window.setTimeout(() => {
      void resolveAddress(trimmed);
    }, 900);
    return () => window.clearTimeout(timer);
  }, [address]);

  const toneClass =
    statusTone === 'ok'
      ? 'border-emerald-200 bg-emerald-50 text-emerald-900'
      : statusTone === 'warn'
        ? 'border-amber-200 bg-amber-50 text-amber-900'
        : statusTone === 'error'
          ? 'border-red-200 bg-red-50 text-red-800'
          : 'border-slate-200 bg-slate-50 text-slate-600';

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span className="text-sm font-medium text-slate-700">
          Location on map {required ? <span className="text-red-500">*</span> : null}
        </span>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            disabled={resolving || !address.trim()}
            onClick={() => {
              manualPinLockRef.current = false;
              void resolveAddress(address.trim(), { force: true });
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {resolving ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
            ) : (
              <MapPin className="h-3.5 w-3.5" />
            )}
            Find address
          </button>
          <button
            type="button"
            onClick={() => {
              setDropMode(true);
              setStatus('Drop pin mode: click the map to set your exact location.');
              setStatusTone('warn');
              refreshMapSize(mapRef.current);
            }}
            className={`inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-xs font-medium ${
              dropMode
                ? 'border-indigo-300 bg-indigo-50 text-indigo-800'
                : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
            }`}
          >
            <Crosshair className="h-3.5 w-3.5" />
            Drop pin
          </button>
        </div>
      </div>

      <div
        className={`rounded-xl border border-slate-200 ${
          dropMode ? 'cursor-crosshair ring-2 ring-indigo-400/60 ring-offset-1' : ''
        }`}
      >
        <div ref={mapEl} className="h-56 w-full overflow-hidden rounded-[0.65rem] bg-slate-100" />
      </div>

      {status && (
        <p className={`rounded-lg border px-3 py-2 text-xs ${toneClass}`}>
          {resolving ? (
            <span className="inline-flex items-center gap-1.5">
              <Loader2 className="h-3.5 w-3.5 animate-spin" />
              {status}
            </span>
          ) : (
            status
          )}
        </p>
      )}

      {value.latitude != null && value.longitude != null && (
        <p className="text-[11px] text-slate-500">
          Saved pin: {value.latitude.toFixed(5)}, {value.longitude.toFixed(5)}
          {value.locationSource ? ` · ${value.locationSource}` : ''}
        </p>
      )}
    </div>
  );
});
