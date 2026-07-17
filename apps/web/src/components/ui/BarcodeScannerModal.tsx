'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { Camera, Loader2, X } from 'lucide-react';

type BarcodeScannerModalProps = {
  open: boolean;
  onClose: () => void;
  onScan: (value: string) => void;
};

export function BarcodeScannerModal({ open, onClose, onScan }: BarcodeScannerModalProps) {
  const regionId = `barcode-scanner-${useId().replace(/:/g, '')}`;
  const scannerRef = useRef<{ stop: () => Promise<void> } | null>(null);
  const onScanRef = useRef(onScan);
  const onCloseRef = useRef(onClose);
  const [error, setError] = useState('');
  const [starting, setStarting] = useState(false);

  onScanRef.current = onScan;
  onCloseRef.current = onClose;

  useEffect(() => {
    if (!open) return;

    let cancelled = false;

    async function startScanner() {
      setStarting(true);
      setError('');

      try {
        const { Html5Qrcode, Html5QrcodeSupportedFormats } = await import('html5-qrcode');

        if (cancelled) return;

        const html5QrCode = new Html5Qrcode(regionId, {
          verbose: false,
          formatsToSupport: [
            Html5QrcodeSupportedFormats.CODE_128,
            Html5QrcodeSupportedFormats.CODE_39,
            Html5QrcodeSupportedFormats.CODE_93,
            Html5QrcodeSupportedFormats.EAN_13,
            Html5QrcodeSupportedFormats.EAN_8,
            Html5QrcodeSupportedFormats.UPC_A,
            Html5QrcodeSupportedFormats.UPC_E,
            Html5QrcodeSupportedFormats.ITF,
            Html5QrcodeSupportedFormats.QR_CODE,
          ],
        });
        scannerRef.current = html5QrCode;

        await html5QrCode.start(
          { facingMode: 'environment' },
          {
            fps: 10,
            qrbox: { width: 280, height: 140 },
          },
          (decodedText) => {
            void html5QrCode.stop().finally(() => {
              scannerRef.current = null;
              onScanRef.current(decodedText.trim());
              onCloseRef.current();
            });
          },
          () => {
            // Ignore per-frame decode misses.
          }
        );
      } catch (err) {
        if (!cancelled) {
          setError(err instanceof Error ? err.message : 'Could not start camera');
        }
      } finally {
        if (!cancelled) setStarting(false);
      }
    }

    void startScanner();

    return () => {
      cancelled = true;
      const scanner = scannerRef.current;
      scannerRef.current = null;
      if (scanner) {
        void scanner.stop().catch(() => {});
      }
    };
  }, [open, regionId]);

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4">
      <div className="w-full max-w-md overflow-hidden rounded-2xl bg-white shadow-xl">
        <div className="flex items-center justify-between border-b border-slate-100 px-4 py-3">
          <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900">
            <Camera className="h-4 w-4" />
            Scan barcode
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close scanner"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="p-4">
          <p className="mb-3 text-sm text-slate-600">
            Point your camera at a barcode or QR code on the package label.
          </p>

          <div className="relative overflow-hidden rounded-xl bg-slate-900">
            <div id={regionId} className="min-h-[240px] w-full" />
            {starting && (
              <div className="absolute inset-0 flex items-center justify-center bg-slate-900/70">
                <Loader2 className="h-8 w-8 animate-spin text-white" />
              </div>
            )}
          </div>

          {error && <p className="mt-3 text-sm text-red-700">{error}</p>}
        </div>
      </div>
    </div>
  );
}
