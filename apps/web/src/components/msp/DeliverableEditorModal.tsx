'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { createPortal } from 'react-dom';
import { FileText, HelpCircle, Loader2, Send, X } from 'lucide-react';
import type { ActivationFeature } from '@/lib/license-constants';
import { DeliverableMarkdownBody } from '@/components/deliverables/DeliverableMarkdownBody';
import { DigitalLicenseCard } from '@/components/deliverables/DigitalLicenseCard';
import { enrichDigitalLicense, type DigitalLicenseCertificate } from '@/lib/digital-license-shared';
import {
  applyPlaceholders,
  getPlaceholderFieldMeta,
  toClientDeliverable,
} from '@/lib/deliverable-template';
import {
  LicenseSerialUnlockPanel,
  useLicenseSerialReveal,
} from '@/components/licenses/LicenseSerialUnlockPanel';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

const textareaClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20 min-h-[4.5rem] resize-y';

type Props = {
  clientId: string;
  clientName: string;
  feature: ActivationFeature;
  open: boolean;
  onClose: () => void;
  onSaved?: () => void;
};

export function DeliverableEditorModal({ clientId, clientName, feature, open, onClose, onSaved }: Props) {
  const [mounted, setMounted] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [placeholders, setPlaceholders] = useState<Record<string, string>>({});
  const [templateMarkdown, setTemplateMarkdown] = useState('');
  const [cachedStaffMarkdown, setCachedStaffMarkdown] = useState('');
  const [digitalLicense, setDigitalLicense] = useState<DigitalLicenseCertificate | null>(null);
  const [previewTab, setPreviewTab] = useState<'staff' | 'client' | 'license'>('client');
  const serialReveal = useLicenseSerialReveal();

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const qs = new URLSearchParams({ clientId, feature });
      const res = await fetch(`/api/msp/management-systems/deliverable?${qs}`, {
        credentials: 'include',
        headers: serialReveal.authHeaders(),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Failed to load deliverable');
      setPlaceholders(data.placeholders || {});
      setTemplateMarkdown(String(data.templateMarkdown || ''));
      setCachedStaffMarkdown(String(data.staffMarkdown || ''));
      setDigitalLicense(data.digitalLicense ?? null);
      if (typeof data.serialsRevealed === 'boolean') {
        serialReveal.applyRevealResponse(data.serialsRevealed);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load');
    } finally {
      setLoading(false);
    }
  }, [clientId, feature, serialReveal.authHeaders, serialReveal.applyRevealResponse]);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (open) void load();
  }, [open, load, serialReveal.revealed]);

  useEffect(() => {
    if (!open) return undefined;
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.body.style.overflow = prev;
    };
  }, [open]);

  const staffMarkdown = useMemo(() => {
    if (templateMarkdown.trim()) {
      return applyPlaceholders(templateMarkdown, placeholders);
    }
    return cachedStaffMarkdown;
  }, [templateMarkdown, placeholders, cachedStaffMarkdown]);

  const clientMarkdown = useMemo(() => toClientDeliverable(staffMarkdown), [staffMarkdown]);

  const displayLicense = useMemo((): DigitalLicenseCertificate | null => {
    if (!digitalLicense) return null;
    return enrichDigitalLicense({
      ...digitalLicense,
      licenseeOrganization:
        placeholders['[Client / Organization Name]']?.trim() || digitalLicense.licenseeOrganization,
      licenseeContact:
        placeholders['[Name, email, phone]']?.trim() || digitalLicense.licenseeContact,
      projectReference:
        placeholders['[Project / Invoice Reference]']?.trim() || digitalLicense.projectReference,
    });
  }, [digitalLicense, placeholders]);

  const previewMarkdown = previewTab === 'staff' ? staffMarkdown : clientMarkdown;

  const placeholderEntries = useMemo(
    () => Object.entries(placeholders).sort(([a], [b]) => a.localeCompare(b)),
    [placeholders],
  );

  if (!open || !mounted) return null;

  async function saveDraft() {
    setSaving(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/msp/management-systems/deliverable', {
        method: 'PUT',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...serialReveal.authHeaders(),
        },
        body: JSON.stringify({ clientId, feature, placeholders }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Save failed');
      setCachedStaffMarkdown(String(data.staffMarkdown || ''));
      if (data.digitalLicense) setDigitalLicense(data.digitalLicense);
      if (data.templateMarkdown) setTemplateMarkdown(String(data.templateMarkdown));
      setMessage('Draft saved.');
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  }

  async function sendToClient() {
    setSending(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch('/api/msp/management-systems/deliverable', {
        method: 'POST',
        credentials: 'include',
        headers: {
          'Content-Type': 'application/json',
          ...serialReveal.authHeaders(),
        },
        body: JSON.stringify({ action: 'send', clientId, feature, placeholders }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) throw new Error(data.message || 'Send failed');
      if (data.engagement?.digitalLicense) setDigitalLicense(data.engagement.digitalLicense);
      setMessage('Deliverable and digital license sent to client (email + portal).');
      onSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setSending(false);
    }
  }

  return createPortal(
    <div className="fixed inset-0 z-[100] flex flex-col bg-slate-50">
      <header className="flex shrink-0 items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
        <div className="flex items-center gap-3">
          <FileText className="h-6 w-6 text-indigo-600" />
          <div>
            <h2 className="text-xl font-semibold text-slate-900">Project deliverable</h2>
            <p className="text-sm text-slate-500">
              {clientName} · Edit template fields, preview, then save or send to the client portal.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={onClose}
          className="rounded-xl border border-slate-200 p-2 text-slate-500 hover:bg-slate-50"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>
      </header>

      {loading ? (
        <div className="flex flex-1 items-center justify-center gap-2 text-slate-500">
          <Loader2 className="h-5 w-5 animate-spin" /> Loading deliverable…
        </div>
      ) : (
        <div className="grid min-h-0 flex-1 gap-0 overflow-hidden lg:grid-cols-[minmax(22rem,28rem)_1fr]">
          <aside className="flex min-h-0 flex-col overflow-hidden border-b border-slate-200 bg-white lg:border-b-0 lg:border-r">
            <div className="border-b border-slate-100 px-5 py-4">
              <h3 className="text-sm font-semibold text-slate-900">Template fields</h3>
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                Each field replaces a{' '}
                <code className="rounded bg-slate-100 px-1">[placeholder]</code> in{' '}
                <code className="rounded bg-slate-100 px-1">DELIVERABLE.md</code>. Values auto-fill from
                the client record where possible — review before sending.
              </p>
            </div>
            <div className="flex-1 space-y-5 overflow-y-auto px-5 py-4">
              {placeholderEntries.map(([token, value]) => {
                const meta = getPlaceholderFieldMeta(token);
                return (
                  <label key={token} className="block">
                    <span className="text-sm font-medium text-slate-800">{meta.label}</span>
                    <p className="mt-1 flex gap-1.5 text-xs leading-relaxed text-slate-500">
                      <HelpCircle className="mt-0.5 h-3.5 w-3.5 shrink-0 text-slate-400" />
                      <span>{meta.help}</span>
                    </p>
                    <p className="mt-1.5 font-mono text-[10px] text-slate-400">{token}</p>
                    {meta.multiline ? (
                      <textarea
                        className={`${textareaClass} mt-2`}
                        value={value}
                        rows={3}
                        onChange={(e) =>
                          setPlaceholders((prev) => ({ ...prev, [token]: e.target.value }))
                        }
                      />
                    ) : (
                      <input
                        className={`${inputClass} mt-2`}
                        value={value}
                        onChange={(e) =>
                          setPlaceholders((prev) => ({ ...prev, [token]: e.target.value }))
                        }
                      />
                    )}
                  </label>
                );
              })}
              {placeholderEntries.length === 0 && (
                <p className="text-sm text-slate-500">No placeholders found in template.</p>
              )}
            </div>
          </aside>

          <section className="flex min-h-0 flex-col overflow-hidden bg-white">
            <div className="flex shrink-0 items-center justify-between border-b border-slate-200 px-5 py-3">
              <div className="flex rounded-lg border border-slate-200 p-0.5">
                <button
                  type="button"
                  onClick={() => setPreviewTab('client')}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    previewTab === 'client'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Client preview
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('license')}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    previewTab === 'license'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Digital license
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewTab('staff')}
                  className={`rounded-md px-4 py-1.5 text-sm font-medium ${
                    previewTab === 'staff'
                      ? 'bg-indigo-600 text-white'
                      : 'text-slate-600 hover:bg-slate-50'
                  }`}
                >
                  Staff full document
                </button>
              </div>
              <p className="hidden text-xs text-slate-500 sm:block">
                {previewTab === 'client'
                  ? 'Internal subsections (not-included list, source vs provisioned) and staff-only sections are hidden.'
                  : previewTab === 'license'
                    ? 'Serial numbers hidden until you unlock (same as Management Systems).'
                    : 'Full internal document including provision package and deferred scope.'}
              </p>
            </div>
            {previewTab === 'license' ? (
              <div className="min-h-[12rem] flex-1 overflow-y-auto px-6 py-6">
                <LicenseSerialUnlockPanel
                  revealed={serialReveal.revealed}
                  unlocking={serialReveal.unlocking}
                  error={serialReveal.error}
                  compact
                  onUnlock={async (password) => {
                    const ok = await serialReveal.unlock(password);
                    if (ok) await load();
                  }}
                  onLock={async () => {
                    await serialReveal.lock();
                    await load();
                  }}
                />
                {displayLicense ? (
                  <DigitalLicenseCard
                    license={displayLicense}
                    showPrint={false}
                    serialsRevealed={serialReveal.revealed}
                  />
                ) : (
                  <p className="mt-4 text-sm text-slate-500">Loading license preview…</p>
                )}
              </div>
            ) : (
              <DeliverableMarkdownBody
                markdown={previewMarkdown}
                className="min-h-[12rem] flex-1 overflow-y-auto px-6 py-6"
              />
            )}
          </section>
        </div>
      )}

      <footer className="shrink-0 border-t border-slate-200 bg-white px-6 py-4">
        {error && <p className="mb-2 text-sm text-red-600">{error}</p>}
        {message && <p className="mb-2 text-sm text-emerald-700">{message}</p>}
        <div className="flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50"
          >
            Close
          </button>
          <button
            type="button"
            onClick={() => void saveDraft()}
            disabled={saving || loading}
            className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium hover:bg-slate-50 disabled:opacity-60"
          >
            {saving ? 'Saving…' : 'Save draft'}
          </button>
          <button
            type="button"
            onClick={() => void sendToClient()}
            disabled={sending || loading}
            className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
          >
            <Send className="h-4 w-4" />
            {sending ? 'Sending…' : 'Send to client'}
          </button>
        </div>
      </footer>
    </div>,
    document.body,
  );
}
