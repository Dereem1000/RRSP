import fs from 'fs';
import path from 'path';

export type DemoEntry = {
  id?: string;
  name?: string;
  slug: string;
  local_url?: string;
  public_url?: string;
  demo_port?: number;
  client_port?: number;
  server_port?: number;
  working_dir?: string;
};

export type DemoManifest = {
  generated_by?: string;
  base_domain?: string;
  url_path_prefix?: string;
  demos: DemoEntry[];
};

export const LEGACY_SLUG_REDIRECTS: Record<string, string> = {
  'lawfirm-deployment-20260416-004524-demo': 'lawfirm',
};

const MANAGER_PORT = Number(process.env.MULTISERVER_MANAGER_PORT || 5674);

function publicDir() {
  return path.join(process.cwd(), 'public');
}

export function loadManifestFromFile(): DemoManifest | null {
  const manifestPath = path.join(publicDir(), 'demos-manifest.json');
  if (!fs.existsSync(manifestPath)) return null;
  try {
    return JSON.parse(fs.readFileSync(manifestPath, 'utf8')) as DemoManifest;
  } catch {
    return null;
  }
}

export async function fetchManifestFromManager(): Promise<DemoManifest | null> {
  try {
    const res = await fetch(`http://127.0.0.1:${MANAGER_PORT}/demos-manifest.json`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(2000),
    });
    if (!res.ok) return null;
    return (await res.json()) as DemoManifest;
  } catch {
    return null;
  }
}

export async function getDemoManifest(): Promise<DemoManifest | null> {
  return (await fetchManifestFromManager()) ?? loadManifestFromFile();
}

export function findDemo(manifest: DemoManifest, slug: string): DemoEntry | null {
  const resolved = LEGACY_SLUG_REDIRECTS[slug] ?? slug;
  return manifest.demos.find((d) => d.slug === resolved) ?? null;
}

export function demoUiPrefix(manifest: DemoManifest, slug: string): string {
  const prefix = (manifest.url_path_prefix || '/demo').replace(/\/$/, '');
  return `${prefix}/${slug}`;
}
