/**
 * One-time bulk update: standard service level → per-job.
 * Run: node scripts/migrate-standard-to-per-job.mjs
 * Dry run: node scripts/migrate-standard-to-per-job.mjs --dry-run
 */
import { getSequelize } from '../packages/database/dist/connection.js';
import { Client } from '../packages/database/dist/index.js';

const SERVICE_PLANS = {
  'per-job': {
    name: 'Per-Job Rate',
    price: null,
    limits: { onsiteVisitsLimit: 0, supportTicketsLimit: 0, endpointsLimit: 0, supportHoursLimit: 0 },
    sla: { responseTime: 'Next business day', resolutionTime: 'As quoted', uptime: 'N/A', supportHours: 'On request' },
  },
};

function buildUsageLimitsFromLevel(current) {
  const limits = SERVICE_PLANS['per-job'].limits;
  return {
    onsiteVisitsUsed: Number(current?.onsiteVisitsUsed ?? 0),
    supportTicketsUsed: Number(current?.supportTicketsUsed ?? 0),
    endpointsUsed: Number(current?.endpointsUsed ?? 0),
    supportHoursUsed: Number(current?.supportHoursUsed ?? 0),
    lastResetDate: current?.lastResetDate ?? null,
    ...limits,
  };
}

const dryRun = process.argv.includes('--dry-run');

const sequelize = getSequelize();
await sequelize.authenticate();

const clients = await Client.findAll({
  where: { serviceLevel: 'standard' },
});

console.log(`Found ${clients.length} client(s) on standard${dryRun ? ' (dry run)' : ''}.`);

for (const client of clients) {
  const label = client.companyName || client.name || client.id;
  const usageTracking = buildUsageLimitsFromLevel(client.usageTracking);
  const slaAgreement = SERVICE_PLANS['per-job'].sla;
  const servicePlanData = {
    ...(client.servicePlanData && typeof client.servicePlanData === 'object' ? client.servicePlanData : {}),
    planName: SERVICE_PLANS['per-job'].name,
  };

  console.log(`  → ${label}`);

  if (!dryRun) {
    await client.update({
      serviceLevel: 'per-job',
      monthlyRate: 0,
      usageTracking,
      slaAgreement,
      servicePlanData,
    });
  }
}

await sequelize.close();
console.log(dryRun ? 'Dry run complete — no changes written.' : `Updated ${clients.length} client(s) to per-job.`);
