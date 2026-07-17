'use client';

import { FormEvent, useMemo, useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowDown,
  ArrowLeft,
  CheckCircle2,
  ChevronRight,
  ExternalLink,
  Loader2,
  MessageSquarePlus,
  MonitorPlay,
  Pencil,
  Receipt,
  RotateCcw,
  Trash2,
  XCircle,
} from 'lucide-react';
import {
  ACTIVE_PIPELINE_STAGES,
  CONTACT_CHANNELS,
  DEAL_TYPE_LABELS,
  DEFAULT_STANDALONE_DEPOSIT,
  DEFAULT_STANDALONE_VALUE,
  DEFAULT_SUBSCRIPTION_RATE,
  PRODUCT_DEMO_HIGHLIGHT,
  PRODUCT_DEMO_SLUG,
  PRODUCT_LABELS,
  PRODUCT_LEARN_MORE,
  PRODUCT_PITCH_HOOK,
  SALES_DEAL_TYPES,
  STAGE_COLORS,
  STAGE_DESCRIPTIONS,
  STAGE_LABELS,
  demoUrl,
  previousStage,
  stageIndex,
} from '@/lib/sales-constants';
import type { SalesDealType, SalesProduct, SalesStage } from '@cd-v2/database';
import { ClientSearchSelect } from '@/components/clients/ClientSearchSelect';
import type { ClientPickerOption } from '@/lib/client-picker';
import { EditOpportunityModal } from '@/components/sales/EditOpportunityModal';

export type Opportunity = {
  id: string;
  companyName: string;
  contactName: string;
  email?: string | null;
  phone?: string | null;
  address?: string | null;
  product: SalesProduct;
  stage: SalesStage;
  dealType?: SalesDealType | null;
  monthlyRate?: number | null;
  projectValue?: number | null;
  depositAmount?: number | null;
  scopeNotes?: string | null;
  pitchNotes?: string | null;
  demoNotes?: string | null;
  contactChannel?: string | null;
  quoteId?: string | null;
  clientId?: string | null;
  lostReason?: string | null;
  communications?: Array<{
    at: string;
    type: string;
    summary: string;
    scheduledAt?: string;
    calendarEventId?: string;
  }>;
};

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

