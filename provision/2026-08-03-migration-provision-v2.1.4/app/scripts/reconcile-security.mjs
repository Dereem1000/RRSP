import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
dotenv.config({ path: path.join(root, '.env') });
process.env.CD_V2_ROOT = root;

await import('@cd-v2/database');
const { reconcileSecurityEvents } = await import('../packages/security/dist/event-reconcile.js');
const { isEmergencyBypassActive } = await import('../packages/security/dist/emergency.js');

console.log('Emergency bypass active:', await isEmergencyBypassActive());
console.log('Reconcile:', JSON.stringify(await reconcileSecurityEvents(), null, 2));
