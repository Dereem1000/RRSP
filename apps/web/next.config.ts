import path from 'path';
import dotenv from 'dotenv';
import type { NextConfig } from 'next';

const monorepoRoot = path.join(__dirname, '../..');
dotenv.config({ path: path.join(monorepoRoot, '.env') });

process.env.CD_V2_ROOT = monorepoRoot;

const nextConfig: NextConfig = {
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
  allowedDevOrigins: ['192.168.131.12', 'localhost'],
};

export default nextConfig;