export function SalesGuidedClient({
  opportunity: initial,
  clients,
  isAdmin,
}: {
  opportunity: Opportunity;
  clients: ClientPickerOption[];
  isAdmin: boolean;
}) {
  const router = useRouter();
  const [opp, setOpp] = useState(initial);
  const [loading, setLoading] = useState('');
  const [error, setError] = useState('');
  const [message, setMessage] = useState('');
  const [contactChannel, setContactChannel] = useState(opp.contactChannel ?? 'phone');
  const [contactNotes, setContactNotes] = useState(opp.pitchNotes ?? '');
  const [demoNotes, setDemoNotes] = useState(opp.demoNotes ?? '');
  const [dealType, setDealType] = useState<SalesDealType>(opp.dealType ?? 'subscription');
  const [monthlyRate, setMonthlyRate] = useState(String(opp.monthlyRate ?? DEFAULT_SUBSCRIPTION_RATE));
  const [projectValue, setProjectValue] = useState(String(opp.projectValue ?? DEFAULT_STANDALONE_VALUE));
  const [depositAmount, setDepositAmount] = useState(String(opp.depositAmount ?? DEFAULT_STANDALONE_DEPOSIT));
  const [scopeNotes, setScopeNotes] = useState(opp.scopeNotes ?? '');
  const [sendQuoteEmail, setSendQuoteEmail] = useState(false);
  const [lostReason, setLostReason] = useState('');
  const [deferReason, setDeferReason] = useState('');
  const [interactionChannel, setInteractionChannel] = useState(opp.contactChannel ?? 'phone');
  const [interactionNotes, setInteractionNotes] = useState('');
  const [interactionDate, setInteractionDate] = useState('');
  const [interactionTime, setInteractionTime] = useState('09:00');
  const [syncLicenses, setSyncLicenses] = useState(true);
  const [showEdit, setShowEdit] = useState(false);

  const product = opp.product;
  const demoSlug = PRODUCT_DEMO_SLUG[product];
  const currentIdx = stageIndex(opp.stage);
  const isClosed = opp.stage === 'won' || opp.stage === 'lost';
  const linkedClient = useMemo(
    () => (opp.clientId ? clients.find((c) => c.id === opp.clientId) : undefined),
    [clients, opp.clientId]
  );
  const emailMatchClient = useMemo(() => {
    const e = opp.email?.trim().toLowerCase();
    if (!e) return undefined;
    return clients.find((c) => c.email?.trim().toLowerCase() === e);
  }, [clients, opp.email]);

  const steps = useMemo(
    () =>
      ACTIVE_PIPELINE_STAGES.map((stage, idx) => ({
        stage,
        label: STAGE_LABELS[stage],
        done: isClosed ? opp.stage === 'won' && idx <= 4 : currentIdx > idx,
        current: opp.stage === stage,
      })),
    [opp.stage, currentIdx, isClosed]
  );

  async function advance(body: Record<string, unknown>) {
    setLoading('advance');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/advance`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to advance');
      setOpp(data.opportunity);
      setMessage('Step completed — moved to next stage.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to advance');
    } finally {
      setLoading('');
    }
  }

  async function convertWon(e: FormEvent) {
    e.preventDefault();
    if (!isAdmin) return;
    setLoading('convert');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/convert`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ syncLicenses }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to activate client');
      setOpp(data.opportunity);
      setMessage(
        data.licenseSync?.success
          ? `Client activated and licenses synced. Open client record to finish onboarding.`
          : `Client activated.${data.licenseSync?.message ? ` License: ${data.licenseSync.message}` : ''}`
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to activate');
    } finally {
      setLoading('');
    }
  }

  async function markLost(e: FormEvent) {
    e.preventDefault();
    setLoading('lost');
    setError('');
    try {
      const res = await fetch(`/api/sales/${opp.id}`, {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ lostReason: lostReason || 'No longer pursuing' }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to archive');
      setOpp(data.opportunity);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to archive');
    } finally {
      setLoading('');
    }
  }

  async function logInteraction(e: FormEvent) {
    e.preventDefault();
    setLoading('log');
    setError('');
    setMessage('');
    try {
      let scheduledAt: string | undefined;
      if (interactionDate) {
        scheduledAt = new Date(`${interactionDate}T${interactionTime || '09:00'}`).toISOString();
      }

      const res = await fetch(`/api/sales/${opp.id}/log`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          channel: interactionChannel,
          notes: interactionNotes.trim() || undefined,
          scheduledAt,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to log interaction');
      setOpp(data.opportunity);
      setInteractionNotes('');
      setInteractionDate('');
      setInteractionTime('09:00');
      setMessage(
        scheduledAt
          ? 'Interaction logged and follow-up added to Calendar.'
          : 'Interaction logged in activity.'
      );
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to log interaction');
    } finally {
      setLoading('');
    }
  }

  async function deferToBottom() {
    setLoading('defer');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/defer`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          reason: deferReason.trim() || undefined,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to defer prospect');
      router.push('/sales');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to defer prospect');
    } finally {
      setLoading('');
    }
  }

  async function revertStage() {
    const prior = previousStage(opp.stage);
    if (!prior) return;
    if (!confirm(`Move this opportunity back to "${STAGE_LABELS[prior]}"?`)) return;
    setLoading('revert');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/revert`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to move back');
      setOpp(data.opportunity);
      setMessage(`Moved back to ${STAGE_LABELS[prior]}.`);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to move back');
    } finally {
      setLoading('');
    }
  }

  async function reopenPipeline() {
    if (!confirm('Reopen this opportunity at Cold Prospect?')) return;
    setLoading('reopen');
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/reopen`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reopen');
      setOpp(data.opportunity);
      setMessage('Opportunity reopened at Cold Prospect.');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reopen');
    } finally {
      setLoading('');
    }
  }

  async function deleteOpportunity() {
    if (
      !confirm(
        'Permanently delete this opportunity? This cannot be undone. Staging-only client records created for quotes will also be removed.'
      )
    ) {
      return;
    }
    setLoading('delete');
    setError('');
    try {
      const res = await fetch(`/api/sales/${opp.id}/delete`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to delete');
      router.push('/sales');
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete');
      setLoading('');
    }
  }

  const priorStage = previousStage(opp.stage);

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div>
          <Link
            href="/sales"
            className="mb-2 inline-flex items-center gap-1 text-sm text-slate-500 hover:text-indigo-600"
          >
            <ArrowLeft className="h-4 w-4" />
            Back to pipeline
          </Link>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">{opp.companyName}</h1>
          <p className="mt-1 text-sm text-slate-500">
            {opp.contactName}
            {opp.phone ? ` · ${opp.phone}` : ''}
            {opp.email ? ` · ${opp.email}` : ''}
          </p>
          <p className="mt-2 text-sm font-medium text-indigo-700">{PRODUCT_LABELS[product]}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2 self-start">
          {!isClosed && (
            <button
              type="button"
              onClick={() => setShowEdit(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-1.5 text-sm font-medium text-slate-700 hover:border-indigo-300 hover:text-indigo-700"
            >
              <Pencil className="h-4 w-4" />
              Edit
            </button>
          )}
          <span
            className={`inline-flex rounded-full border px-3 py-1 text-sm font-medium ${
              STAGE_COLORS[opp.stage]
            }`}
          >
            {STAGE_LABELS[opp.stage]}
          </span>
        </div>
      </div>

      {/* Guided stepper */}
      <div className="rounded-2xl border border-indigo-100 bg-gradient-to-br from-indigo-50/80 to-white p-5 shadow-sm">
        <p className="mb-4 text-sm font-semibold text-indigo-900">Guided sale — follow each step in order</p>
        <ol className="grid gap-2 sm:grid-cols-4">
          {steps.map((step, idx) => (
            <li
              key={step.stage}
              className={`flex items-start gap-2 rounded-xl border px-3 py-2 text-sm ${
                step.current
                  ? 'border-indigo-400 bg-white shadow-sm ring-2 ring-indigo-500/20'
                  : step.done
                    ? 'border-emerald-200 bg-emerald-50/50'
                    : 'border-slate-200 bg-white/60 opacity-70'
              }`}
            >
              <span
                className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                  step.done
                    ? 'bg-emerald-500 text-white'
                    : step.current
                      ? 'bg-indigo-600 text-white'
                      : 'bg-slate-200 text-slate-600'
                }`}
              >
                {step.done ? <CheckCircle2 className="h-4 w-4" /> : idx + 1}
              </span>
              <span>
                <span className="font-medium text-slate-900">{step.label}</span>
                {step.current && (
                  <span className="mt-0.5 block text-xs text-indigo-600">You are here</span>
                )}
              </span>
            </li>
          ))}
        </ol>
      </div>

      {message && (
        <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {message}
        </p>
      )}
      {error && (
        <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
      )}

      {(linkedClient || emailMatchClient) && !isClosed && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-900">
          <p className="font-medium">
            {linkedClient ? 'Linked to existing client' : 'Existing client matches this email'}
          </p>
          <p className="mt-1 text-emerald-800">
            {(linkedClient ?? emailMatchClient)?.companyName || (linkedClient ?? emailMatchClient)?.name}
            {(linkedClient ?? emailMatchClient)?.email ? ` · ${(linkedClient ?? emailMatchClient)?.email}` : ''}
          </p>
          {linkedClient && (
            <Link href={`/clients/${linkedClient.id}`} className="mt-2 inline-block text-sm font-medium text-emerald-700 underline">
              Open client record
            </Link>
          )}
        </div>
      )}

      {/* Stage panels */}
      {opp.stage === 'cold_prospect' && (
        <StagePanel
          title="Step 1 — Cold prospect"
          description={STAGE_DESCRIPTIONS.cold_prospect}
          icon={TargetIcon}
        >
          <div className="rounded-xl bg-slate-50 p-4 text-sm text-slate-600">
            <p className="font-medium text-slate-800">Target profile</p>
            <p className="mt-1">{PRODUCT_PITCH_HOOK[product]}</p>
          </div>
          <p className="text-sm text-slate-600">
            When you make first contact, log how you reached them and complete this step.
          </p>
          <form
            onSubmit={(e) => {
              e.preventDefault();
              advance({ contactChannel, contactNotes });
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">How did you contact them? *</span>
              <select
                value={contactChannel}
                onChange={(e) => setContactChannel(e.target.value)}
                className={inputClass}
                required
              >
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Pitch notes</span>
              <textarea
                value={contactNotes}
                onChange={(e) => setContactNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="What you said, gatekeeper name, follow-up date…"
              />
            </label>
            <ActionRow loading={loading === 'advance'} label="Complete Step 1 — Contact made" />
          </form>

          <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50/80 p-4">
            <p className="text-sm font-medium text-slate-800">Could not reach them?</p>
            <p className="mt-1 text-sm text-slate-600">
              No answer, voicemail, or gatekeeper unavailable — move this prospect to the bottom of your
              cold list and work the next one.
            </p>
            <label className="mt-3 block">
              <span className="mb-1 block text-sm font-medium text-slate-700">What happened? (optional)</span>
              <input
                value={deferReason}
                onChange={(e) => setDeferReason(e.target.value)}
                className={inputClass}
                placeholder="e.g. No answer, call back next week"
              />
            </label>
            <button
              type="button"
              onClick={deferToBottom}
              disabled={loading === 'defer'}
              className="mt-3 inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {loading === 'defer' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <ArrowDown className="h-4 w-4" />
              )}
              No answer — move to bottom of list
            </button>
          </div>
        </StagePanel>
      )}

      {opp.stage === 'contact_made' && (
        <StagePanel
          title="Step 2 — Run the live demo"
          description="Prospect agreed to view your system. Open the demo and walk them through the key workflow."
          icon={MonitorPlay}
        >
          <div className="rounded-xl border border-blue-100 bg-blue-50/50 p-4">
            <p className="text-sm font-medium text-blue-900">Remind them why they said yes</p>
            <p className="mt-1 text-sm text-blue-800">{PRODUCT_PITCH_HOOK[product]}</p>
          </div>
          <div className="flex flex-wrap gap-2">
            <a
              href={demoUrl(demoSlug)}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-4 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700"
            >
              <MonitorPlay className="h-4 w-4" />
              Open live demo
            </a>
            <a
              href={PRODUCT_LEARN_MORE[product]}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              <ExternalLink className="h-4 w-4" />
              Learn-more page
            </a>
          </div>
          <p className="text-xs text-slate-500">{PRODUCT_DEMO_HIGHLIGHT[product]}</p>

          <form onSubmit={logInteraction} className="space-y-4 rounded-xl border border-slate-200 bg-slate-50/80 p-4">
            <div>
              <p className="text-sm font-medium text-slate-800">Log an interaction</p>
              <p className="mt-1 text-sm text-slate-600">
                Record follow-up calls, messages, or scheduling — saved to the activity log without advancing the
                stage.
              </p>
            </div>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">How did you reach them? *</span>
              <select
                value={interactionChannel}
                onChange={(e) => setInteractionChannel(e.target.value)}
                className={inputClass}
                required
              >
                {CONTACT_CHANNELS.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">What happened?</span>
              <textarea
                value={interactionNotes}
                onChange={(e) => setInteractionNotes(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Left voicemail, scheduled demo for Friday 2pm, sent follow-up email…"
              />
            </label>
            <div className="rounded-xl border border-indigo-100 bg-indigo-50/40 p-3">
              <p className="text-sm font-medium text-indigo-900">Schedule follow-up (optional)</p>
              <p className="mt-1 text-xs text-indigo-800">
                Adds the appointment to Calendar so you can track callbacks and demos.
              </p>
              <div className="mt-3 grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Date</span>
                  <input
                    type="date"
                    value={interactionDate}
                    onChange={(e) => setInteractionDate(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-xs font-medium text-slate-700">Time</span>
                  <input
                    type="time"
                    value={interactionTime}
                    onChange={(e) => setInteractionTime(e.target.value)}
                    disabled={!interactionDate}
                    className={inputClass}
                  />
                </label>
              </div>
            </div>
            <button
              type="submit"
              disabled={loading === 'log'}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
            >
              {loading === 'log' ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <MessageSquarePlus className="h-4 w-4" />
              )}
              Log interaction
            </button>
          </form>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              advance({ demoNotes });
            }}
            className="space-y-4"
          >
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Demo notes</span>
              <textarea
                value={demoNotes}
                onChange={(e) => setDemoNotes(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Confirmed it solves their operational headache…"
              />
            </label>
            <ActionRow loading={loading === 'advance'} label="Complete Step 2 — Demo completed" />
          </form>
        </StagePanel>
      )}

      {opp.stage === 'demo_completed' && (
        <StagePanel
          title="Step 3 — Send proposal (pricing & scope)"
          description={STAGE_DESCRIPTIONS.proposal_sent}
          icon={Receipt}
        >
          <p className="text-sm text-slate-600">
            Choose subscription or standalone pricing. Quotes attach to an existing client when the email matches,
            or you can link one manually below. Only brand-new prospects get a hidden staging record.
          </p>
          {!opp.email && (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-sm text-amber-800">
              Email is required before sending a proposal — enter below or link an existing client.
            </p>
          )}
          <EmailCaptureRow
            opportunityId={opp.id}
            email={opp.email}
            onSaved={(patch) => setOpp((prev) => ({ ...prev, ...patch }))}
          />
          <LinkExistingClientRow
            opportunityId={opp.id}
            clients={clients}
            linkedClientId={opp.clientId}
            onLinked={(patch) => setOpp((prev) => ({ ...prev, ...patch }))}
          />
          <form
            onSubmit={(e) => {
              e.preventDefault();
              advance({
                dealType,
                monthlyRate: parseFloat(monthlyRate) || DEFAULT_SUBSCRIPTION_RATE,
                projectValue: parseFloat(projectValue) || DEFAULT_STANDALONE_VALUE,
                depositAmount: parseFloat(depositAmount) || DEFAULT_STANDALONE_DEPOSIT,
                scopeNotes,
                sendQuoteEmail,
              });
            }}
            className="space-y-4"
          >
            <div className="grid gap-3 sm:grid-cols-2">
              {SALES_DEAL_TYPES.map((type) => (
                <label
                  key={type}
                  className={`cursor-pointer rounded-xl border p-4 transition ${
                    dealType === type ? 'border-indigo-500 bg-indigo-50 ring-2 ring-indigo-500/20' : 'border-slate-200'
                  }`}
                >
                  <input
                    type="radio"
                    name="dealType"
                    value={type}
                    checked={dealType === type}
                    onChange={() => setDealType(type)}
                    className="sr-only"
                  />
                  <p className="font-medium text-slate-900">{DEAL_TYPE_LABELS[type]}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {type === 'subscription'
                      ? `${DEFAULT_SUBSCRIPTION_RATE} TTD/mo — subscription, standard limits`
                      : `${DEFAULT_STANDALONE_VALUE}+ TTD — custom code, on-prem, migration`}
                  </p>
                </label>
              ))}
            </div>

            {dealType === 'subscription' ? (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">Monthly rate (TTD)</span>
                <input
                  type="number"
                  min={0}
                  value={monthlyRate}
                  onChange={(e) => setMonthlyRate(e.target.value)}
                  className={inputClass}
                />
              </label>
            ) : (
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Project value (TTD)</span>
                  <input
                    type="number"
                    min={0}
                    value={projectValue}
                    onChange={(e) => setProjectValue(e.target.value)}
                    className={inputClass}
                  />
                </label>
                <label className="block">
                  <span className="mb-1 block text-sm font-medium text-slate-700">Mobilization deposit (TTD)</span>
                  <input
                    type="number"
                    min={0}
                    value={depositAmount}
                    onChange={(e) => setDepositAmount(e.target.value)}
                    className={inputClass}
                  />
                </label>
              </div>
            )}

            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">Customization scope</span>
              <textarea
                value={scopeNotes}
                onChange={(e) => setScopeNotes(e.target.value)}
                rows={3}
                className={inputClass}
                placeholder="Modules to tweak, deployment timeline, migration…"
              />
            </label>

            <label className="flex items-center gap-2 text-sm text-slate-600">
              <input
                type="checkbox"
                checked={sendQuoteEmail}
                onChange={(e) => setSendQuoteEmail(e.target.checked)}
                className="rounded"
              />
              Email proposal to prospect now
            </label>

            <ActionRow
              loading={loading === 'advance'}
              label="Complete Step 3 — Proposal sent"
              disabled={!opp.email && !opp.clientId}
            />
          </form>
        </StagePanel>
      )}

      {opp.stage === 'proposal_sent' && (
        <StagePanel
          title="Step 4 — Won / active (deposit & onboarding)"
          description="Money has changed hands. Activate the client and sync licenses for deployment."
          icon={Receipt}
        >
          <div className="flex flex-wrap gap-2">
            {opp.quoteId && (
              <Link
                href={`/accounting?quote=${opp.quoteId}`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-50"
              >
                <Receipt className="h-4 w-4" />
                View quote in Accounting
              </Link>
            )}
            {opp.clientId && (
              <Link
                href={`/clients/${opp.clientId}`}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Client record
              </Link>
            )}
          </div>
          <p className="text-sm text-slate-600">
            When deposit or first month payment is in your account, activate the client. Licenses sync automatically
            for the selected product system.
          </p>
          {isAdmin ? (
            <form onSubmit={convertWon} className="space-y-4">
              <label className="flex items-center gap-2 text-sm text-slate-600">
                <input
                  type="checkbox"
                  checked={syncLicenses}
                  onChange={(e) => setSyncLicenses(e.target.checked)}
                  className="rounded"
                />
                Sync licenses to activation system on activation
              </label>
              <ActionRow loading={loading === 'convert'} label="Complete Step 4 — Activate client (won)" />
            </form>
          ) : (
            <p className="text-sm text-amber-700">An admin must activate the client after payment.</p>
          )}
        </StagePanel>
      )}

      {opp.stage === 'won' && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 p-6 text-center">
          <CheckCircle2 className="mx-auto h-12 w-12 text-emerald-600" />
          <h2 className="mt-3 text-lg font-semibold text-emerald-900">Deal won — client active</h2>
          <p className="mt-1 text-sm text-emerald-800">Onboarding in progress. Finish setup on the client record.</p>
          {opp.clientId && (
            <Link
              href={`/clients/${opp.clientId}`}
              className="mt-4 inline-flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700"
            >
              Open client
              <ChevronRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      )}

      {opp.stage === 'lost' && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-6">
          <XCircle className="h-10 w-10 text-red-500" />
          <h2 className="mt-2 text-lg font-semibold text-red-900">Archived — lost</h2>
          {opp.lostReason && <p className="mt-1 text-sm text-red-800">{opp.lostReason}</p>}
          <div className="mt-4 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={reopenPipeline}
              disabled={loading === 'reopen'}
              className="inline-flex items-center gap-2 rounded-xl border border-red-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-red-50 disabled:opacity-60"
            >
              {loading === 'reopen' ? <Loader2 className="h-4 w-4 animate-spin" /> : <RotateCcw className="h-4 w-4" />}
              Reopen in pipeline
            </button>
            {isAdmin && (
              <button
                type="button"
                onClick={deleteOpportunity}
                disabled={loading === 'delete'}
                className="inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-100 disabled:opacity-60"
              >
                {loading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                Delete entry
              </button>
            )}
          </div>
        </div>
      )}

      {!isClosed && (
        <details className="rounded-2xl border border-slate-200 bg-white">
          <summary className="cursor-pointer px-5 py-4 text-sm font-medium text-slate-700">
            Pipeline corrections
          </summary>
          <div className="space-y-4 border-t border-slate-100 px-5 py-4">
            {priorStage && (
              <div>
                <p className="text-sm text-slate-600">
                  Moved too far? Step back to <strong>{STAGE_LABELS[priorStage]}</strong> and continue from there.
                  {opp.stage === 'proposal_sent' && ' The linked quote stays in Accounting.'}
                </p>
                <button
                  type="button"
                  onClick={revertStage}
                  disabled={loading === 'revert'}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  {loading === 'revert' ? (
                    <Loader2 className="h-4 w-4 animate-spin" />
                  ) : (
                    <RotateCcw className="h-4 w-4" />
                  )}
                  Move back one step
                </button>
              </div>
            )}

            <form onSubmit={markLost} className="space-y-3 border-t border-slate-100 pt-4">
              <p className="text-sm font-medium text-slate-700">Mark as lost (archive)</p>
              <textarea
                value={lostReason}
                onChange={(e) => setLostReason(e.target.value)}
                rows={2}
                className={inputClass}
                placeholder="Why did this not close? e.g. prefers paper notebooks"
              />
              <button
                type="submit"
                disabled={loading === 'lost'}
                className="rounded-xl border border-red-200 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
              >
                {loading === 'lost' ? 'Archiving…' : 'Archive as lost'}
              </button>
            </form>

            {isAdmin && (
              <div className="border-t border-slate-100 pt-4">
                <p className="text-sm text-slate-600">
                  Created by mistake? Permanently remove this opportunity from Sales.
                </p>
                <button
                  type="button"
                  onClick={deleteOpportunity}
                  disabled={loading === 'delete'}
                  className="mt-2 inline-flex items-center gap-2 rounded-xl border border-red-300 px-4 py-2 text-sm font-medium text-red-700 hover:bg-red-50 disabled:opacity-60"
                >
                  {loading === 'delete' ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
                  Delete opportunity
                </button>
              </div>
            )}
          </div>
        </details>
      )}

      {(opp.communications?.length ?? 0) > 0 && (
        <div className="rounded-2xl border border-slate-200 bg-white p-5">
          <h3 className="text-sm font-semibold text-slate-900">Activity log</h3>
          <ul className="mt-3 space-y-2">
            {opp.communications!.map((entry, i) => (
              <li key={i} className="flex gap-3 text-sm">
                <span className="shrink-0 text-xs text-slate-400">
                  {new Date(entry.at).toLocaleString()}
                </span>
                <span className="text-slate-700">
                  {entry.summary}
                  {entry.scheduledAt && (
                    <span className="mt-0.5 block text-xs font-medium text-indigo-700">
                      Scheduled: {new Date(entry.scheduledAt).toLocaleString()}
                    </span>
                  )}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}

      {showEdit && (
        <EditOpportunityModal
          opportunity={opp}
          onClose={() => setShowEdit(false)}
          onSaved={(updated) => {
            setOpp((prev) => ({ ...prev, ...updated }));
            setContactNotes(updated.pitchNotes ?? '');
            setMessage('Prospect details updated.');
            router.refresh();
          }}
        />
      )}
    </div>
  );
}

function StagePanel({
  title,
  description,
  icon: Icon,
  children,
}: {
  title: string;
  description: string;
  icon: React.ComponentType<{ className?: string }>;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded-2xl border border-slate-200/80 bg-white p-5 shadow-sm">
      <div className="mb-4 flex items-start gap-3">
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-indigo-50 text-indigo-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <h2 className="text-lg font-semibold text-slate-900">{title}</h2>
          <p className="mt-0.5 text-sm text-slate-500">{description}</p>
        </div>
      </div>
      <div className="space-y-4">{children}</div>
    </section>
  );
}

function ActionRow({
  loading,
  label,
  disabled,
}: {
  loading: boolean;
  label: string;
  disabled?: boolean;
}) {
  return (
    <button
      type="submit"
      disabled={loading || disabled}
      className="inline-flex items-center gap-2 rounded-xl bg-indigo-600 px-5 py-2.5 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ChevronRight className="h-4 w-4" />}
      {label}
    </button>
  );
}

function TargetIcon({ className }: { className?: string }) {
  return (
    <svg className={className} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
      <circle cx="12" cy="12" r="10" />
      <circle cx="12" cy="12" r="6" />
      <circle cx="12" cy="12" r="2" />
    </svg>
  );
}

function EmailCaptureRow({
  opportunityId,
  email,
  onSaved,
}: {
  opportunityId: string;
  email?: string | null;
  onSaved: (patch: { email: string; clientId?: string | null }) => void;
}) {
  const [value, setValue] = useState(email ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  if (email) return null;

  async function save() {
    if (!value.trim()) return;
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/sales/${opportunityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: value.trim() }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to save email');
      onSaved({
        email: data.opportunity.email ?? value.trim(),
        clientId: data.opportunity.clientId ?? null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 sm:flex-row sm:items-end">
      <label className="block flex-1">
        <span className="mb-1 block text-sm font-medium text-slate-700">Prospect email</span>
        <input
          type="email"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          className={inputClass}
          placeholder="Matches existing client email to link automatically"
        />
      </label>
      <button
        type="button"
        onClick={save}
        disabled={saving || !value.trim()}
        className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
      >
        {saving ? 'Saving…' : 'Save email'}
      </button>
      {err && <p className="text-xs text-red-600 sm:col-span-2">{err}</p>}
    </div>
  );
}

function LinkExistingClientRow({
  opportunityId,
  clients,
  linkedClientId,
  onLinked,
}: {
  opportunityId: string;
  clients: ClientPickerOption[];
  linkedClientId?: string | null;
  onLinked: (patch: { clientId: string; email?: string | null }) => void;
}) {
  const [clientId, setClientId] = useState(linkedClientId ?? '');
  const [saving, setSaving] = useState(false);
  const [err, setErr] = useState('');

  async function link() {
    if (!clientId) return;
    setSaving(true);
    setErr('');
    try {
      const res = await fetch(`/api/sales/${opportunityId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ clientId }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to link client');
      onLinked({
        clientId: data.opportunity.clientId,
        email: data.opportunity.email ?? null,
      });
    } catch (e) {
      setErr(e instanceof Error ? e.message : 'Failed to link');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4">
      <p className="text-sm font-medium text-slate-800">Or link an existing client manually</p>
      <p className="mt-1 text-xs text-slate-500">Use when the prospect is already in your Clients list.</p>
      <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-end">
        <div className="min-w-0 flex-1">
          <ClientSearchSelect
            clients={clients}
            value={clientId}
            onChange={setClientId}
            placeholder="Search client by name or email…"
          />
        </div>
        <button
          type="button"
          onClick={link}
          disabled={saving || !clientId || clientId === linkedClientId}
          className="rounded-xl bg-slate-800 px-4 py-2 text-sm font-medium text-white hover:bg-slate-900 disabled:opacity-50"
        >
          {saving ? 'Linking…' : linkedClientId ? 'Update link' : 'Link client'}
        </button>
      </div>
      {err && <p className="mt-2 text-xs text-red-600">{err}</p>}
    </div>
  );
}
