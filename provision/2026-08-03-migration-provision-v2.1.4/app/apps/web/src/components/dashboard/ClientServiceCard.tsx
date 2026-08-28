import type { ClientProfile } from '@/lib/dashboard';

export function ClientServiceCard({ profile }: { profile: ClientProfile }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-900">Your service</h2>
      <dl className="mt-4 grid gap-3 text-sm sm:grid-cols-2">
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Service level</dt>
          <dd className="mt-0.5 capitalize text-slate-800">{profile.serviceLevel || 'Not assigned'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Assigned technician</dt>
          <dd className="mt-0.5 text-slate-800">{profile.assignedTechnician || 'Not assigned'}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Invoices</dt>
          <dd className="mt-0.5 text-slate-800">{profile.invoiceCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Pending invoices</dt>
          <dd className="mt-0.5 text-slate-800">{profile.pendingInvoices}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Quotes</dt>
          <dd className="mt-0.5 text-slate-800">{profile.quoteCount}</dd>
        </div>
        <div>
          <dt className="text-xs font-medium uppercase tracking-wide text-slate-400">Orders</dt>
          <dd className="mt-0.5 text-slate-800">{profile.orderCount}</dd>
        </div>
      </dl>
    </div>
  );
}
