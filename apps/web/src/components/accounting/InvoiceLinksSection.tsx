'use client';

import { useCallback, useEffect, useState } from 'react';
import { Link2, Loader2, Plus, Unlink } from 'lucide-react';
import { LinkedDocumentLink } from '@/components/links/DocumentLinks';

export type InvoiceLinkView = {
  id: string;
  linkedType: string;
  linkedId: string;
  linkedNumber: string;
  notes?: string | null;
  linkDate?: string;
};

type LinkableEntity = {
  id: string;
  type: string;
  number: string;
  title: string;
  status?: string;
  clientName?: string;
};

export function InvoiceLinksSection({
  invoiceId,
  clientId,
  links,
  onLinksChange,
  canEdit = true,
}: {
  invoiceId: string;
  clientId?: string | null;
  links: InvoiceLinkView[];
  onLinksChange: (links: InvoiceLinkView[]) => void;
  canEdit?: boolean;
}) {
  const [linkType, setLinkType] = useState<'ticket' | 'order'>('ticket');
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<LinkableEntity[]>([]);
  const [searching, setSearching] = useState(false);
  const [loading, setLoading] = useState('');

  const search = useCallback(
    async (q: string) => {
      if (q.trim().length < 2) {
        setResults([]);
        return;
      }
      setSearching(true);
      try {
        const params = new URLSearchParams({ query: q, type: linkType });
        if (clientId) params.set('clientId', clientId);
        const res = await fetch(`/api/msp/orders/search-linked-entities?${params}`);
        const data = await res.json();
        if (res.ok) setResults(data.results ?? []);
      } finally {
        setSearching(false);
      }
    },
    [linkType, clientId]
  );

  useEffect(() => {
    const timer = setTimeout(() => search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  async function addLink(entity: LinkableEntity) {
    setLoading(`add-${entity.id}`);
    try {
      const res = await fetch(`/api/msp/invoices/${invoiceId}/links`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          linkedType: entity.type,
          linkedId: entity.id,
          linkedNumber: entity.number,
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to add link');
      onLinksChange([data.link, ...links]);
      setQuery('');
      setResults([]);
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to add link');
    } finally {
      setLoading('');
    }
  }

  async function removeLink(linkId: string) {
    if (!confirm('Remove this link?')) return;
    setLoading(`remove-${linkId}`);
    try {
      const res = await fetch(`/api/msp/invoices/${invoiceId}/links/${linkId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to remove link');
      onLinksChange(links.filter((l) => l.id !== linkId));
    } catch (err) {
      alert(err instanceof Error ? err.message : 'Failed to remove link');
    } finally {
      setLoading('');
    }
  }

  function linkDocumentType(type: string): 'ticket' | 'invoice' | 'order' | 'quote' {
    if (type === 'order') return 'order';
    if (type === 'invoice') return 'invoice';
    if (type === 'quote') return 'quote';
    return 'ticket';
  }

  return (
    <div className="rounded-xl border border-slate-200 p-4">
      <p className="mb-3 flex items-center gap-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
        <Link2 className="h-3.5 w-3.5" />
        Linked tickets & orders
      </p>

      {links.length > 0 ? (
        <ul className="mb-4 space-y-2">
          {links.map((link) => (
            <li
              key={link.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
            >
              <span>
                <span className="font-medium capitalize text-slate-900">{link.linkedType}</span>
                <span className="text-slate-500"> · </span>
                <LinkedDocumentLink
                  type={linkDocumentType(link.linkedType)}
                  id={link.linkedId}
                  label={link.linkedNumber}
                  className="text-slate-700 hover:text-indigo-700"
                />
              </span>
              {canEdit ? (
                <button
                  type="button"
                  title="Remove link"
                  aria-label="Remove link"
                  onClick={() => removeLink(link.id)}
                  disabled={!!loading}
                  className="inline-flex h-7 w-7 items-center justify-center rounded-lg border border-slate-200 text-red-600 hover:bg-red-50 disabled:opacity-60"
                >
                  {loading === `remove-${link.id}` ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Unlink className="h-3.5 w-3.5" />
                  )}
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      ) : (
        <p className="mb-4 text-sm text-slate-500">No links yet. Link a ticket so part orders can use this invoice.</p>
      )}

      {canEdit ? (
        <div className="space-y-2">
          <div className="flex gap-2">
            <select
              value={linkType}
              onChange={(e) => setLinkType(e.target.value as 'ticket' | 'order')}
              className="rounded-xl border border-slate-200 px-3 py-2 text-sm"
            >
              <option value="ticket">Ticket</option>
              <option value="order">Order</option>
            </select>
            <input
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Search ticket or order…"
              className="min-w-0 flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm"
            />
          </div>
          {searching && <p className="text-xs text-slate-400">Searching…</p>}
          {results.length > 0 && (
            <ul className="max-h-40 overflow-y-auto rounded-xl border border-slate-200">
              {results.map((entity) => (
                <li key={`${entity.type}-${entity.id}`}>
                  <button
                    type="button"
                    onClick={() => addLink(entity)}
                    disabled={!!loading}
                    className="flex w-full items-center justify-between gap-2 px-3 py-2 text-left text-sm hover:bg-slate-50 disabled:opacity-60"
                  >
                    <span>
                      <span className="font-medium text-slate-900">{entity.number}</span>
                      <span className="block text-xs text-slate-500">{entity.title}</span>
                    </span>
                    {loading === `add-${entity.id}` ? (
                      <Loader2 className="h-4 w-4 animate-spin text-slate-400" />
                    ) : (
                      <Plus className="h-4 w-4 text-indigo-600" />
                    )}
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      ) : null}
    </div>
  );
}
