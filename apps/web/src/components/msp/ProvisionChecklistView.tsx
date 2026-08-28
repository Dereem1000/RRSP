'use client';

import type { ProvisionChecklist } from '@/lib/provisioning-checklist';
import { checklistStatusClass } from '@/lib/provisioning-checklist';

type Props = {
  checklist: ProvisionChecklist | null;
  phaseFilter?: string[];
  emptyMessage?: string;
};

export function ProvisionChecklistView({ checklist, phaseFilter, emptyMessage }: Props) {
  const phases = phaseFilter?.length
    ? phaseFilter
    : (['Readiness', 'Package', 'Install'] as const);

  if (!checklist?.items?.length) {
    return (
      <p className="text-sm text-slate-500">
        {emptyMessage || 'No checklist items available for this run.'}
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {(checklist.rules ?? []).length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {(checklist.rules ?? []).map((rule) => (
            <span
              key={rule.rule}
              className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${checklistStatusClass(rule.status)}`}
            >
              {rule.rule}: {rule.label} · {rule.status.toUpperCase()}
            </span>
          ))}
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-3">
        {phases.map((phaseName) => {
          const items = (checklist.items ?? []).filter((item) => item.phase === phaseName);
          if (items.length === 0) return null;
          return (
            <div key={phaseName} className="min-w-0">
              <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{phaseName}</h4>
              <ul className="mt-1.5 divide-y divide-slate-100 rounded-lg border border-slate-100">
                {items.map((item) => (
                  <li
                    key={item.id}
                    className="flex items-start justify-between gap-2 px-2.5 py-1.5 text-xs"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-slate-800">{item.title}</p>
                      {item.detail && (
                        <p className="whitespace-pre-wrap text-[11px] text-slate-500">{item.detail}</p>
                      )}
                    </div>
                    <span
                      className={`shrink-0 rounded-full px-1.5 py-0.5 text-[10px] font-medium ${checklistStatusClass(item.status)}`}
                    >
                      {item.status.toUpperCase()}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          );
        })}
      </div>
    </div>
  );
}
