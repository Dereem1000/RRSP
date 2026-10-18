'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { ImageIcon, Loader2, Search, X } from 'lucide-react';
import {
  buildPosStyleImageSearchQuery,
  type PosStyleImageSearchFields,
} from '@/lib/catalog-image-search-query';
import { resolveCanonicalImageSrc } from '@/lib/pos-catalog-canonical-display';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';

export type CatalogImageSearchResult = {
  url: string;
  thumbnail: string;
  title?: string;
};

type Props = {
  imageUrl: string;
  onImageUrlChange: (url: string) => void;
  /** POS order: name, brand (or supplier), size — see Inventory `handleSearchOnlineImage`. */
  searchFields?: PosStyleImageSearchFields;
  /** @deprecated Use searchFields */
  searchQuery?: string;
  disabled?: boolean;
  onStatus?: (message: string) => void;
};

function imageSearchParams(fields?: PosStyleImageSearchFields, legacyQuery?: string): URLSearchParams {
  const merged: PosStyleImageSearchFields = {
    name: fields?.name ?? legacyQuery,
    brand: fields?.brand,
    size: fields?.size,
    supplier: fields?.supplier,
  };
  const params = new URLSearchParams();
  const name = String(merged.name || '').trim();
  const brand = String(merged.brand || '').trim();
  const size = String(merged.size || '').trim();
  const supplier = String(merged.supplier || '').trim();
  if (name) params.set('name', name);
  if (brand) params.set('brand', brand);
  if (size) params.set('size', size);
  if (supplier) params.set('supplier', supplier);
  return params;
}

