#!/usr/bin/env node
/**
 * Register showcase location for the live portal (login "Go to demo" auto-detect).
 * Called from start-showcase.bat. Writes data/showcase-dock.json locally and,
 * when the main v2 folder is a sibling, mirrors it there too.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const showcaseRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const port = Number(process.env.SHOWCASE_PORT || 3001);

function derivePublicUrl() {
  const explicit = process.env.NEXT_PUBLIC_DEMO_PORTAL_URL?.trim();
  if (explicit) return explicit.replace(/\/$/, '');

  const site = process.env.NEXT_PUBLIC_SITE_URL?.trim();
  if (site) {
    try {
      const url = new URL(site);
      const host = url.hostname.replace(/^www\./, '');
      if (host === 'localhost' || host === '127.0.0.1') {
        return `http://127.0.0.1:${port}`;
      }
      return `${url.protocol}//demo.${host}`;
    } catch {
      /* fall through */
    }
  }

  return 'https://demo.computerdynamicstt.com';
}

function writeDock(targetRoot) {
  const dataDir = path.join(targetRoot, 'data');
  fs.mkdirSync(dataDir, { recursive: true });
  const payload = {
    port,
    localUrl: `http://127.0.0.1:${port}`,
    publicUrl: derivePublicUrl(),
    installPath: showcaseRoot,
    updatedAt: new Date().toISOString(),
  };
  fs.writeFileSync(path.join(dataDir, 'showcase-dock.json'), JSON.stringify(payload, null, 2), 'utf8');
  return payload;
}

const local = writeDock(showcaseRoot);

const siblingProduction = path.resolve(showcaseRoot, '..', 'Computer Dynamics System v2');
if (
  siblingProduction !== showcaseRoot &&
  fs.existsSync(path.join(siblingProduction, 'package.json'))
) {
  writeDock(siblingProduction);
  console.log('Registered showcase dock for live portal:', siblingProduction);
}

console.log('Showcase dock registered:', local.localUrl, '->', local.publicUrl);
