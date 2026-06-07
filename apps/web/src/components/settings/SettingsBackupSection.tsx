'use client';

import { FormEvent, useCallback, useEffect, useState } from 'react';
import {
  DatabaseBackup,
  Download,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Trash2,
  Upload,
  CheckCircle,
} from 'lucide-react';

const inputClass =
  'w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-indigo-500 focus:ring-2 focus:ring-indigo-500/20';

type BackupRow = {
  id: string;
  backupName: string;
  backupType: string;
  status: string;
  fileSize: number | null;
  startTime: string;
  created_at?: string;
};

type StatusInfo = {
  enabled: boolean;
  totalBackups: number;
  totalSize: number;
  lastBackup: string | null;
};

export function SettingsBackupSection({
  onMessage,
  onError,
}: {
  onMessage: (m: string) => void;
  onError: (m: string) => void;
}) {
  const [loading, setLoading] = useState('');
  const [backups, setBackups] = useState<BackupRow[]>([]);
  const [status, setStatus] = useState<StatusInfo | null>(null);
  const [showRecovery, setShowRecovery] = useState(false);
  const [recovery, setRecovery] = useState({
    restoreType: 'database' as 'database' | 'files' | 'license' | 'full',
    backupId: '',
    reason: '',
    authorization: '',
    overwrite: false,
  });
  const [uploadFile, setUploadFile] = useState<File | null>(null);

  const loadAll = useCallback(async () => {
    setLoading('load');
    try {
      const [listRes, statusRes] = await Promise.all([
        fetch('/api/backup/list'),
        fetch('/api/backup/status'),
      ]);
      const listData = await listRes.json();
      const statusData = await statusRes.json();
      if (!listRes.ok) throw new Error(listData.message);
      if (!statusRes.ok) throw new Error(statusData.message);
      setBackups(listData.backups ?? []);
      setStatus(statusData.status ?? null);
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Failed to load backups');
    } finally {
      setLoading('');
    }
  }, [onError]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  async function createBackup(type: string) {
    setLoading('create');
    try {
      const res = await fetch('/api/backup/create', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ backupType: type }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.message);
      onMessage(`Backup created: ${data.backup?.backupName ?? type}`);
      await loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Create failed');
    } finally {
      setLoading('');
    }
  }

  async function runRecovery(e: FormEvent) {
    e.preventDefault();
    setLoading('recover');
    try {
      if (uploadFile) {
        const fd = new FormData();
        fd.append('file', uploadFile);
        fd.append('restoreType', recovery.restoreType);
        fd.append('overwrite', String(recovery.overwrite));
        if (recovery.authorization) fd.append('authorization', recovery.authorization);
        const res = await fetch('/api/backup/upload-restore', { method: 'POST', body: fd });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
      } else if (recovery.backupId) {
        const res = await fetch(`/api/backup/${recovery.backupId}/restore`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            restoreType: recovery.restoreType,
            overwrite: recovery.overwrite,
            authorization: recovery.authorization,
            reason: recovery.reason,
          }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.message);
      } else {
        throw new Error('Select a backup or upload a ZIP');
      }
      onMessage('System recovery completed');
      setShowRecovery(false);
      await loadAll();
    } catch (err) {
      onError(err instanceof Error ? err.message : 'Recovery failed');
    } finally {
      setLoading('');
    }
  }

  function formatBytes(n: number) {
    if (n < 1024) return `${n} B`;
    if (n < 1024 * 1024) return `${(n / 1024).toFixed(1)} KB`;
    return `${(n / (1024 * 1024)).toFixed(1)} MB`;
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-semibold text-slate-900">Backup &amp; recovery</h2>
          <p className="text-sm text-slate-500">
            ZIP backups of database, uploads, and critical v2 paths. Recovery replaces the broken
            emergency API.
          </p>
        </div>
        <button
          type="button"
          onClick={loadAll}
          disabled={loading === 'load'}
          className="inline-flex items-center gap-2 rounded-xl border px-4 py-2 text-sm font-medium"
        >
          <RefreshCw className={`h-4 w-4 ${loading === 'load' ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      {status && (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Backups</p>
            <p className="mt-1 text-2xl font-bold">{status.totalBackups}</p>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Storage</p>
            <p className="mt-1 text-2xl font-bold">{formatBytes(status.totalSize)}</p>
          </div>
          <div className="rounded-2xl border bg-white p-4">
            <p className="text-xs font-semibold uppercase text-slate-500">Last backup</p>
            <p className="mt-1 text-sm font-medium">
              {status.lastBackup ? new Date(status.lastBackup).toLocaleString() : 'Never'}
            </p>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <button
          type="button"
          disabled={!!loading}
          onClick={() => createBackup('full')}
          className="rounded-xl bg-indigo-600 px-4 py-2 text-sm font-medium text-white hover:bg-indigo-700 disabled:opacity-60"
        >
          {loading === 'create' ? <Loader2 className="inline h-4 w-4 animate-spin" /> : null}
          Full backup
        </button>
        <button
          type="button"
          disabled={!!loading}
          onClick={() => createBackup('database')}
          className="rounded-xl border px-4 py-2 text-sm font-medium"
        >
          Database only
        </button>
        <button
          type="button"
          disabled={!!loading}
          onClick={() => createBackup('files')}
          className="rounded-xl border px-4 py-2 text-sm font-medium"
        >
          Files only
        </button>
        <button
          type="button"
          disabled={!!loading}
          onClick={() => createBackup('license')}
          className="rounded-xl border px-4 py-2 text-sm font-medium"
        >
          License DB only
        </button>
        <button
          type="button"
          onClick={() => setShowRecovery((v) => !v)}
          className="inline-flex items-center gap-2 rounded-xl border border-amber-300 bg-amber-50 px-4 py-2 text-sm font-medium text-amber-900"
        >
          <ShieldAlert className="h-4 w-4" />
          System recovery
        </button>
      </div>

      {showRecovery && (
        <form
          onSubmit={runRecovery}
          className="space-y-4 rounded-2xl border border-amber-200 bg-amber-50/40 p-4"
        >
          <h3 className="font-semibold text-amber-900">System recovery</h3>
          <p className="text-xs text-amber-800">
            Full restore requires S-CLS1 and authorization code. A pre-restore safety copy is
            created unless overwrite is enabled.
          </p>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Recovery type</span>
            <select
              value={recovery.restoreType}
              onChange={(e) =>
                setRecovery({
                  ...recovery,
                  restoreType: e.target.value as 'database' | 'files' | 'full',
                })
              }
              className={inputClass}
            >
              <option value="database">MSP database only</option>
              <option value="license">License database only</option>
              <option value="files">Uploads / files only</option>
              <option value="full">Full system (destructive)</option>
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">From existing backup</span>
            <select
              value={recovery.backupId}
              onChange={(e) => setRecovery({ ...recovery, backupId: e.target.value })}
              className={inputClass}
            >
              <option value="">— or upload ZIP below —</option>
              {backups
                .filter((b) => b.status === 'completed' || b.status === 'verified')
                .map((b) => (
                  <option key={b.id} value={b.id}>
                    {b.backupName} ({b.backupType})
                  </option>
                ))}
            </select>
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Or upload ZIP</span>
            <input
              type="file"
              accept=".zip"
              onChange={(e) => setUploadFile(e.target.files?.[0] ?? null)}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Reason</span>
            <textarea
              required
              rows={2}
              value={recovery.reason}
              onChange={(e) => setRecovery({ ...recovery, reason: e.target.value })}
              className={inputClass}
            />
          </label>
          <label className="block">
            <span className="text-xs font-medium text-slate-600">Authorization code</span>
            <input
              type="password"
              value={recovery.authorization}
              onChange={(e) => setRecovery({ ...recovery, authorization: e.target.value })}
              className={inputClass}
              placeholder="Required for full restore"
            />
          </label>
          <label className="flex items-center gap-2 text-sm">
            <input
              type="checkbox"
              checked={recovery.overwrite}
              onChange={(e) => setRecovery({ ...recovery, overwrite: e.target.checked })}
            />
            Overwrite without pre-restore safety copy (S-CLS1)
          </label>
          <div className="flex gap-2">
            <button
              type="submit"
              disabled={loading === 'recover'}
              className="rounded-xl bg-amber-700 px-4 py-2 text-sm text-white disabled:opacity-60"
            >
              {loading === 'recover' ? 'Recovering…' : 'Run recovery'}
            </button>
            <button type="button" onClick={() => setShowRecovery(false)} className="rounded-xl border px-4 py-2 text-sm">
              Cancel
            </button>
          </div>
        </form>
      )}

      <div className="overflow-hidden rounded-2xl border border-slate-200">
        <table className="w-full text-sm">
          <thead className="bg-slate-50 text-left text-xs uppercase text-slate-500">
            <tr>
              <th className="px-4 py-3">Name</th>
              <th className="px-4 py-3">Type</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Size</th>
              <th className="px-4 py-3">Actions</th>
            </tr>
          </thead>
          <tbody>
            {backups.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-8 text-center text-slate-500">
                  {loading === 'load' ? 'Loading…' : 'No backups yet'}
                </td>
              </tr>
            ) : (
              backups.map((b) => (
                <tr key={b.id} className="border-t border-slate-100">
                  <td className="max-w-xs truncate px-4 py-2 font-mono text-xs">{b.backupName}</td>
                  <td className="px-4 py-2 capitalize">{b.backupType}</td>
                  <td className="px-4 py-2 capitalize">{b.status}</td>
                  <td className="px-4 py-2">{b.fileSize ? formatBytes(Number(b.fileSize)) : '—'}</td>
                  <td className="px-4 py-2">
                    <div className="flex gap-1">
                      <a
                        href={`/api/backup/${b.id}/download`}
                        className="rounded p-1 text-indigo-600 hover:bg-indigo-50"
                        title="Download"
                      >
                        <Download className="h-4 w-4" />
                      </a>
                      <button
                        type="button"
                        title="Verify"
                        className="rounded p-1 text-emerald-600 hover:bg-emerald-50"
                        onClick={async () => {
                          const res = await fetch(`/api/backup/${b.id}/verify`, { method: 'POST' });
                          const data = await res.json();
                          if (!res.ok) onError(data.message);
                          else {
                            onMessage('Backup verified');
                            loadAll();
                          }
                        }}
                      >
                        <CheckCircle className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        title="Delete"
                        className="rounded p-1 text-red-600 hover:bg-red-50"
                        onClick={async () => {
                          if (!confirm('Delete this backup?')) return;
                          await fetch(`/api/backup/${b.id}`, { method: 'DELETE' });
                          loadAll();
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      <p className="flex items-center gap-2 text-xs text-slate-500">
        <DatabaseBackup className="h-4 w-4" />
        Backups stored under <code className="rounded bg-slate-100 px-1">data/backups/</code>
      </p>
    </section>
  );
}
