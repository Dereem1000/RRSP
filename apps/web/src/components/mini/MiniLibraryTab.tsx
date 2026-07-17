'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { BookOpen, FolderOpen, Loader2, Package, RefreshCw, Search } from 'lucide-react';
import { apiErrorMessage, parseFetchJsonResponse } from '@/lib/parse-fetch-json';
import { useAdaptiveMiniPoll } from '@/lib/use-adaptive-mini-poll';

type LibraryModule = 'knowledge' | 'updates';
type KnowledgePane = 'project' | 'general';

type ProjectEntry = {
  id: string;
  title?: string;
  path?: string;
  source_name?: string;
  source_root?: string;
  index_folder?: string;
  content_excerpt?: string;
  source_kind?: string;
  synced?: boolean;
  tags?: string[];
};

type GeneralEntry = {
  id: string;
  title?: string;
  topic?: string;
  source?: string;
  content?: string;
  summary?: string;
  raw_excerpt?: string;
  tags?: string[];
  category?: string;
};

type SearchResult = {
  section: 'project' | 'general' | 'updates';
  score: number;
  id: string;
  title: string;
  snippet: string;
  source: string;
};

type LibraryPayload = {
  note?: string;
  project_library?: {
    total?: number;
    source_count?: number;
    sources?: Array<{ path?: string; index_folder?: string } | string>;
    entries?: ProjectEntry[];
  };
  general_library?: {
    total?: number;
    entries?: GeneralEntry[];
  };
  update_library?: {
    total?: number;
    pullable?: number;
    projects?: string[];
    source_count?: number;
    sources?: Array<{ project?: string; deploy_path?: string; changelog_path?: string }>;
    entries?: Array<{
      id: string;
      project?: string;
      title?: string;
      version?: string;
      status?: string;
      pull_ready?: boolean;
      release_date?: string;
    }>;
  };
};

function sourcePath(source: { path?: string; index_folder?: string } | string): string {
  if (typeof source === 'string') return source;
  return source.path || '';
}

function sourceEntryLabel(source: { path?: string; index_folder?: string } | string): string {
  const path = sourcePath(source);
  if (typeof source === 'object' && source !== null && source.index_folder && source.index_folder !== path) {
    return `${path} (indexes: ${source.index_folder})`;
  }
  return path;
}

function normalizeLibraryPath(value: string): string {
  return value.replace(/\\/g, '/').toLowerCase();
}

function filterProjectEntriesBySource(
  entries: ProjectEntry[],
  selectedSource: string
): ProjectEntry[] {
  if (selectedSource === '__all__') return entries;
  const selectedNorm = normalizeLibraryPath(selectedSource);
  return entries.filter(
    (entry) =>
      normalizeLibraryPath(entry.source_root || '') === selectedNorm ||
      normalizeLibraryPath(entry.index_folder || '') === selectedNorm
  );
}

async function libraryGet(): Promise<LibraryPayload> {
  const res = await fetch('/api/mini/library', { cache: 'no-store', credentials: 'include' });
  const data = await parseFetchJsonResponse<LibraryPayload & { error?: string }>(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, 'Failed to load library'));
  return data;
}

async function libraryFetch<T>(path: string): Promise<T> {
  const res = await fetch(`/api/mini/library/${path}`, { cache: 'no-store', credentials: 'include' });
  const data = await parseFetchJsonResponse<T & { error?: string }>(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, `Request failed (${res.status})`));
  return data as T;
}

