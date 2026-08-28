#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileExists, readText } from '../lib/utils.mjs';

const SENSITIVE_PATTERNS = [
  { pattern: /supersecretkey/i, label: 'default JWT secret string' },
  { pattern: /password\s*=\s*['"][^'"]{1,8}['"]/i, label: 'short hardcoded password' },
  { pattern: /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9_-]{8,}['"]/i, label: 'hardcoded API key pattern' },
];

/** Paths that legitimately reference weak-secret blocklists (not real credentials). */
const HARDCODED_SCAN_SKIP = [
  /[\\/]env-secrets\.ts$/i,
  /[\\/]production-preflight\.mjs$/i,
  /[\\/]security-audit[\\/]/i,
];

const WORLD_READABLE_EXTENSIONS = ['.env', '.pem', '.key', '.p12'];

export async function runFilesystemChecks(ctx) {
  const checkId = 'filesystem';
  const { root } = ctx;
  let issues = 0;

  const scanDirs = [
    path.join(root, 'apps', 'web', 'src'),
    path.join(root, 'packages', 'security', 'src'),
    path.join(root, 'scripts'),
  ];

  const hits = [];
  for (const dir of scanDirs) {
    if (!fs.existsSync(dir)) continue;
    walk(dir, (filePath) => {
      if (!/\.(ts|tsx|js|mjs|py)$/.test(filePath)) return;
      const rel = path.relative(root, filePath);
      if (rel.includes('node_modules') || rel.includes('.next')) return;
      if (HARDCODED_SCAN_SKIP.some((re) => re.test(rel))) return;
      const text = fs.readFileSync(filePath, 'utf8');
      for (const { pattern, label } of SENSITIVE_PATTERNS) {
        if (pattern.test(text) && !rel.includes('.example')) {
          hits.push({ file: rel, label });
        }
      }
    });
  }

  if (hits.length > 0) {
    const unique = [...new Map(hits.map((h) => [`${h.file}:${h.label}`, h])).values()].slice(0, 10);
    ctx.finding({
      severity: 'medium',
      category: 'filesystem',
      title: 'Possible hardcoded secrets in source',
      description: `Found ${unique.length} file(s) matching sensitive string patterns (review manually).`,
      remediation: 'Move secrets to .env or system_configs; never commit real credentials in source.',
      evidence: unique,
      checkId: `${checkId}-hardcoded`,
    });
    issues += 1;
  }

  const blockedIpsPath = path.join(root, 'data', 'security_blocked_ips.json');
  if (fs.existsSync(blockedIpsPath)) {
    try {
      const blocked = JSON.parse(fs.readFileSync(blockedIpsPath, 'utf8'));
      if (!Array.isArray(blocked)) {
        ctx.finding({
          severity: 'low',
          category: 'filesystem',
          title: 'Invalid security_blocked_ips.json format',
          description: 'Expected an array of blocked IP entries.',
          remediation: 'Repair or delete data/security_blocked_ips.json; middleware will recreate as needed.',
          checkId: `${checkId}-blocked-ips-format`,
        });
        issues += 1;
      }
    } catch {
      ctx.finding({
        severity: 'medium',
        category: 'filesystem',
        title: 'Corrupt security_blocked_ips.json',
        description: 'Could not parse data/security_blocked_ips.json.',
        remediation: 'Fix JSON syntax or remove file to reset IP block mirror.',
        checkId: `${checkId}-blocked-ips-parse`,
      });
      issues += 1;
    }
  }

  for (const rel of ['.env', 'data/mini-dock.json', 'cloudflared-computerdynamics.yml']) {
    const abs = path.join(root, rel);
    if (!fs.existsSync(abs)) continue;
    // Windows reports stub Unix modes — icacls is the real control; skip false positives.
    if (process.platform === 'win32') continue;
    try {
      const mode = fs.statSync(abs).mode;
      const worldReadable = (mode & 0o004) !== 0;
      if (worldReadable && WORLD_READABLE_EXTENSIONS.some((ext) => rel.endsWith(ext) || rel === '.env')) {
        ctx.finding({
          severity: 'low',
          category: 'filesystem',
          title: `World-readable sensitive file: ${rel}`,
          description: `${rel} has other-user read permission on this host.`,
          remediation: 'Restrict file permissions (e.g. chmod 600 on Unix; ACL on Windows).',
          checkId: `${checkId}-perms-${rel.replace(/[/\\]/g, '-')}`,
        });
        issues += 1;
      }
    } catch {
      /* Windows may not expose mode the same way */
    }
  }

  const nextBuild = path.join(root, 'apps', 'web', '.next');
  if (!fs.existsSync(nextBuild)) {
    ctx.finding({
      severity: 'info',
      category: 'filesystem',
      title: 'Production build not present',
      description: 'apps/web/.next not found — audit ran against source, not a built production artifact.',
      remediation: 'Run npm run build before production deploy; re-run audit after build.',
      checkId: `${checkId}-no-build`,
    });
    issues += 1;
  }

  const readme = readText(root, 'README.md') ?? '';
  if (/JWT_SECRET=supersecretkey/.test(readme)) {
    ctx.finding({
      severity: 'info',
      category: 'filesystem',
      title: 'README documents dev JWT default',
      description: 'README.md shows JWT_SECRET=supersecretkey as example — ensure production .env differs.',
      remediation: 'Verify production .env uses a unique secret (audit secrets check covers this).',
      checkId: `${checkId}-readme-jwt`,
    });
  }

  ctx.recordCheck(
    checkId,
    'Filesystem & source hygiene',
    issues === 0 ? 'passed' : 'failed',
    issues === 0 ? 'No filesystem issues' : `${issues} issue(s)`
  );
}

function walk(dir, onFile) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === 'dist' || entry.name === '.next') continue;
      walk(full, onFile);
    } else {
      onFile(full);
    }
  }
}
