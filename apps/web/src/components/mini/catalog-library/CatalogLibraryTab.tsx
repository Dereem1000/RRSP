'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { ArrowRight, Loader2, Package, RefreshCw, Share2, Store } from 'lucide-react';
import { CanonicalCatalogPanel } from '@/components/mini/catalog-library/CanonicalCatalogPanel';
import {
  catalogPolicyPayload,
  mergeCatalogPolicy,
  type CatalogPolicyState,
} from '@/lib/pos-catalog-policy';

type ModuleEntry = {
  id?: string;
  entry_id?: string;
  name?: string;
  version?: string;
  description?: string;
  file_name?: string;
};

type ModuleSource = {
  project?: string;
  modules_path?: string;
};

type ModuleProfile = {
  id: string;
  name?: string;
  source_paths?: string[];
};

type PosConnection = {
  connection_id: string;
  system_name?: string;
  company_name?: string;
  share_products?: boolean;
  receive_hints?: boolean;
  module_catalog_profile_id?: string;
};

type Props = {
  moduleStore?: {
    entries?: ModuleEntry[];
    total?: number;
    sources?: ModuleSource[];
    source_count?: number;
  };
  posCatalogSummary?: {
    policy?: CatalogPolicyState;
    canonical_total?: number;
    sharing_connections?: number;
  };
  busy: boolean;
  runAction: (fn: () => Promise<void>) => void;
  libraryPost: <T>(path: string, body?: Record<string, unknown>) => Promise<T>;
  libraryFetch: <T>(path: string) => Promise<T>;
  setStatus: (msg: string) => void;
  onRefresh: () => Promise<void>;
};

type InnerPane = 'modules' | 'products';