async function libraryPost<T>(path: string, body: Record<string, unknown> = {}): Promise<T> {
  const res = await fetch(`/api/mini/library/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    credentials: 'include',
    body: JSON.stringify(body),
  });
  const data = await parseFetchJsonResponse<T & { error?: string }>(res);
  if (!res.ok) throw new Error(apiErrorMessage(data, `Request failed (${res.status})`));
  return data as T;
}

function statusTone(status: string): string {
  const key = status.toLowerCase();
  if (key === 'ready' || key === 'applied') return 'bg-emerald-100 text-emerald-800';
  if (key === 'draft') return 'bg-amber-100 text-amber-800';
  return 'bg-slate-100 text-slate-700';
}

function sectionLabel(section: SearchResult['section']): string {
  if (section === 'project') return 'Project';
  if (section === 'updates') return 'Update';
  return 'General';
}

function ProjectEntryDetail({
  entry,
  onLoadFull,
  fullContent,
  fullLoading,
  fullError,
}: {
  entry: ProjectEntry | null;
  onLoadFull: (entryId: string) => void;
  fullContent: string | null;
  fullLoading: boolean;
  fullError: string;
}) {
  if (!entry) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Select a project document to inspect it here.
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">Project context</p>
          <h4 className="mt-1 text-base font-semibold text-slate-900">{entry.title || entry.path || entry.id}</h4>
        </div>
      </div>
      <dl className="mt-4 grid gap-2 text-sm">
        {entry.path && (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="font-medium text-slate-600">Path</dt>
            <dd className="break-all text-slate-900">{entry.path}</dd>
          </div>
        )}
        {entry.source_root && (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="font-medium text-slate-600">Project source</dt>
            <dd className="break-all text-slate-900">{entry.source_root}</dd>
          </div>
        )}
        {entry.source_kind && (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="font-medium text-slate-600">Type</dt>
            <dd className="text-slate-900">{entry.source_kind}</dd>
          </div>
        )}
      </dl>
      {entry.content_excerpt && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Indexed content</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{entry.content_excerpt}</p>
        </div>
      )}
      <div className="mt-4">
        <div className="flex flex-wrap items-center gap-3">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Full document</p>
          <button
            type="button"
            disabled={fullLoading}
            onClick={() => onLoadFull(entry.id)}
            className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-100 disabled:opacity-60"
          >
            {fullLoading ? 'Loading…' : entry.synced ? 'Read synced copy' : 'Read from path'}
          </button>
        </div>
        {fullError && <p className="mt-2 text-sm text-red-700">{fullError}</p>}
        {fullContent && (
          <pre className="mt-3 max-h-[24rem] overflow-auto whitespace-pre-wrap break-words rounded-xl border border-slate-200 bg-white p-3 text-xs text-slate-800">
            {fullContent}
          </pre>
        )}
      </div>
    </div>
  );
}

function GeneralEntryDetail({ entry }: { entry: GeneralEntry | null }) {
  if (!entry) {
    return (
      <div className="flex h-full min-h-[16rem] items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 p-6 text-sm text-slate-500">
        Select a general knowledge entry to inspect it here.
      </div>
    );
  }

  const body = entry.summary || entry.content || '';

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
      <p className="text-xs font-semibold uppercase tracking-wide text-violet-700">General knowledge</p>
      <h4 className="mt-1 text-base font-semibold text-slate-900">{entry.title || entry.id}</h4>
      <dl className="mt-4 grid gap-2 text-sm">
        {entry.source && (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="font-medium text-slate-600">Source</dt>
            <dd className="text-slate-900">{entry.source}</dd>
          </div>
        )}
        {entry.topic && (
          <div className="grid gap-1 sm:grid-cols-[7rem_1fr]">
            <dt className="font-medium text-slate-600">Topic</dt>
            <dd className="text-slate-900">{entry.topic}</dd>
          </div>
        )}
      </dl>
      {body && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Summary</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{body}</p>
        </div>
      )}
      {entry.raw_excerpt && (
        <div className="mt-4">
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Raw excerpt</p>
          <p className="mt-2 whitespace-pre-wrap text-sm text-slate-800">{entry.raw_excerpt}</p>
        </div>
      )}
    </div>
  );
}

export function MiniLibraryTab() {
  const [module, setModule] = useState<LibraryModule>('knowledge');
  const [payload, setPayload] = useState<LibraryPayload | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [status, setStatus] = useState('');

  const [projectSourcePath, setProjectSourcePath] = useState('');
  const [generalTitle, setGeneralTitle] = useState('');
  const [generalContent, setGeneralContent] = useState('');
  const [generalTags, setGeneralTags] = useState('');
  const [learnUrl, setLearnUrl] = useState('');
  const [learnTags, setLearnTags] = useState('');

  const [deployProject, setDeployProject] = useState('');
  const [deployPath, setDeployPath] = useState('');
  const [changelogPath, setChangelogPath] = useState('');

  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<SearchResult[]>([]);
  const [searchBusy, setSearchBusy] = useState(false);
  const [knowledgePane, setKnowledgePane] = useState<KnowledgePane>('project');
  const [selectedProjectSource, setSelectedProjectSource] = useState('__all__');
  const [selectedProjectEntryId, setSelectedProjectEntryId] = useState<string | null>(null);
  const [selectedGeneralEntryId, setSelectedGeneralEntryId] = useState<string | null>(null);
  const [fullDocEntryId, setFullDocEntryId] = useState<string | null>(null);
  const [fullDocContent, setFullDocContent] = useState<string | null>(null);
  const [fullDocLoading, setFullDocLoading] = useState(false);
  const [fullDocError, setFullDocError] = useState('');

  const project = payload?.project_library;
  const general = payload?.general_library;
  const updates = payload?.update_library;

  const loadInFlightRef = useRef(false);

  const load = useCallback(async (): Promise<boolean> => {
    if (loadInFlightRef.current) return false;
    loadInFlightRef.current = true;
    setError('');
    try {
      const data = await libraryGet();
      setPayload(data);
      return true;
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load library');
      return false;
    } finally {
      loadInFlightRef.current = false;
      setLoading(false);
    }
  }, []);

  useAdaptiveMiniPoll(true, load, { baseMs: 45_000, maxMs: 180_000 });

  const projectSources = useMemo(
    () => (project?.sources || []).map((row) => sourcePath(row)).filter(Boolean),
    [project?.sources]
  );

  const projectSourceOptions = useMemo(() => {
    const sources = project?.sources || [];
    return [
      { value: '__all__', label: 'All configured sources' },
      ...sources.map((source) => ({
        value: sourcePath(source),
        label: sourceEntryLabel(source),
      })),
    ];
  }, [project?.sources]);

  const filteredProjectEntries = useMemo(
    () => filterProjectEntriesBySource(project?.entries || [], selectedProjectSource),
    [project?.entries, selectedProjectSource]
  );

  const selectedProjectEntry = useMemo(() => {
    if (!filteredProjectEntries.length) return null;
    const match = filteredProjectEntries.find((entry) => entry.id === selectedProjectEntryId);
    return match || filteredProjectEntries[0];
  }, [filteredProjectEntries, selectedProjectEntryId]);

  const selectedGeneralEntry = useMemo(() => {
    const entries = general?.entries || [];
    if (!entries.length) return null;
    const match = entries.find((entry) => entry.id === selectedGeneralEntryId);
    return match || entries[0];
  }, [general?.entries, selectedGeneralEntryId]);

  useEffect(() => {
    if (selectedProjectSource !== '__all__') {
      const valid = new Set(projectSourceOptions.map((option) => option.value));
      if (!valid.has(selectedProjectSource)) {
        setSelectedProjectSource('__all__');
      }
    }
  }, [projectSourceOptions, selectedProjectSource]);

  useEffect(() => {
    setFullDocContent(null);
    setFullDocError('');
    setFullDocEntryId(null);
  }, [selectedProjectEntry?.id]);

  async function runAction(action: () => Promise<void>) {
    setBusy(true);
    setError('');
    try {
      await action();
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Action failed');
    } finally {
      setBusy(false);
    }
  }

  async function pickDeployFolder() {
    setStatus('Opening folder picker on the Mini host…');
    const result = await libraryPost<{ source_path?: string; cancelled?: boolean; error?: string }>(
      'updates/sources/pick'
    );
    if (result.cancelled) {
      setStatus('Folder selection cancelled.');
      return;
    }
    if (result.error) throw new Error(result.error);
    if (result.source_path) {
      setDeployPath(result.source_path);
      setStatus(`Selected: ${result.source_path}`);
    }
  }

  async function runSearch() {
    const query = searchQuery.trim();
    if (!query) return;
    setSearchBusy(true);
    setError('');
    try {
      const result = await libraryPost<{ results?: SearchResult[] }>('search', { query, limit: 20 });
      setSearchResults(result.results || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Search failed');
    } finally {
      setSearchBusy(false);
    }
  }

  function focusSearchResult(result: SearchResult) {
    if (result.section === 'updates') {
      setModule('updates');
      return;
    }
    setKnowledgePane(result.section === 'project' ? 'project' : 'general');
    if (result.section === 'project') {
      const entries = project?.entries || [];
      const matched = entries.find((entry) => entry.id === result.id);
      if (matched?.source_root) {
        setSelectedProjectSource(matched.source_root);
      }
      setSelectedProjectEntryId(result.id);
    } else {
      setSelectedGeneralEntryId(result.id);
    }
  }

  async function loadFullDocument(entryId: string) {
    setFullDocLoading(true);
    setFullDocError('');
    setFullDocContent(null);
    setFullDocEntryId(entryId);
    try {
      const result = await libraryFetch<{ content?: string; error?: string }>(
        `project/entry/${encodeURIComponent(entryId)}/content`
      );
      if (result.error) throw new Error(result.error);
      setFullDocContent(result.content || '');
    } catch (err) {
      setFullDocError(err instanceof Error ? err.message : 'Failed to load document');
    } finally {
      setFullDocLoading(false);
    }
  }

  if (loading && !payload) {
    return (
      <div className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-white p-8 text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin" />
        Loading Mini library…
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <div className="flex items-center gap-2">
            <BookOpen className="h-6 w-6 text-violet-700" />
            <h2 className="text-xl font-bold text-slate-900">Library</h2>
          </div>
          <p className="mt-1 max-w-3xl text-sm text-slate-600">
            {payload?.note || 'Mini Knowledge Base and Update Library — managed from Computer Dynamics.'}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={() => runAction(async () => { await load(); })}
          className="inline-flex items-center gap-2 rounded-xl border border-slate-200 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
        >
          <RefreshCw className={`h-4 w-4 ${busy ? 'animate-spin' : ''}`} />
          Refresh
        </button>
      </div>

      <div className="flex flex-wrap gap-2 border-b border-slate-200 pb-1">
        {(
          [
            ['knowledge', 'Mini Knowledge Base', BookOpen],
            ['updates', 'Update Library', Package],
          ] as const
        ).map(([id, label, Icon]) => (
          <button
            key={id}
            type="button"
            onClick={() => setModule(id)}
            className={`inline-flex items-center gap-2 border-b-2 px-4 py-2 text-sm font-medium transition ${
              module === id
                ? 'border-violet-600 text-violet-700'
                : 'border-transparent text-slate-500 hover:text-slate-800'
            }`}
          >
            <Icon className="h-4 w-4" />
            {label}
          </button>
        ))}
      </div>

      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">{error}</div>
      )}
      {status && !error && (
        <div className="rounded-xl border border-violet-200 bg-violet-50 px-4 py-3 text-sm text-violet-900">{status}</div>
      )}

      {module === 'knowledge' ? (
        <div className="space-y-6">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Search knowledge base</h3>
                <p className="mt-1 text-sm text-slate-600">Search project documents and general knowledge.</p>
              </div>
            </div>
            <div className="mt-4 flex flex-wrap gap-2">
              <input
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') runSearch().catch(() => {});
                }}
                placeholder="Search project documents and general knowledge…"
                className="min-w-[16rem] flex-1 rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
              <button
                type="button"
                disabled={searchBusy || !searchQuery.trim()}
                onClick={() => runSearch()}
                className="inline-flex items-center gap-2 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                {searchBusy ? <Loader2 className="h-4 w-4 animate-spin" /> : <Search className="h-4 w-4" />}
                Search
              </button>
            </div>
            <div className="mt-4 max-h-56 space-y-2 overflow-y-auto">
              {searchResults.length === 0 ? (
                <p className="text-sm text-slate-500">Run a search to see matching documents and knowledge entries.</p>
              ) : (
                searchResults.map((result) => (
                  <button
                    key={`${result.section}-${result.id}`}
                    type="button"
                    onClick={() => focusSearchResult(result)}
                    className="w-full rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-left hover:border-violet-200 hover:bg-violet-50/40"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="rounded-full bg-violet-100 px-2 py-0.5 text-[10px] font-semibold uppercase text-violet-800">
                        {sectionLabel(result.section)}
                      </span>
                      <p className="text-sm font-medium text-slate-900">{result.title}</p>
                    </div>
                    {result.snippet && <p className="mt-1 text-xs text-slate-600">{result.snippet}</p>}
                    {result.source && <p className="mt-1 text-xs text-slate-500">{result.source}</p>}
                  </button>
                ))
              )}
            </div>
          </section>

          <div className="grid gap-6 xl:grid-cols-2">
            <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
              <h3 className="text-lg font-semibold text-slate-900">Project library</h3>
              <p className="mt-1 text-sm text-slate-600">
                {project?.total ?? 0} documents · {project?.source_count ?? 0} source folders
              </p>
              <label className="mt-4 block text-sm font-medium text-slate-700">
                Project source folder
                <input
                  value={projectSourcePath}
                  onChange={(e) => setProjectSourcePath(e.target.value)}
                  placeholder="E:\CRM or path to project docs"
                  className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                />
              </label>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      if (!projectSourcePath.trim()) throw new Error('Enter a project source path');
                      await libraryPost('project/sources/add', {
                        source_path: projectSourcePath.trim(),
                        index_folder: projectSourcePath.trim(),
                      });
                      setProjectSourcePath('');
                      setStatus('Project source added.');
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
                      await libraryPost('project/refresh');
                      setStatus('Project library refreshed.');
                    })
                  }
                  className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Refresh index
                </button>
              </div>
              <div className="mt-4 space-y-2">
                {projectSources.length === 0 ? (
                  <p className="text-sm text-slate-500">No project sources configured.</p>
                ) : (
                  projectSources.map((row) => (
                    <div key={row} className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700">
                      {row}
                    </div>
                  ))
                )}
              </div>
            </section>

            <section className="space-y-6">
              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">General knowledge</h3>
                <p className="mt-1 text-sm text-slate-600">{general?.total ?? 0} entries</p>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  Title
                  <input
                    value={generalTitle}
                    onChange={(e) => setGeneralTitle(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Content
                  <textarea
                    value={generalContent}
                    onChange={(e) => setGeneralContent(e.target.value)}
                    rows={4}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Tags (comma-separated)
                  <input
                    value={generalTags}
                    onChange={(e) => setGeneralTags(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      if (!generalTitle.trim() || !generalContent.trim()) {
                        throw new Error('Title and content are required');
                      }
                      await libraryPost('general/add', {
                        title: generalTitle.trim(),
                        content: generalContent.trim(),
                        tags: generalTags.split(',').map((t) => t.trim()).filter(Boolean),
                      });
                      setGeneralTitle('');
                      setGeneralContent('');
                      setGeneralTags('');
                      setStatus('Knowledge entry stored.');
                    })
                  }
                  className="mt-3 rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
                >
                  Add entry
                </button>
              </div>

              <div className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
                <h3 className="text-lg font-semibold text-slate-900">Learn from URL</h3>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  URL
                  <input
                    value={learnUrl}
                    onChange={(e) => setLearnUrl(e.target.value)}
                    placeholder="https://…"
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <label className="mt-3 block text-sm font-medium text-slate-700">
                  Tags (optional)
                  <input
                    value={learnTags}
                    onChange={(e) => setLearnTags(e.target.value)}
                    className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  />
                </label>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() =>
                    runAction(async () => {
                      if (!learnUrl.trim()) throw new Error('URL is required');
                      const result = await libraryPost<{ entry?: { title?: string } }>('general/learn', {
                        url: learnUrl.trim(),
                        tags: learnTags.split(',').map((t) => t.trim()).filter(Boolean),
                      });
                      setLearnUrl('');
                      setLearnTags('');
                      setStatus(`Learned: ${result.entry?.title || learnUrl}`);
                    })
                  }
                  className="mt-3 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                >
                  Learn from URL
                </button>
              </div>
            </section>
          </div>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-lg font-semibold text-slate-900">Knowledge browser</h3>
                <p className="mt-1 text-sm text-slate-600">Browse indexed project docs and general knowledge entries.</p>
              </div>
              <div className="flex flex-wrap gap-2">
                {(
                  [
                    ['project', 'Project library'],
                    ['general', 'General library'],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    onClick={() => setKnowledgePane(id)}
                    className={`rounded-xl px-3 py-1.5 text-sm font-medium ${
                      knowledgePane === id
                        ? 'bg-violet-100 text-violet-800'
                        : 'border border-slate-200 text-slate-600 hover:bg-slate-50'
                    }`}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            {knowledgePane === 'project' ? (
              <>
                <label className="mt-4 block text-sm font-medium text-slate-700">
                  View project source
                  <select
                    value={selectedProjectSource}
                    onChange={(e) => {
                      setSelectedProjectSource(e.target.value);
                      setSelectedProjectEntryId(null);
                    }}
                    className="mt-1 w-full rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
                  >
                    {projectSourceOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
                <div className="mt-4 grid gap-4 lg:grid-cols-2">
                  <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                    {filteredProjectEntries.length === 0 ? (
                      <p className="text-sm text-slate-500">No project documents indexed yet.</p>
                    ) : (
                      filteredProjectEntries.map((entry) => (
                        <button
                          key={entry.id}
                          type="button"
                          onClick={() => setSelectedProjectEntryId(entry.id)}
                          className={`w-full rounded-xl border px-3 py-2 text-left ${
                            selectedProjectEntry?.id === entry.id
                              ? 'border-violet-300 bg-violet-50'
                              : 'border-slate-100 bg-white hover:border-slate-200'
                          }`}
                        >
                          <p className="text-sm font-medium text-slate-900">{entry.title || entry.path || entry.id}</p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{entry.content_excerpt || entry.path}</p>
                          {(entry.source_name || entry.source_root) && (
                            <p className="mt-1 text-xs text-slate-500">{entry.source_name || entry.source_root}</p>
                          )}
                        </button>
                      ))
                    )}
                  </div>
                  <ProjectEntryDetail
                    entry={selectedProjectEntry}
                    onLoadFull={loadFullDocument}
                    fullContent={fullDocEntryId === selectedProjectEntry?.id ? fullDocContent : null}
                    fullLoading={fullDocLoading && fullDocEntryId === selectedProjectEntry?.id}
                    fullError={fullDocEntryId === selectedProjectEntry?.id ? fullDocError : ''}
                  />
                </div>
              </>
            ) : (
              <div className="mt-4 grid gap-4 lg:grid-cols-2">
                <div className="max-h-[28rem] space-y-2 overflow-y-auto">
                  {(general?.entries || []).length === 0 ? (
                    <p className="text-sm text-slate-500">No general knowledge entries yet.</p>
                  ) : (
                    (general?.entries || []).map((entry) => (
                      <button
                        key={entry.id}
                        type="button"
                        onClick={() => setSelectedGeneralEntryId(entry.id)}
                        className={`w-full rounded-xl border px-3 py-2 text-left ${
                          selectedGeneralEntry?.id === entry.id
                            ? 'border-violet-300 bg-violet-50'
                            : 'border-slate-100 bg-white hover:border-slate-200'
                        }`}
                      >
                        <p className="text-sm font-medium text-slate-900">{entry.title || entry.id}</p>
                        <p className="mt-1 text-xs text-slate-500">{entry.topic || entry.source}</p>
                      </button>
                    ))
                  )}
                </div>
                <GeneralEntryDetail entry={selectedGeneralEntry} />
              </div>
            )}
          </section>
        </div>
      ) : (
        <div className="grid gap-6 xl:grid-cols-2">
          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Update catalog</h3>
            <p className="mt-1 text-sm text-slate-600">
              {updates?.total ?? 0} packages · {updates?.pullable ?? 0} pull-ready ·{' '}
              {updates?.source_count ?? 0} deploy sources
            </p>
            <label className="mt-4 block text-sm font-medium text-slate-700">
              Project name
              <input
                value={deployProject}
                onChange={(e) => setDeployProject(e.target.value)}
                placeholder="crm"
                list="cd-mini-deploy-projects"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
              <datalist id="cd-mini-deploy-projects">
                {(updates?.projects || []).map((name) => (
                  <option key={name} value={name} />
                ))}
              </datalist>
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Deploy folder
              <input
                value={deployPath}
                onChange={(e) => setDeployPath(e.target.value)}
                placeholder="E:\CRM\deploy"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            <label className="mt-3 block text-sm font-medium text-slate-700">
              Changelog file (optional)
              <input
                value={changelogPath}
                onChange={(e) => setChangelogPath(e.target.value)}
                placeholder="Auto-detects ..\changelog.json"
                className="mt-1 w-full rounded-xl border border-slate-200 px-3 py-2 text-sm outline-none focus:border-violet-500 focus:ring-2 focus:ring-violet-500/20"
              />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button
                type="button"
                disabled={busy}
                onClick={() => runAction(pickDeployFolder)}
                className="inline-flex items-center gap-2 rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                <FolderOpen className="h-4 w-4" />
                Choose folder
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    let path = deployPath.trim();
                    if (!path) {
                      await pickDeployFolder();
                      path = deployPath.trim();
                    }
                    if (!path) return;
                    const result = await libraryPost<{
                      already_configured?: boolean;
                      source?: { project?: string; deploy_path?: string };
                      sync?: { imported?: number; updated?: number };
                    }>('updates/sources/add', {
                      project: deployProject.trim(),
                      deploy_path: path,
                      changelog_path: changelogPath.trim(),
                    });
                    const sync = result.sync || {};
                    const resolvedPath = result.source?.deploy_path || path;
                    const resolvedProject = result.source?.project || deployProject.trim() || 'project';
                    setDeployPath('');
                    setChangelogPath('');
                    setStatus(
                      result.already_configured
                        ? `Deploy source already configured (${resolvedProject} → ${resolvedPath}) — refreshed ${sync.imported ?? 0} new / ${sync.updated ?? 0} updated package(s).`
                        : `Deploy source added (${resolvedProject} → ${resolvedPath}) — ${sync.imported ?? 0} new / ${sync.updated ?? 0} updated package(s).`
                    );
                  })
                }
                className="rounded-xl bg-violet-700 px-4 py-2 text-sm font-semibold text-white hover:bg-violet-800 disabled:opacity-60"
              >
                Add deploy source
              </button>
              <button
                type="button"
                disabled={busy}
                onClick={() =>
                  runAction(async () => {
                    const result = await libraryPost<{ imported?: number; updated?: number }>('updates/sync');
                    setStatus(`Synced ${result.imported ?? 0} new / ${result.updated ?? 0} updated package(s).`);
                  })
                }
                className="rounded-xl border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
              >
                Sync folders
              </button>
            </div>
            <div className="mt-4 space-y-2">
              {(updates?.sources || []).length === 0 ? (
                <p className="text-sm text-slate-500">No deploy folders configured.</p>
              ) : (
                (updates?.sources || []).map((source) => (
                  <div
                    key={source.deploy_path}
                    className="rounded-xl border border-slate-100 bg-slate-50 px-3 py-2 text-xs text-slate-700"
                  >
                    <p className="font-semibold text-slate-900">{source.project}</p>
                    <p>{source.deploy_path}</p>
                    {source.changelog_path && <p className="text-slate-500">changelog: {source.changelog_path}</p>}
                  </div>
                ))
              )}
            </div>
          </section>

          <section className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm">
            <h3 className="text-lg font-semibold text-slate-900">Catalogued updates</h3>
            <div className="mt-4 max-h-[32rem] space-y-2 overflow-y-auto">
              {(updates?.entries || []).length === 0 ? (
                <p className="text-sm text-slate-500">No updates catalogued yet. Add a deploy folder to scan packages.</p>
              ) : (
                (updates?.entries || []).map((entry) => (
                  <div key={entry.id} className="rounded-xl border border-slate-100 px-3 py-3">
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <p className="text-sm font-semibold text-slate-900">{entry.title || entry.id}</p>
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase ${statusTone(entry.status || 'draft')}`}>
                        {entry.status || 'draft'}
                      </span>
                    </div>
                    <p className="mt-1 text-xs text-slate-600">
                      {entry.project}
                      {entry.version ? ` · v${entry.version}` : ''}
                      {entry.release_date ? ` · ${entry.release_date}` : ''}
                      {entry.pull_ready ? ' · pull-ready' : ''}
                    </p>
                  </div>
                ))
              )}
            </div>
          </section>
        </div>
      )}
    </div>
  );
}