export function FederationCatalogImageField({
  imageUrl,
  onImageUrlChange,
  searchFields,
  searchQuery = '',
  disabled,
  onStatus,
}: Props) {
  const [searching, setSearching] = useState(false);
  const [importing, setImporting] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [pickerError, setPickerError] = useState('');
  const [options, setOptions] = useState<CatalogImageSearchResult[]>([]);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!pickerOpen) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [pickerOpen]);

  const previewSrc = resolveCanonicalImageSrc(imageUrl) || (imageUrl.startsWith('http') ? imageUrl : null);

  const closePicker = () => {
    setPickerOpen(false);
    setPickerError('');
    setOptions([]);
  };

  const searchOnline = async () => {
    const built = buildPosStyleImageSearchQuery(searchFields || { name: searchQuery });
    if (!built) {
      const msg = 'Enter at least a product name before searching for an image (same as POS Inventory).';
      onStatus?.(msg);
      setPickerError(msg);
      return;
    }
    setSearching(true);
    setOptions([]);
    setPickerError('');
    setPickerOpen(true);
    try {
      const params = imageSearchParams(searchFields, searchQuery);
      const res = await fetch(`/api/pos-catalog-media/search-options?${params}`, { credentials: 'include' });
      const data = await parseFetchJsonResponse<{
        success?: boolean;
        images?: CatalogImageSearchResult[];
        message?: string;
        error?: string;
      }>(res);

      if (!res.ok || !data.success || !data.images?.length) {
        const msg = apiErrorMessage(data, 'No images found for this product');
        setPickerError(msg);
        onStatus?.(msg);
        return;
      }

      setOptions(data.images);
      onStatus?.('');
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Image search failed';
      setPickerError(msg);
      onStatus?.(msg);
    } finally {
      setSearching(false);
    }
  };

  const pickImage = async (remoteUrl: string) => {
    setImporting(true);
    try {
      const res = await fetch('/api/pos-catalog-media/import-url', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: remoteUrl }),
      });
      const data = await parseFetchJsonResponse<{ success?: boolean; url?: string; message?: string; error?: string }>(
        res,
      );
      if (!res.ok || !data.success || !data.url) {
        throw new Error(apiErrorMessage(data, 'Could not import image'));
      }
      onImageUrlChange(data.url);
      onStatus?.('Image saved to federation catalog media.');
      closePicker();
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : 'Import failed');
    } finally {
      setImporting(false);
    }
  };

  const uploadFile = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      onStatus?.('Only image files are allowed');
      return;
    }
    setImporting(true);
    try {
      const form = new FormData();
      form.append('file', file);
      const res = await fetch('/api/pos-catalog-media', { method: 'POST', body: form, credentials: 'include' });
      const data = await parseFetchJsonResponse<{ success?: boolean; url?: string; message?: string; error?: string }>(
        res,
      );
      if (!res.ok || !data.success || !data.url) {
        throw new Error(apiErrorMessage(data, 'Upload failed'));
      }
      onImageUrlChange(data.url);
      onStatus?.('Image uploaded.');
    } catch (err) {
      onStatus?.(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setImporting(false);
    }
  };

  const pickerModal =
    pickerOpen && mounted
      ? createPortal(
          <div
            className="fixed inset-0 z-[120] flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
            role="dialog"
            aria-modal="true"
            aria-labelledby="federation-image-picker-title"
            onClick={closePicker}
          >
            <div
              className="flex max-h-[85vh] w-full max-w-2xl flex-col rounded-2xl bg-white shadow-xl"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
                <p id="federation-image-picker-title" className="font-semibold text-slate-900">
                  Pick a product image
                </p>
                <button
                  type="button"
                  className="rounded-lg p-1 text-slate-500 hover:bg-slate-100"
                  onClick={closePicker}
                >
                  <X className="h-5 w-5" />
                </button>
              </div>
              <div className="overflow-y-auto p-4">
                {searching ? (
                  <p className="flex items-center gap-2 text-sm text-slate-600">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Searching…
                  </p>
                ) : pickerError ? (
                  <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-950">
                    {pickerError}
                  </p>
                ) : options.length === 0 ? (
                  <p className="text-sm text-slate-600">No results.</p>
                ) : (
                  <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                    {options.map((img) => (
                      <button
                        key={img.url}
                        type="button"
                        disabled={importing}
                        onClick={() => void pickImage(img.url)}
                        className="overflow-hidden rounded-xl border border-slate-200 text-left hover:border-violet-400 hover:ring-2 hover:ring-violet-200 disabled:opacity-60"
                      >
                        <img
                          src={img.thumbnail || img.url}
                          alt=""
                          className="aspect-square w-full object-cover bg-slate-100"
                        />
                        {img.title && (
                          <p className="line-clamp-2 p-2 text-[10px] text-slate-600">{img.title}</p>
                        )}
                      </button>
                    ))}
                  </div>
                )}
              </div>
              {importing && (
                <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                  <Loader2 className="mr-1 inline h-3.5 w-3.5 animate-spin" />
                  Saving image to catalog…
                </p>
              )}
            </div>
          </div>,
          document.body,
        )
      : null;

  return (
    <div className="mt-2">
      <label className="block text-sm font-medium text-slate-700">
        Image
        <input
          value={imageUrl}
          onChange={(e) => onImageUrlChange(e.target.value)}
          placeholder="/api/pos-catalog-media/file/…"
          disabled={disabled || importing}
          className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
        />
      </label>
      <div className="mt-2 flex flex-wrap gap-2">
        <button
          type="button"
          disabled={disabled || searching || importing}
          onClick={() => void searchOnline()}
          className="inline-flex items-center gap-1.5 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100 disabled:opacity-60"
        >
          {searching ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Search className="h-3.5 w-3.5" />}
          Search
        </button>
        <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50">
          {importing ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <ImageIcon className="h-3.5 w-3.5" />}
          Upload file
          <input
            type="file"
            accept="image/*"
            className="hidden"
            disabled={disabled || importing}
            onChange={(e) => {
              const file = e.target.files?.[0];
              if (file) void uploadFile(file);
              e.target.value = '';
            }}
          />
        </label>
      </div>
      {pickerError && !pickerOpen && (
        <p className="mt-2 text-xs text-amber-800">{pickerError}</p>
      )}
      {previewSrc ? (
        <img src={previewSrc} alt="" className="mt-2 h-24 w-24 rounded-lg border object-cover" />
      ) : (
        <div className="mt-2 flex h-24 w-24 items-center justify-center rounded-lg border border-dashed border-slate-200 bg-slate-50">
          <ImageIcon className="h-8 w-8 text-slate-300" />
        </div>
      )}

      {pickerModal}
    </div>
  );
}
