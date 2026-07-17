'use client';

import { Check } from 'lucide-react';
import { SHIPPING_STAGE_LABELS, SHIPPING_STAGES } from '@/lib/order-constants';

type ShippingStage = (typeof SHIPPING_STAGES)[number];

function stageIndex(stage: string) {
  const idx = SHIPPING_STAGES.indexOf(stage as ShippingStage);
  return idx >= 0 ? idx : 0;
}

export function ShipmentJourney({
  shippingStage,
  compact = false,
}: {
  shippingStage: string;
  compact?: boolean;
}) {
  const activeIndex = stageIndex(shippingStage);
  const label = SHIPPING_STAGE_LABELS[shippingStage as ShippingStage] ?? shippingStage;

  if (compact) {
    return (
      <div className="rounded-xl border border-indigo-100 bg-indigo-50/50 px-4 py-3">
        <p className="text-xs font-medium uppercase tracking-wide text-indigo-500">Shipment progress</p>
        <p className="mt-1 text-sm font-semibold text-indigo-900">{label}</p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-indigo-100">
          <div
            className="h-full rounded-full bg-indigo-600 transition-all"
            style={{ width: `${Math.max(8, ((activeIndex + 1) / SHIPPING_STAGES.length) * 100)}%` }}
          />
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="mb-4 text-xs font-semibold uppercase tracking-wide text-slate-500">Shipment journey</p>
      <ol className="grid gap-3 sm:grid-cols-4 lg:grid-cols-8">
        {SHIPPING_STAGES.map((stage, index) => {
          const done = index < activeIndex;
          const active = index === activeIndex;
          return (
            <li key={stage} className="flex flex-col items-center text-center">
              <div
                className={`flex h-8 w-8 items-center justify-center rounded-full border-2 text-xs font-bold ${
                  done
                    ? 'border-emerald-500 bg-emerald-500 text-white'
                    : active
                      ? 'border-indigo-600 bg-indigo-600 text-white ring-4 ring-indigo-100'
                      : 'border-slate-200 bg-white text-slate-400'
                }`}
              >
                {done ? <Check className="h-4 w-4" /> : index + 1}
              </div>
              <p
                className={`mt-2 line-clamp-3 text-[11px] leading-snug ${
                  active ? 'font-semibold text-indigo-800' : done ? 'text-emerald-800' : 'text-slate-400'
                }`}
              >
                {SHIPPING_STAGE_LABELS[stage]}
              </p>
            </li>
          );
        })}
      </ol>
      <p className="mt-4 text-center text-sm font-medium text-slate-700">Current: {label}</p>
    </div>
  );
}
