import path from 'path';
import dotenv from 'dotenv';

const root = path.resolve(__dirname, '../../..');
dotenv.config({ path: path.join(root, '.env') });
process.env.CD_V2_ROOT = process.env.CD_V2_ROOT ?? root;

import { startSecurityWorker } from './worker';

const runOnce = process.argv.includes('--once');
const intervalArg = process.argv.find((a) => a.startsWith('--interval='));
const intervalMs = intervalArg ? Number(intervalArg.split('=')[1]) : undefined;

startSecurityWorker({ runOnce, intervalMs }).catch((err) => {
  console.error('[cd-security] Fatal:', err);
  process.exit(1);
});
