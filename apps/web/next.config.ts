import path from 'path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');
dotenv.config({ path: path.join(monorepoRoot, '.env') });

if (!process.env.CD_V2_ROOT?.trim()) {
  process.env.CD_V2_ROOT = monorepoRoot;
}
if (process.env.DATABASE_PATH?.trim() && !path.isAbsolute(process.env.DATABASE_PATH)) {
  process.env.DATABASE_PATH = path.resolve(
    process.env.CD_V2_ROOT || monorepoRoot,
    process.env.DATABASE_PATH
  );
}

const nextConfig: NextConfig = {
  // Monorepo root — Turbopack resolves workspace packages from here (same as outputFileTracingRoot).
  turbopack: {
    root: monorepoRoot,
  },
  // /api/* is proxied by apps/web/src/app/api/<domain>/[[...path]]/route.ts (forwards cookies to Express).
  // Demo apps use relative ./ assets; do not strip /demo/<slug>/ trailing slash.
  skipTrailingSlashRedirect: true,
  serverExternalPackages: [
    'sqlite3',
    'sequelize',
    '@cd-v2/database',
    '@cd-v2/backup',
    '@cd-v2/security',
    'archiver',
    'unzipper',
  ],
  outputFileTracingRoot: monorepoRoot,
  allowedDevOrigins: [
    '192.168.131.12',
    'localhost',
    '127.0.0.1',
    'computerdynamicstt.com',
    'www.computerdynamicstt.com',
  ],
};

export default nextConfig;
