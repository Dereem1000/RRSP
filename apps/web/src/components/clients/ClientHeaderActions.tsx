'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { usePathname, useRouter } from 'next/navigation';
import { FileText, KeyRound, Loader2, Mail, Package, Receipt, Shield, Ticket } from 'lucide-react';
import { useClientEmailPolicy } from '@/hooks/useClientEmailPolicy';

const btnClass =
  'inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-indigo-300 hover:bg-indigo-50 hover:text-indigo-700 disabled:opacity-60';

export function ClientHeaderActions({ role }: { role: string }) {
  const pathname = usePathname();
  const router = useRouter();
  const { askToEmailClient } = useClientEmailPolicy();
  const clientId = pathname?.match(/^\/clients\/([^/]+)/)?.[1];
  const isStaff = role === 'admin' || role === 'technician';
  const isAdmin = role === 'admin';

  const [userId, setUserId] = useState<number | null | undefined>(undefined);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  useEffect(() => {
    if (!clientId || !isStaff) return;
    let cancelled = false;
    fetch(`/api/clients/${clientId}`)
      .then((res) => res.json())
      .then((data) => {
        if (!cancelled && data.client) {
          setUserId(data.client.userId ?? null);
        }
      })
      .catch(() => {
        if (!cancelled) setUserId(null);
      });
    return () => {
      cancelled = true;
    };
  }, [clientId, isStaff]);

  async function resendWelcome() {
    if (!clientId) return;
    if (!askToEmailClient('Send a welcome email to this client with portal login details?')) return;
    setLoading(true);
    setError('');
    setMessage('');
    try {
      const res = await fetch(`/api/clients/${clientId}/resend-welcome`, { method: 'POST' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message || 'Failed to reset portal access');
      if (data.emailSent) {
        setMessage(data.message || 'Portal welcome sent');
      } else {
        setMessage(`Username: ${data.username} · Temp password: ${data.tempPassword}`);
      }
      setUserId(data.userId ?? userId ?? 1);
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to reset portal access');
    } finally {
      setLoading(false);
    }
  }

  if (!clientId || !isStaff) return null;

  return (
    <div className="flex flex-col items-end gap-1.5">
      <div className="flex flex-wrap items-center justify-end gap-2">
        <Link href={`/tickets?create=1&clientId=${clientId}`} className={btnClass}>
          <Ticket className="h-3.5 w-3.5 text-indigo-600" />
          New ticket
        </Link>
        <Link href={`/orders?create=1&clientId=${clientId}`} className={btnClass}>
          <Package className="h-3.5 w-3.5 text-indigo-600" />
          New order
        </Link>
        {isAdmin && (
          <>
            <Link href={`/accounting?create=invoice&clientId=${clientId}`} className={btnClass}>
              <Receipt className="h-3.5 w-3.5 text-indigo-600" />
              New invoice
            </Link>
            <Link href={`/accounting?create=quote&clientId=${clientId}`} className={btnClass}>
              <FileText className="h-3.5 w-3.5 text-indigo-600" />
              New quote
            </Link>
          </>
        )}
        <Link
          href={`/clients/${clientId}/licenses`}
          className={`${btnClass} ${pathname?.endsWith('/licenses') ? 'border-indigo-300 bg-indigo-50 text-indigo-700' : ''}`}
        >
          <Shield className="h-3.5 w-3.5 text-indigo-600" />
          Licenses
        </Link>
        {isAdmin && (
          <button
            type="button"
            onClick={resendWelcome}
            disabled={loading || userId === undefined}
            className={btnClass}
            title={userId ? 'Reset portal access / resend welcome' : 'Create portal account & send welcome'}
          >
            {loading ? (
              <Loader2 className="h-3.5 w-3.5 animate-spin text-indigo-600" />
            ) : userId ? (
              <Mail className="h-3.5 w-3.5 text-indigo-600" />
            ) : (
              <KeyRound className="h-3.5 w-3.5 text-indigo-600" />
            )}
            {userId ? 'Portal access' : 'Create portal'}
          </button>
        )}
      </div>
      {(error || message) && (
        <p className={`max-w-md text-right text-xs ${error ? 'text-red-600' : 'text-emerald-600'}`}>
          {error || message}
        </p>
      )}
    </div>
  );
}
