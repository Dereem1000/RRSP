import type { RecentActivity } from '@/lib/dashboard';

export function RecentActivityFeed({ activities }: { activities: RecentActivity[] }) {
  return (
    <div className="rounded-2xl border border-slate-200/80 bg-white p-6 shadow-sm">
      <h2 className="font-semibold text-slate-900">Recent activity</h2>
      <div className="mt-4 space-y-3">
        {activities.length === 0 ? (
          <p className="text-sm text-slate-400">No recent activity</p>
        ) : (
          activities.map((a) => (
            <div key={a.id} className="rounded-xl border border-slate-100 bg-slate-50/50 px-4 py-3">
              <p className="text-sm text-slate-800">{a.description}</p>
              <p className="mt-1 text-xs text-slate-500">
                {a.userName}
                {a.createdAt && ` · ${new Date(a.createdAt).toLocaleString()}`}
              </p>
            </div>
          ))
        )}
      </div>
    </div>
  );
}