export function CatalogLibraryTab({
  moduleStore,
  posCatalogSummary,
  busy,
  runAction,
  libraryPost,
  libraryFetch,
  setStatus,
  onRefresh,
}: Props) {
  const [pane, setPane] = useState<InnerPane>('modules');
  const [modulesPath, setModulesPath] = useState('E:\\POS System\\server\\modules');
  const [profiles, setProfiles] = useState<ModuleProfile[]>([]);
  const [connections, setConnections] = useState<PosConnection[]>([]);
  const [policy, setPolicy] = useState<CatalogPolicyState>(() => mergeCatalogPolicy(posCatalogSummary?.policy));
  const policyDirtyRef = useRef(false);

  const loadProfiles = useCallback(async () => {
    const data = await libraryFetch<{ profiles?: ModuleProfile[] }>('modules/profiles');
    setProfiles(data.profiles || []);
  }, [libraryFetch]);

  const loadConnections = useCallback(async () => {
    const data = await libraryFetch<{ connections?: PosConnection[] }>('pos-catalog/connections');
    setConnections(data.connections || []);
  }, [libraryFetch]);

  const loadPolicy = useCallback(async () => {
    const data = await libraryFetch<{ policy?: CatalogPolicyState }>('pos-catalog/policy');
    if (data.policy) {
      policyDirtyRef.current = false;
      setPolicy(mergeCatalogPolicy(data.policy));
    }
  }, [libraryFetch]);

  const persistPolicy = useCallback(
    async (next: CatalogPolicyState) => {
      const payload = catalogPolicyPayload(next);
      try {
        const data = await libraryPost<{ policy?: CatalogPolicyState; error?: string }>(
          'pos-catalog/policy',
          payload,
        );
        if (data.error) throw new Error(data.error);
        policyDirtyRef.current = false;
        if (data.policy) {
          setPolicy(mergeCatalogPolicy(data.policy));
        } else {
          setPolicy(mergeCatalogPolicy(next));
        }
        await onRefresh();
      } catch (err) {
        policyDirtyRef.current = false;
        await loadPolicy().catch(() => {});
        throw err;
      }
    },
    [libraryPost, loadPolicy, onRefresh],
  );

  useEffect(() => {
    void Promise.all([loadProfiles(), loadConnections(), loadPolicy()]).catch(() => {});
  }, [loadProfiles, loadConnections, loadPolicy]);

  useEffect(() => {
    if (policyDirtyRef.current) return;
    if (!posCatalogSummary?.policy) return;
    setPolicy(mergeCatalogPolicy(posCatalogSummary.policy));
  }, [
    posCatalogSummary?.policy?.federation_enabled,
    posCatalogSummary?.policy?.consensus_mode,
    posCatalogSummary?.policy?.min_agree_count,
  ]);

  const entries = moduleStore?.entries || [];
  const sources = moduleStore?.sources || [];

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ['modules', 'Module catalog', Package],
            ['products', 'Shared product catalog', Share2],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setPane(id)}
            className={`inline-flex items-center gap-2 rounded-xl px-3 py-1.5 text-sm font-medium ${
              pane === id ? 'bg-violet-100 text-violet-800' : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {pane === 'modules' ? (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">POS module sources</h3>
            <p className="mt-1 text-sm text-slate-600">
              {moduleStore?.total ?? 0} modules · {moduleStore?.source_count ?? sources.length} ZIP folders
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Modules folder
              <input
                value={modulesPath}
                onChange={(e) => setModulesPath(e.target.value)}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await libraryPost('modules/sources/add', { modules_path: modulesPath.trim(), project: 'pos' });
                    setStatus('Module source added and catalog synced.');
                    await onRefresh();
                  })
                }
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                Add source
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await libraryPost('modules/sources/remove', { modules_path: modulesPath.trim() });
                    setStatus('Module source removed.');
                    await onRefresh();
                  })
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Remove
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    await libraryPost('modules/sync', { project: 'pos' });
                    setStatus('Module catalog synced from ZIP folders.');
                    await onRefresh();
                  })
                }
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
                Sync
              </button>
            </div>
            <ul className="mt-4 max-h-40 space-y-1 overflow-y-auto text-xs text-slate-600">
              {sources.length === 0 ? (
                <li>No module sources configured.</li>
              ) : (
                sources.map((source) => (
                  <li key={source.modules_path} className="rounded-lg bg-slate-50 px-2 py-1">
                    {source.modules_path} <span className="text-slate-400">({source.project || 'pos'})</span>
                  </li>
                ))
              )}
            </ul>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Module catalog entries</h3>
            <p className="mt-1 text-sm text-slate-600">Published to connected POS systems via Mini Module Store.</p>
            <div className="mt-4 max-h-80 space-y-2 overflow-y-auto">
              {entries.length === 0 ? (
                <p className="text-sm text-slate-500">No modules in catalog. Add a source folder and sync.</p>
              ) : (
                entries.map((entry) => (
                  <div
                    key={entry.entry_id || entry.id}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-sm"
                  >
                    <p className="font-medium text-slate-900">
                      {entry.name} <span className="text-slate-500">v{entry.version}</span>
                    </p>
                    {entry.description && <p className="mt-0.5 text-xs text-slate-600">{entry.description}</p>}
                    {entry.file_name && <p className="mt-0.5 text-xs text-slate-400">{entry.file_name}</p>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm xl:col-span-2">
            <h3 className="text-lg font-semibold text-slate-900">Per-store module profiles</h3>
            <p className="mt-1 text-sm text-slate-600">
              Assign which ZIP source set each accepted POS connection sees in Module Store.
            </p>
            <div className="mt-4 overflow-x-auto">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 text-slate-500">
                    <th className="py-2 pr-4 font-medium">POS connection</th>
                    <th className="py-2 pr-4 font-medium">Module profile</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.length === 0 ? (
                    <tr>
                      <td colSpan={2} className="py-3 text-slate-500">No accepted POS connections yet.</td>
                    </tr>
                  ) : (
                    connections.map((row) => (
                      <tr key={row.connection_id} className="border-b border-slate-100">
                        <td className="py-2 pr-4">
                          <p className="font-medium text-slate-900">{row.system_name || row.connection_id}</p>
                          <p className="text-xs text-slate-500">{row.company_name}</p>
                        </td>
                        <td className="py-2 pr-4">
                          <select
                            value={row.module_catalog_profile_id || 'default'}
                            disabled={busy}
                            onChange={(e) =>
                              runAction(async () => {
                                await libraryPost(`pos-catalog/connections/${encodeURIComponent(row.connection_id)}`, {
                                  module_catalog_profile_id: e.target.value,
                                });
                                setStatus('Module profile updated for connection.');
                                await loadConnections();
                              })
                            }
                            className="rounded-lg border border-slate-200 px-2 py-1 text-sm"
                          >
                            {profiles.map((profile) => (
                              <option key={profile.id} value={profile.id}>
                                {profile.name || profile.id}
                              </option>
                            ))}
                          </select>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </section>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 text-violet-700" />
                <h3 className="text-lg font-semibold text-slate-900">Federation policy</h3>
              </div>
              <Link
                href="/mini/federation-catalog"
                className="inline-flex shrink-0 items-center gap-1 rounded-xl border border-violet-200 bg-violet-50 px-3 py-1.5 text-xs font-semibold text-violet-900 hover:bg-violet-100"
              >
                Open federation catalog
                <ArrowRight className="h-3.5 w-3.5" />
              </Link>
            </div>
            <p className="mt-1 text-sm text-slate-600">
              {posCatalogSummary?.canonical_total ?? 0} canonical products ·{' '}
              {posCatalogSummary?.sharing_connections ?? 0} stores sharing
            </p>
            <label className="mt-4 flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={policy.federation_enabled === true}
                disabled={busy}
                onChange={(e) => {
                  const enabled = e.target.checked;
                  const next = { ...policy, federation_enabled: enabled };
                  policyDirtyRef.current = true;
                  setPolicy(next);
                  runAction(async () => {
                    await persistPolicy(next);
                    setStatus(
                      enabled
                        ? 'Catalog federation enabled — POS stores can push and pull shared catalog hints.'
                        : 'Catalog federation disabled — pushes and hint delivery are paused.',
                    );
                  });
                }}
              />
              Enable catalog federation
            </label>
            <p className="mt-1 text-xs text-slate-500">Saves immediately when toggled. Consensus settings use Save policy.</p>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Consensus for barcode / image
              <select
                value={policy.consensus_mode || 'two_stores'}
                onChange={(e) => {
                  policyDirtyRef.current = true;
                  setPolicy((prev) => ({
                    ...prev,
                    consensus_mode: e.target.value as CatalogPolicyState['consensus_mode'],
                  }));
                }}
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
              >
                <option value="two_stores">At least 2 stores agree</option>
                <option value="majority">Majority of sharing stores</option>
                <option value="min_count">Custom minimum count</option>
              </select>
            </label>
            {policy.consensus_mode === 'min_count' && (
              <label className="mt-3 block text-sm font-medium text-slate-700">
                Minimum agreeing stores
                <input
                  type="number"
                  min={1}
                  value={policy.min_agree_count ?? 2}
                  onChange={(e) => {
                    policyDirtyRef.current = true;
                    setPolicy((prev) => ({ ...prev, min_agree_count: Number(e.target.value) || 2 }));
                  }}
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm"
                />
              </label>
            )}
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await persistPolicy(policy);
                  setStatus('Catalog federation policy saved.');
                  await loadPolicy();
                })
              }
              className="mt-4 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
            >
              Save policy
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  await libraryPost('pos-catalog/recompute', {});
                  setStatus('Consensus recomputed.');
                })
              }
              className="ml-2 mt-4 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Recompute consensus
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() =>
                runAction(async () => {
                  const result = await libraryPost<{ imported?: number; error?: string }>(
                    'pos-catalog/import-starter',
                    {},
                  );
                  if (result.error) throw new Error(result.error);
                  setStatus(`Starter catalog imported (${result.imported ?? 0} products). Refresh canonical list.`);
                  await onRefresh();
                })
              }
              className="ml-2 mt-4 rounded-xl border border-violet-200 bg-violet-50 px-4 py-2 text-sm font-medium text-violet-800 hover:bg-violet-100 disabled:opacity-60"
            >
              Import starter catalog
            </button>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">POS connections</h3>
            <p className="mt-1 text-sm text-slate-600">Opt-in sharing and hint delivery per store.</p>
            <div className="mt-4 max-h-72 space-y-3 overflow-y-auto">
              {connections.length === 0 ? (
                <p className="text-sm text-slate-500">No accepted POS connections.</p>
              ) : (
                connections.map((row) => (
                  <div key={row.connection_id} className="rounded-xl border border-slate-100 bg-slate-50 p-3 text-sm">
                    <p className="font-medium text-slate-900">{row.system_name || row.connection_id}</p>
                    <label className="mt-2 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(row.share_products)}
                        disabled={busy}
                        onChange={(e) =>
                          runAction(async () => {
                            await libraryPost(`pos-catalog/connections/${encodeURIComponent(row.connection_id)}`, {
                              share_products: e.target.checked,
                            });
                            await loadConnections();
                          })
                        }
                      />
                      Share catalog with Mini
                    </label>
                    <label className="mt-1 flex items-center gap-2">
                      <input
                        type="checkbox"
                        checked={Boolean(row.receive_hints)}
                        disabled={busy}
                        onChange={(e) =>
                          runAction(async () => {
                            await libraryPost(`pos-catalog/connections/${encodeURIComponent(row.connection_id)}`, {
                              receive_hints: e.target.checked,
                            });
                            await loadConnections();
                          })
                        }
                      />
                      Receive shared hints
                    </label>
                  </div>
                ))
              )}
            </div>
          </section>

          <CanonicalCatalogPanel
            busy={busy}
            canonicalTotal={posCatalogSummary?.canonical_total}
            refreshToken={posCatalogSummary?.canonical_total}
            runAction={runAction}
            libraryPost={libraryPost}
            libraryFetch={libraryFetch}
            setStatus={setStatus}
          />
        </div>
      )}
      {busy && (
        <p className="inline-flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Working…
        </p>
      )}
    </div>
  );
}
