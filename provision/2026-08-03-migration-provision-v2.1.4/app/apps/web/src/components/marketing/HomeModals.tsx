'use client';

import { FormEvent, useState } from 'react';
import { Loader2, Search, X } from 'lucide-react';
import { BrandLogo } from './BrandLogo';

type TicketResult = {
  ticketNumber: string;
  title: string;
  description: string;
  status: string;
  priority: string;
  dateCreated: string;
  lastUpdated: string;
  client?: { name?: string; phone?: string; email?: string };
};

export function TicketStatusButton() {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-6 py-3 text-sm font-semibold text-slate-700 shadow-sm transition hover:-translate-y-0.5 hover:bg-slate-50"
      >
        <Search className="h-4 w-4" />
        Check Ticket Status
      </button>

      {open && <TicketStatusModal onClose={() => setOpen(false)} />}
    </>
  );
}

function TicketStatusModal({ onClose }: { onClose: () => void }) {
  const [identifier, setIdentifier] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [ticket, setTicket] = useState<TicketResult | null>(null);

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError('');
    setTicket(null);
    setLoading(true);

    try {
      const encoded = encodeURIComponent(identifier.trim());
      const res = await fetch(`/api/public/ticket-status/${encoded}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Ticket not found');
      setTicket(data.ticket);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Lookup failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="fixed inset-0 z-[100] flex items-center justify-center bg-slate-900/60 p-4 backdrop-blur-sm">
      <div className="relative w-full max-w-lg rounded-2xl bg-white shadow-2xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="border-b border-slate-200 px-6 py-5 text-center">
          <div className="mb-3 flex justify-center">
            <BrandLogo href={undefined} size="sm" />
          </div>
          <h2 className="text-xl font-bold text-slate-900">Check Ticket Status</h2>
        </div>

        <div className="px-6 py-5">
          <p className="mb-4 text-sm text-slate-600">
            Enter your ticket number or email address to check the current status of your support
            request.
          </p>

          <form onSubmit={handleSubmit} className="space-y-4">
            <input
              type="text"
              value={identifier}
              onChange={(e) => setIdentifier(e.target.value)}
              placeholder="Ticket number (e.g., TKT-2025-001) or email"
              required
              className="w-full rounded-xl border border-slate-300 px-4 py-3 text-sm outline-none ring-indigo-500 focus:ring-2"
            />
            <button
              type="submit"
              disabled={loading}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-indigo-600 px-4 py-3 text-sm font-semibold text-white hover:bg-indigo-700 disabled:opacity-60"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
              Check Status
            </button>
          </form>

          {error && (
            <p className="mt-4 rounded-lg bg-red-50 px-4 py-3 text-sm text-red-700">{error}</p>
          )}

          {ticket && (
            <div className="mt-4 space-y-2 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm">
              <p>
                <span className="font-semibold text-slate-700">Ticket:</span> {ticket.ticketNumber}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Issue:</span> {ticket.title}
              </p>
              <p>
                <span className="font-semibold text-slate-700">Status:</span>{' '}
                <span className="rounded-full bg-indigo-100 px-2 py-0.5 font-medium text-indigo-700">
                  {ticket.status}
                </span>
              </p>
              <p>
                <span className="font-semibold text-slate-700">Priority:</span> {ticket.priority}
              </p>
              {ticket.description && (
                <p>
                  <span className="font-semibold text-slate-700">Details:</span> {ticket.description}
                </p>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
