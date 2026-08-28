'use client';

import { useMemo } from 'react';
import type { ReactNode } from 'react';
import { Printer, ShieldCheck } from 'lucide-react';
import { enrichDigitalLicense, type DigitalLicenseCertificate } from '@/lib/digital-license-shared';

type Props = {
  license: DigitalLicenseCertificate;
  className?: string;
  showPrint?: boolean;
  serialsRevealed?: boolean;
};

function formatDate(value: string | null | undefined): string {
  if (!value?.trim()) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}

function ClauseBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-4">
      <h4 className="text-xs font-semibold uppercase tracking-wide text-slate-500">{title}</h4>
      <div className="mt-2 text-sm leading-relaxed text-slate-700">{children}</div>
    </section>
  );
}

export function DigitalLicenseCard({
  license: licenseProp,
  className = '',
  showPrint = true,
  serialsRevealed = true,
}: Props) {
  const license = useMemo(() => enrichDigitalLicense(licenseProp), [licenseProp]);
  function handlePrint() {
    window.print();
  }

  const serialProtected =
    !serialsRevealed && Boolean(license.serialNumber?.includes('•'));

  return (
    <div className={`digital-license-card ${className}`.trim()}>
      <div className="overflow-hidden rounded-2xl border-2 border-indigo-200 bg-gradient-to-b from-white to-indigo-50/40 shadow-sm print:border-slate-300 print:shadow-none">
        <div className="border-b border-indigo-100 bg-indigo-950 px-6 py-5 text-white print:border-slate-200 print:bg-white print:text-slate-900">
          <div className="flex items-start justify-between gap-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-[0.2em] text-indigo-200 print:text-slate-500">
                {license.licensorName}
              </p>
              <h3 className="mt-1 text-xl font-semibold">{license.certificateTitle}</h3>
              <p className="mt-1 text-sm text-indigo-100 print:text-slate-600">
                Proprietary software — not open source
              </p>
            </div>
            <ShieldCheck className="h-10 w-10 shrink-0 text-indigo-300 print:text-indigo-700" />
          </div>
        </div>

        <div className="space-y-5 px-6 py-6 text-sm text-slate-700">
          <p className="rounded-xl border border-slate-200 bg-slate-50 p-4 leading-relaxed text-slate-700">
            {license.proprietaryNotice}
          </p>

          <dl className="grid gap-3 sm:grid-cols-2">
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Licensor
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{license.licensorName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Licensee
              </dt>
              <dd className="mt-1 font-medium text-slate-900">{license.licenseeOrganization}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Primary contact
              </dt>
              <dd className="mt-1 text-slate-800">{license.licenseeContact || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Licensed product
              </dt>
              <dd className="mt-1 text-slate-800">
                {license.licensedProduct}
                {license.systemVersion ? (
                  <span className="text-slate-500"> · {license.systemVersion}</span>
                ) : null}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                System key
              </dt>
              <dd className="mt-1 font-mono text-slate-800">{license.systemKey}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Serial number
              </dt>
              <dd className="mt-1 font-mono text-slate-900">
                {license.serialNumber || 'Pending assignment'}
              </dd>
              {serialProtected && (
                <p className="mt-1 text-xs text-slate-500">
                  Unlock with your portal password to view the full serial.
                </p>
              )}
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                License type & status
              </dt>
              <dd className="mt-1 text-slate-800">
                {license.licenseType || '—'} · {license.licenseStatus}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Max users
              </dt>
              <dd className="mt-1 text-slate-800">
                {license.maxUsers != null && license.maxUsers > 0 ? license.maxUsers : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Project reference
              </dt>
              <dd className="mt-1 text-slate-800">{license.projectReference || '—'}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Certificate issued
              </dt>
              <dd className="mt-1 text-slate-800">{formatDate(license.issuedAt)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Activation date
              </dt>
              <dd className="mt-1 text-slate-800">{formatDate(license.activationDate)}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Expiration
              </dt>
              <dd className="mt-1 text-slate-800">{formatDate(license.expirationDate)}</dd>
            </div>
          </dl>

          <ClauseBlock title="1. Grant of license">
            <p>{license.grantOfLicense}</p>
          </ClauseBlock>

          <ClauseBlock title="2. Scope of use">
            <p>{license.scopeOfUse}</p>
          </ClauseBlock>

          <ClauseBlock title="3. Intellectual property & ownership">
            <p>{license.ipOwnership}</p>
          </ClauseBlock>

          <ClauseBlock title="4. Restrictions">
            <ul className="list-disc space-y-2 pl-5">
              {license.restrictions.map((item) => (
                <li key={item}>{item}</li>
              ))}
            </ul>
          </ClauseBlock>

          <ClauseBlock title="5. Governing documents">
            <p>{license.governingDocuments}</p>
          </ClauseBlock>

          <ClauseBlock title="6. Updates & maintenance">
            <p>{license.updatesPolicy || 'Updates are not guaranteed after acceptance unless separately agreed.'}</p>
          </ClauseBlock>

          <ClauseBlock title="7. Term & termination">
            <p>{license.termAndTermination}</p>
          </ClauseBlock>

          <div className="grid gap-4 sm:grid-cols-2">
            <ClauseBlock title="8. Warranty">
              <p>{license.warrantyDisclaimer}</p>
            </ClauseBlock>
            <ClauseBlock title="9. Limitation of liability">
              <p>{license.limitationOfLiability}</p>
            </ClauseBlock>
          </div>

          <div className="rounded-xl border border-amber-200 bg-amber-50/60 p-4">
            <h4 className="text-xs font-semibold uppercase tracking-wide text-amber-800">
              Activation & compliance
            </h4>
            <p className="mt-2 text-sm leading-relaxed text-amber-950/80">
              {license.complianceNotice}
            </p>
          </div>

          <div className="border-t border-slate-200 pt-4 text-xs text-slate-500">
            <p>
              <strong className="text-slate-700">{license.licensorName}</strong> ·{' '}
              {license.licensorContact}
            </p>
            {license.deliverableVersion ? (
              <p className="mt-1">Platform delivery record version {license.deliverableVersion}</p>
            ) : null}
            <p className="mt-1 font-mono text-[10px] text-slate-400">
              Certificate ID: {license.certificateId}
            </p>
          </div>
        </div>
      </div>

      {showPrint && (
        <div className="mt-3 flex justify-end print:hidden">
          <button
            type="button"
            onClick={handlePrint}
            className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            <Printer className="h-4 w-4" />
            Print license certificate
          </button>
        </div>
      )}
    </div>
  );
}
