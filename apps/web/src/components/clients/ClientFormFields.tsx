'use client';

import { useEffect, useMemo, useState, type ReactNode } from 'react';
import {
  ACTIVATION_FEATURE_LABELS,
  ACTIVATION_FEATURES,
  getActivationFeatures,
  type ActivationFeature,
} from '@/lib/license-constants';
import { PhoneInput } from '@/components/ui/PhoneInput';
import { normalizeStoredPhone } from '@/lib/phone-utils';
import {
  BILLING_CYCLES,
  CLIENT_STATUSES,
  PRIORITY_LEVELS,
  SERVICE_LEVELS,
  SERVICE_PLANS,
  SUPPORT_TIERS,
  buildUsageLimitsFromLevel,
  getDefaultMonthlyRate,
  getDefaultSlaForLevel,
  getPlanForLevel,
  getUsageMetricsForLevel,
  isMspRecurringLevel,
} from '@/lib/client-constants';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

function defaultValue(value: unknown): string | number | undefined {
  if (value == null || typeof value === 'object') return undefined;
  return value as string | number;
}

function formatDate(value: unknown) {
  if (!value) return '';
  return String(value).slice(0, 10);
}

const usageFieldMap = {
  onsiteVisits: { used: 'onsiteVisitsUsed', limit: 'onsiteVisitsLimit', label: 'Onsite visits' },
  supportTickets: { used: 'supportTicketsUsed', limit: 'supportTicketsLimit', label: 'Support tickets' },
  endpoints: { used: 'endpointsUsed', limit: 'endpointsLimit', label: 'Endpoints' },
  supportHours: { used: 'supportHoursUsed', limit: 'supportHoursLimit', label: 'Support hours' },
} as const;

