import type { ReactNode } from 'react';
import {
  DEVICE_TYPES,
  TICKET_CATEGORIES,
  TICKET_LOCATIONS,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
  formatTicketStatusLabel,
} from '@/lib/ticket-constants';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function defaultValue(value: unknown): string | number | undefined {
  if (value == null || Array.isArray(value) || typeof value === 'object') return undefined;
  return value as string | number;
}

export function TicketFormFields({
  prefix = '',
  defaults = {},
  showStatus = false,
  showActive = false,
  showFinancials = false,
  layout = 'default',
}: {
  prefix?: string;
  defaults?: Record<string, string | number | null | undefined | unknown[]>;
  showStatus?: boolean;
  showActive?: boolean;
  showFinancials?: boolean;
  layout?: 'default' | 'wide';
}) {
  const n = (field: string) => (prefix ? `${prefix}${field}` : field);
  const wide = layout === 'wide';
  const row = wide ? 'grid gap-3 lg:grid-cols-4' : 'grid gap-4 sm:grid-cols-2';
  const noteRows = wide ? 2 : 3;
  const gap = wide ? 'space-y-3' : 'space-y-4';

  return (
    <div className={gap}>
      <div className={wide ? 'grid gap-3 lg:grid-cols-4' : 'grid gap-4 sm:grid-cols-2'}>
        <Field label="Issue / title" required className={wide ? 'lg:col-span-2' : undefined}>
          <input
            name={n('issue')}
            required
            defaultValue={defaultValue(defaults.issue ?? defaults.title)}
            placeholder="Brief description of the problem"
            className={inputClass}
          />
        </Field>
        <Field label="Client contact" className={wide ? 'lg:col-span-2' : undefined}>
          <input
            name={n('clientContactNumber')}
            defaultValue={defaultValue(defaults.clientContactNumber)}
            placeholder="Phone number"
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="Notes / description">
        <textarea
          name={n('notes')}
          rows={noteRows}
          defaultValue={defaultValue(defaults.notes)}
          placeholder="Additional details, symptoms, or context"
          className={inputClass}
        />
      </Field>

      <div className={row}>
        <Field label="Priority">
          <select name={n('priority')} defaultValue={String(defaults.priority ?? 'medium')} className={inputClass}>
            {TICKET_PRIORITIES.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Category">
          <select name={n('category')} defaultValue={String(defaults.category ?? 'general')} className={inputClass}>
            {TICKET_CATEGORIES.map((c) => (
              <option key={c} value={c}>
                {c}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Location">
          <select name={n('location')} defaultValue={String(defaults.location ?? 'Not specified')} className={inputClass}>
            {TICKET_LOCATIONS.map((loc) => (
              <option key={loc} value={loc}>
                {loc}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Subscription">
          <input
            name={n('subscription')}
            defaultValue={defaultValue(defaults.subscription)}
            placeholder="MSP plan or subscription"
            className={inputClass}
          />
        </Field>
      </div>

      {showStatus && (
        <div className={row}>
          <Field label="Status">
            <select name={n('status')} defaultValue={String(defaults.status ?? 'New')} className={inputClass}>
              {TICKET_STATUSES.map((s) => (
                <option key={s} value={s}>
                  {formatTicketStatusLabel(s)}
                </option>
              ))}
            </select>
          </Field>
          {showActive && (
            <Field label="Active">
              <select name={n('isActive')} defaultValue={String(defaults.isActive ?? 1)} className={inputClass}>
                <option value="1">Active</option>
                <option value="0">Inactive / archived</option>
              </select>
            </Field>
          )}
        </div>
      )}

      <div className={row}>
        <Field label="Device type">
          <select name={n('deviceType')} defaultValue={String(defaults.deviceType ?? 'Other')} className={inputClass}>
            {DEVICE_TYPES.map((d) => (
              <option key={d} value={d}>
                {d}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Device model">
          <input
            name={n('deviceModel')}
            defaultValue={defaultValue(defaults.deviceModel)}
            placeholder="e.g. Latitude 5520"
            className={inputClass}
          />
        </Field>
        <Field label="Serial number">
          <input
            name={n('serialNumber')}
            defaultValue={defaultValue(defaults.serialNumber)}
            placeholder="Device serial"
            className={inputClass}
          />
        </Field>
        <Field label="Due date">
          <input
            type="date"
            name={n('dueDate')}
            defaultValue={defaults.dueDate ? String(defaults.dueDate).slice(0, 10) : undefined}
            className={inputClass}
          />
        </Field>
      </div>

      {showFinancials && (
        <div className={row}>
          <Field label="Est. hours">
            <input
              type="number"
              step="0.25"
              min="0"
              name={n('estimatedHours')}
              defaultValue={defaultValue(defaults.estimatedHours)}
              className={inputClass}
            />
          </Field>
          <Field label="Actual hours">
            <input
              type="number"
              step="0.25"
              min="0"
              name={n('actualHours')}
              defaultValue={defaultValue(defaults.actualHours)}
              className={inputClass}
            />
          </Field>
          <Field label="Est. cost (TTD)">
            <input
              type="number"
              step="0.01"
              min="0"
              name={n('estimatedCost')}
              defaultValue={defaultValue(defaults.estimatedCost)}
              className={inputClass}
            />
          </Field>
          <Field label="Actual cost (TTD)">
            <input
              type="number"
              step="0.01"
              min="0"
              name={n('actualCost')}
              defaultValue={defaultValue(defaults.actualCost)}
              className={inputClass}
            />
          </Field>
        </div>
      )}

      <Field label="Tags (comma-separated)">
        <input
          name={n('tagsText')}
          defaultValue={
            Array.isArray(defaults.tags)
              ? (defaults.tags as string[]).join(', ')
              : defaultValue(defaults.tagsText)
          }
          placeholder="urgent, warranty, onsite"
          className={inputClass}
        />
      </Field>
    </div>
  );
}

function Field({
  label,
  required,
  className,
  children,
}: {
  label: string;
  required?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <label className={className ?? 'block'}>
      <span className="mb-1 block text-sm font-medium text-slate-700">
        {label}
        {required && <span className="text-red-500"> *</span>}
      </span>
      {children}
    </label>
  );
}

export function parseTagsInput(value: string): string[] {
  return value
    .split(',')
    .map((t) => t.trim())
    .filter(Boolean);
}

export function formDataToTicketPayload(form: FormData, extra: Record<string, unknown> = {}) {
  const tagsText = form.get('tagsText') as string;
  const clientId = form.get('clientId');
  return {
    ...(typeof clientId === 'string' && clientId.trim() ? { clientId: clientId.trim() } : {}),
    issue: form.get('issue') as string,
    clientContactNumber: (form.get('clientContactNumber') as string) || undefined,
    notes: (form.get('notes') as string) || undefined,
    priority: form.get('priority') as string,
    category: form.get('category') as string,
    location: form.get('location') as string,
    subscription: (form.get('subscription') as string) || undefined,
    deviceType: form.get('deviceType') as string,
    deviceModel: (form.get('deviceModel') as string) || undefined,
    serialNumber: (form.get('serialNumber') as string) || undefined,
    dueDate: (form.get('dueDate') as string) || undefined,
    status: (form.get('status') as string) || undefined,
    isActive: form.get('isActive') ? Number(form.get('isActive')) : undefined,
    estimatedHours: form.get('estimatedHours') || undefined,
    actualHours: form.get('actualHours') || undefined,
    estimatedCost: form.get('estimatedCost') || undefined,
    actualCost: form.get('actualCost') || undefined,
    assignedTo: form.get('assignedTo') ? Number(form.get('assignedTo')) : undefined,
    tags: tagsText ? parseTagsInput(tagsText) : [],
    ...extra,
  };
}
