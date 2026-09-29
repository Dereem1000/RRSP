'use client';

import { useEffect, useState } from 'react';
import {
  Building2,
  CheckCircle2,
  Loader2,
  MapPin,
  Users,
  X,
} from 'lucide-react';
import { RRSP_MODULE_LABELS, type RrspModule } from '@/lib/rrsp';
import { RrspStaffLoginUrl } from '@/components/portal/RrspStaffLoginUrl';
import type { ProfileTab } from '@/components/portal/AccountProfileModal';
import type { RrspContactField } from '@/lib/rrsp-contact';

const CONTACT_LABELS: Record<RrspContactField, string> = {
  address: 'Business address',
  email: 'Contact email',
  phone: 'Contact phone',
};

export function RrspWelcomeModal({
  open,
  onClose,
  onHidePermanently,
  onOpenProfile,
}: {
  open: boolean;
  onClose: () => void;
  onHidePermanently: () => Promise<void>;
  onOpenProfile: (tab: ProfileTab) => void;
}) {
  const [loading, setLoading] = useState(true);
  const [hiding, setHiding] = useState(false);
  const [companyName, setCompanyName] = useState('');
  const [needsContact, setNeedsContact] = useState(false);
  const [missingFields, setMissingFields] = useState<RrspContactField[]>([]);
  const [staffLoginEnabled, setStaffLoginEnabled] = useState(false);
  const [shopLoginSlug, setShopLoginSlug] = useState('');
  const [licensedModules, setLicensedModules] = useState<RrspModule[]>([]);

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    (async () => {
      setLoading(true);
      try {
        const [profileRes, rrspRes, staffRes] = await Promise.all([
          fetch('/api/auth/profile', { cache: 'no-store' }),
          fetch('/api/auth/profile/rrsp', { cache: 'no-store' }),
          fetch('/api/auth/profile/rrsp/staff', { cache: 'no-store' }),
        ]);
        const profile = await profileRes.json();
        const rrsp = rrspRes.ok ? await rrspRes.json() : null;
        const staff = staffRes.ok ? await staffRes.json() : null;
        if (cancelled) return;

        setNeedsContact(Boolean(profile.rrspNeedsContact));
        setMissingFields((profile.missingContactFields ?? []) as RrspContactField[]);
        setCompanyName(
          String(rrsp?.branding?.companyName ?? profile.client?.companyName ?? profile.client?.name ?? '')
            .trim() || 'your shop'
        );
        setStaffLoginEnabled(Boolean(rrsp?.staffLoginEnabled));
        setShopLoginSlug(String(rrsp?.shopLoginSlug ?? '').trim());
        setLicensedModules((staff?.licensedModules ?? []) as RrspModule[]);
      } catch {
        if (!cancelled) {
          setNeedsContact(false);
          setMissingFields([]);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [open]);

  if (!open) return null;

  async function hideGuide() {
    setHiding(true);
    try {
      await onHidePermanently();
      onClose();
    } finally {
      setHiding(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[95] flex items-end justify-center bg-slate-950/50 p-3 backdrop-blur-sm sm:items-center sm:p-4">
      <div
        className="max-h-[min(92dvh,44rem)] w-full max-w-2xl overflow-y-auto overscroll-contain rounded-t-2xl bg-white shadow-2xl sm:rounded-2xl"
        role="dialog"
        aria-labelledby="rrms-welcome-title"
        aria-modal="true"
      >
        <div className="sticky top-0 z-[1] flex items-start justify-between gap-3 border-b border-slate-100 bg-white px-5 py-4 sm:px-6">
          <div className="min-w-0">
            <p className="text-xs font-semibold uppercase tracking-wide text-indigo-600">RRMS</p>
            <h2 id="rrms-welcome-title" className="text-lg font-semibold text-slate-900 sm:text-xl">
              Welcome to your shop portal
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              A quick guide to business setup, staff sign-in, and permissions.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:bg-slate-50"
            aria-label="Close welcome guide"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {loading ? (
          <div className="flex items-center justify-center gap-2 px-6 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin" />
            Loading your shop details…
          </div>
        ) : (
          <div className="space-y-4 px-5 py-5 sm:px-6">
            {needsContact ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-950">
                <div className="flex items-start gap-2">
                  <MapPin className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" />
                  <div>
                    <p className="font-semibold">Finish your business setup</p>
                    <p className="mt-1 text-amber-900/85">
                      Add {missingFields.map((f) => CONTACT_LABELS[f]).join(', ') || 'your business contact details'}{' '}
                      so parts routing, delivery, and shop features work correctly.
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenProfile('account');
                        onClose();
                      }}
                      className="mt-3 rounded-lg bg-amber-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-amber-700"
                    >
                      Complete setup now
                    </button>
                  </div>
                </div>
              </div>
            ) : (
              <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
                <div className="flex items-start gap-2">
                  <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
                  <p>
                    Your core business contact details are saved. You can update them anytime under{' '}
                    <span className="font-medium">Business info</span>.
                  </p>
                </div>
              </div>
            )}

            <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Building2 className="h-4 w-4 text-indigo-600" />
                Business info
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Open your profile and choose <strong>Business info</strong> to set {companyName}&apos;s logo,
                address, phone, and website. Your address powers parts delivery and marketplace distance
                calculations.
              </p>
              <button
                type="button"
                onClick={() => {
                  onOpenProfile('business');
                  onClose();
                }}
                className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                Open Business info
              </button>
            </section>

            <section className="rounded-xl border border-slate-200 bg-slate-50/80 px-4 py-4">
              <div className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Users className="h-4 w-4 text-indigo-600" />
                Staff login &amp; permissions
              </div>
              <p className="mt-2 text-sm leading-relaxed text-slate-600">
                Turn on <strong>Allow my staff to login</strong> under Business info, then add team members
                on the <strong>Staff</strong> tab. Each staff account uses{' '}
                <span className="font-mono text-slate-800">username@{shopLoginSlug || 'yourshop'}</span> and
                only sees the modules you assign (tickets, parts, POS, and more).
              </p>
              {staffLoginEnabled && shopLoginSlug ? (
                <div className="mt-3">
                  <RrspStaffLoginUrl shopLoginSlug={shopLoginSlug} />
                </div>
              ) : (
                <p className="mt-2 text-xs text-slate-500">
                  Staff login is currently off. Enable it in Business info to generate your employee sign-in
                  URL.
                </p>
              )}
              <button
                type="button"
                onClick={() => {
                  onOpenProfile(staffLoginEnabled ? 'staff' : 'business');
                  onClose();
                }}
                className="mt-3 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50"
              >
                {staffLoginEnabled ? 'Manage staff & permissions' : 'Enable staff login'}
              </button>
              {licensedModules.length > 0 ? (
                <p className="mt-3 text-xs text-slate-500">
                  Licensed modules you can assign:{' '}
                  {licensedModules.map((m) => RRSP_MODULE_LABELS[m]).join(', ')}.
                </p>
              ) : null}
            </section>
          </div>
        )}

        <div className="sticky bottom-0 flex flex-col gap-2 border-t border-slate-100 bg-white px-5 py-4 sm:flex-row sm:items-center sm:justify-between sm:px-6">
          <button
            type="button"
            onClick={() => void hideGuide()}
            disabled={hiding || loading}
            className="text-left text-xs font-medium text-slate-500 underline underline-offset-2 hover:text-slate-800 disabled:opacity-60"
          >
            {hiding ? 'Saving…' : "Don't show this guide again"}
          </button>
          <div className="flex flex-col gap-2 sm:flex-row sm:justify-end">
            <button
              type="button"
              onClick={onClose}
              className="min-h-11 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              Continue to portal
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