export function ClientFormFields({
  defaults = {},
  layout = 'default',
  showUsage = false,
  showContract = false,
  showPortalOption = false,
  showActivationFeatures = true,
  technicians = [],
}: {
  defaults?: Record<string, string | number | boolean | string[] | null | undefined | Record<string, unknown>>;
  layout?: 'default' | 'wide';
  showUsage?: boolean;
  showContract?: boolean;
  showPortalOption?: boolean;
  showActivationFeatures?: boolean;
  technicians?: Array<{ id: number; firstName: string; lastName: string }>;
}) {
  const wide = layout === 'wide';
  const row = wide ? 'grid gap-3 lg:grid-cols-4' : 'grid gap-4 sm:grid-cols-2';
  const gap = wide ? 'space-y-3' : 'space-y-4';

  const initialLevel = String(defaults.serviceLevel ?? '');
  const initialUsage = (defaults.usageTracking as Record<string, number> | undefined) ?? {};
  const plan = (defaults.servicePlanData as Record<string, unknown> | undefined) ?? {};

  const initialFeatures = getActivationFeatures(defaults.features);

  const [serviceLevel, setServiceLevel] = useState(initialLevel);
  const [monthlyRate, setMonthlyRate] = useState<string>(() => {
    if (defaults.monthlyRate != null && defaults.monthlyRate !== '') return String(defaults.monthlyRate);
    const rate = getDefaultMonthlyRate(initialLevel || null);
    return rate != null ? String(rate) : '';
  });
  const [usage, setUsage] = useState(() => buildUsageLimitsFromLevel(initialLevel || null, initialUsage));

  const selectedPlan = getPlanForLevel(serviceLevel || null);
  const isRecurring = isMspRecurringLevel(serviceLevel || null);
  const isPerJob = serviceLevel === 'per-job';
  const hasPlan = Boolean(serviceLevel);
  const usageMetrics = getUsageMetricsForLevel(serviceLevel || null);
  const showUsageFields = showUsage && hasPlan && !isPerJob && usageMetrics.length > 0;
  const showContractFields = (showContract || defaults.startDate || isRecurring) && hasPlan;
  const monthlyRateReadOnly = isRecurring;

  useEffect(() => {
    if (serviceLevel === initialLevel) return;
    const rate = getDefaultMonthlyRate(serviceLevel || null);
    setMonthlyRate(rate != null ? String(rate) : '');
    setUsage((prev) => buildUsageLimitsFromLevel(serviceLevel || null, prev));
  }, [serviceLevel, initialLevel]);

  const sla = useMemo(() => getDefaultSlaForLevel(serviceLevel || null), [serviceLevel]);

  return (
    <div className={gap}>
      <div className={row}>
        <Field label="Contact name" required className={wide ? 'lg:col-span-2' : undefined}>
          <input name="name" required defaultValue={defaultValue(defaults.name)} className={inputClass} />
        </Field>
        <Field label="Company name" className={wide ? 'lg:col-span-2' : undefined}>
          <input name="companyName" defaultValue={defaultValue(defaults.companyName)} className={inputClass} />
        </Field>
      </div>

      <div className={row}>
        <Field label="Email" required>
          <input
            name="email"
            type="email"
            required
            defaultValue={defaultValue(defaults.email)}
            className={inputClass}
          />
        </Field>
        <Field label="Phone">
          <PhoneInput name="phone" defaultValue={String(defaults.phone ?? '')} />
        </Field>
        <Field label="Contact person">
          <input name="contactPerson" defaultValue={defaultValue(defaults.contactPerson)} className={inputClass} />
        </Field>
        <Field label="Priority">
          <select name="priorityLevel" defaultValue={String(defaults.priorityLevel ?? 'medium')} className={inputClass}>
            {PRIORITY_LEVELS.map((p) => (
              <option key={p} value={p}>
                {p}
              </option>
            ))}
          </select>
        </Field>
      </div>

      <Field label="Address">
        <textarea
          name="address"
          rows={wide ? 2 : 3}
          defaultValue={defaultValue(defaults.address)}
          className={inputClass}
        />
      </Field>

      <div className={row}>
        <Field label="Service level">
          <select
            name="serviceLevel"
            value={serviceLevel}
            onChange={(e) => setServiceLevel(e.target.value)}
            className={inputClass}
          >
            <option value="">No plan</option>
            {SERVICE_LEVELS.map((s) => (
              <option key={s} value={s}>
                {SERVICE_PLANS[s].name}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Support tier">
          <select name="supportTier" defaultValue={String(defaults.supportTier ?? 'silver')} className={inputClass}>
            {SUPPORT_TIERS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </Field>
        <Field label="Status">
          <select name="status" defaultValue={String(defaults.status ?? 'active')} className={inputClass}>
            {CLIENT_STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </Field>
        {hasPlan && (
          <Field label={isPerJob ? 'Rate per job (TTD)' : 'Monthly rate (TTD)'}>
            <input
              type="number"
              step="0.01"
              min="0"
              name="monthlyRate"
              value={monthlyRate}
              readOnly={monthlyRateReadOnly}
              onChange={(e) => setMonthlyRate(e.target.value)}
              placeholder={isPerJob ? 'Enter custom rate' : undefined}
              className={`${inputClass} ${monthlyRateReadOnly ? 'bg-slate-50 text-slate-700' : ''}`}
            />
          </Field>
        )}
      </div>

      {selectedPlan && (
        <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-4">
          <p className="text-sm font-semibold text-indigo-900">{selectedPlan.name}</p>
          {isRecurring && selectedPlan.price != null && (
            <p className="mt-1 text-xs text-indigo-700">
              Plan rate: TTD {selectedPlan.price.toLocaleString('en-TT', { minimumFractionDigits: 2 })}
            </p>
          )}
          <ul className="mt-2 grid gap-1 text-xs text-slate-600 sm:grid-cols-2">
            {selectedPlan.features.map((feature) => (
              <li key={feature} className="flex items-start gap-1.5">
                <span className="mt-0.5 text-indigo-500">•</span>
                {feature}
              </li>
            ))}
          </ul>
          {hasPlan && !isPerJob && (
            <p className="mt-3 text-xs text-slate-500">
              SLA: {sla.responseTime} response · {sla.resolutionTime} resolution · {sla.supportHours} support
            </p>
          )}
        </div>
      )}

      {showContractFields && (
        <div className={row}>
          {technicians.length > 0 && isRecurring && (
            <Field label="Assigned technician">
              <select
                name="assignedTechnicianId"
                defaultValue={String(defaults.assignedTechnicianId ?? '')}
                className={inputClass}
              >
                <option value="">Unassigned</option>
                {technicians.map((t) => (
                  <option key={t.id} value={t.id}>
                    {t.firstName} {t.lastName}
                  </option>
                ))}
              </select>
            </Field>
          )}
          <Field label="Start date">
            <input type="date" name="startDate" defaultValue={formatDate(defaults.startDate)} className={inputClass} />
          </Field>
          {isRecurring && (
            <>
              <Field label="End date">
                <input type="date" name="endDate" defaultValue={formatDate(defaults.endDate)} className={inputClass} />
              </Field>
              <Field label="Contract start">
                <input
                  type="date"
                  name="contractStartDate"
                  defaultValue={formatDate(defaults.contractStartDate)}
                  className={inputClass}
                />
              </Field>
              <Field label="Contract end">
                <input
                  type="date"
                  name="contractEndDate"
                  defaultValue={formatDate(defaults.contractEndDate)}
                  className={inputClass}
                />
              </Field>
              <Field label="Renewal date">
                <input
                  type="date"
                  name="renewalDate"
                  defaultValue={formatDate(defaults.renewalDate)}
                  className={inputClass}
                />
              </Field>
              <Field label="Billing cycle">
                <select name="billingCycle" defaultValue={String(plan.billingCycle ?? 'monthly')} className={inputClass}>
                  {BILLING_CYCLES.map((c) => (
                    <option key={c} value={c}>
                      {c}
                    </option>
                  ))}
                </select>
              </Field>
            </>
          )}
        </div>
      )}

      {showUsageFields && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">Usage limits</p>
          <div className={row}>
            {usageMetrics.map((metric) => {
              const fields = usageFieldMap[metric];
              return (
                <div key={metric} className="contents">
                  <Field label={`${fields.label} used`}>
                    <input
                      type="number"
                      min="0"
                      step={metric === 'supportHours' ? '0.25' : '1'}
                      name={fields.used}
                      value={usage[fields.used as keyof typeof usage] ?? 0}
                      onChange={(e) =>
                        setUsage((prev) => ({ ...prev, [fields.used]: Number(e.target.value || 0) }))
                      }
                      className={inputClass}
                    />
                  </Field>
                  <Field label={`${fields.label} limit`}>
                    <input
                      type="number"
                      min="0"
                      step={metric === 'supportHours' ? '0.25' : '1'}
                      name={fields.limit}
                      value={usage[fields.limit as keyof typeof usage] ?? 0}
                      onChange={(e) =>
                        setUsage((prev) => ({ ...prev, [fields.limit]: Number(e.target.value || 0) }))
                      }
                      className={inputClass}
                    />
                  </Field>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {showActivationFeatures && (
        <div>
          <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">
            Activation features (license systems)
          </p>
          <p className="mb-3 text-xs text-slate-500">
            Select management systems that require license activation. Save the client, then sync licenses.
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACTIVATION_FEATURES.map((feature) => (
              <label
                key={feature}
                className="flex cursor-pointer items-start gap-3 rounded-xl border border-slate-200 bg-slate-50/50 p-3 hover:border-indigo-200"
              >
                <input
                  type="checkbox"
                  name="features"
                  value={feature}
                  defaultChecked={initialFeatures.includes(feature)}
                  className="mt-1 rounded border-slate-300 text-indigo-600"
                />
                <span>
                  <span className="block text-sm font-medium text-slate-800">
                    {ACTIVATION_FEATURE_LABELS[feature].title}
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    {ACTIVATION_FEATURE_LABELS[feature].description}
                  </span>
                </span>
              </label>
            ))}
          </div>
        </div>
      )}

      <Field label="Notes">
        <textarea name="notes" rows={wide ? 2 : 3} defaultValue={defaultValue(defaults.notes)} className={inputClass} />
      </Field>

      {showPortalOption && (
        <label className="flex items-center gap-2 text-sm text-slate-600">
          <input type="checkbox" name="createPortalAccount" defaultChecked={false} className="rounded" />
          Create portal account (pending until password is set)
        </label>
      )}
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

export function formDataToClientPayload(form: FormData, extra: Record<string, unknown> = {}) {
  const serviceLevel = (form.get('serviceLevel') as string) || null;
  const usageFields = [
    'onsiteVisitsUsed',
    'onsiteVisitsLimit',
    'supportTicketsUsed',
    'supportTicketsLimit',
    'endpointsUsed',
    'endpointsLimit',
    'supportHoursUsed',
    'supportHoursLimit',
  ] as const;

  const hasUsage = usageFields.some((f) => form.get(f) != null && form.get(f) !== '');
  const usageTracking = hasUsage
    ? Object.fromEntries(usageFields.map((f) => [f, Number(form.get(f) || 0)]))
    : serviceLevel
      ? buildUsageLimitsFromLevel(serviceLevel)
      : undefined;

  const monthlyRateRaw = form.get('monthlyRate');
  const features = form.getAll('features') as ActivationFeature[];
  let monthlyRate: number | undefined;
  if (monthlyRateRaw != null && monthlyRateRaw !== '') {
    monthlyRate = Number(monthlyRateRaw);
  } else if (serviceLevel) {
    const defaultRate = getDefaultMonthlyRate(serviceLevel);
    if (defaultRate != null) monthlyRate = defaultRate;
  }

  return {
    name: form.get('name') as string,
    companyName: (form.get('companyName') as string) || undefined,
    email: form.get('email') as string,
    phone: normalizeStoredPhone((form.get('phone') as string) || undefined),
    address: (form.get('address') as string) || undefined,
    contactPerson: (form.get('contactPerson') as string) || undefined,
    serviceLevel,
    supportTier: form.get('supportTier') as string,
    status: form.get('status') as string,
    priorityLevel: form.get('priorityLevel') as string,
    monthlyRate,
    startDate: (form.get('startDate') as string) || undefined,
    endDate: (form.get('endDate') as string) || undefined,
    contractStartDate: (form.get('contractStartDate') as string) || undefined,
    contractEndDate: (form.get('contractEndDate') as string) || undefined,
    renewalDate: (form.get('renewalDate') as string) || undefined,
    assignedTechnicianId: (form.get('assignedTechnicianId') as string) || undefined,
    notes: (form.get('notes') as string) || undefined,
    createPortalAccount: form.get('createPortalAccount') === 'on',
    servicePlanData: form.get('billingCycle')
      ? {
          billingCycle: form.get('billingCycle') as string,
          planName: serviceLevel ? SERVICE_PLANS[serviceLevel as keyof typeof SERVICE_PLANS]?.name : '',
        }
      : serviceLevel
        ? { planName: SERVICE_PLANS[serviceLevel as keyof typeof SERVICE_PLANS]?.name }
        : undefined,
    slaAgreement: serviceLevel ? getDefaultSlaForLevel(serviceLevel) : undefined,
    features,
    ...(usageTracking ? { usageTracking } : {}),
    ...extra,
  };
}
