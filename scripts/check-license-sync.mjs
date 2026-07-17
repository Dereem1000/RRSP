import sqlite3 from 'sqlite3';
import path from 'path';
import { fileURLToPath } from 'url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const portalDb = path.join(root, 'data', 'computer_dynamics.db');
const licenseDb = path.join(root, 'license_activation_system_new', 'instance', 'license_system.db');

const ACTIVATION = ['pos', 'restaurant', 'document', 'ecommerce', 'auto', 'distribution'];
const FEATURE_TO_KEY = {
  pos: 'pos_systems',
  restaurant: 'restaurant_management',
  document: 'document_management',
  ecommerce: 'ecommerce_websites',
  auto: 'auto_system',
  distribution: 'distribution_system',
};

function openDb(p) {
  return new Promise((resolve, reject) => {
    const db = new sqlite3.Database(p, (err) => (err ? reject(err) : resolve(db)));
  });
}

function all(db, sql, params = []) {
  return new Promise((resolve, reject) => {
    db.all(sql, params, (err, rows) => (err ? reject(err) : resolve(rows || [])));
  });
}

function parsePortalFeatures(raw) {
  if (!raw) return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p.filter((f) => ACTIVATION.includes(f)) : [];
  } catch {
    return [];
  }
}

function licenseFeatures(raw) {
  if (!raw) return {};
  try {
    return JSON.parse(raw);
  } catch {
    return {};
  }
}

function isActive(row) {
  if (!row.is_active) return false;
  if (!row.expiration_date) return true;
  return new Date(row.expiration_date) > new Date();
}

const portal = await openDb(portalDb);
const lic = await openDb(licenseDb);

const clients = await all(
  portal,
  `SELECT id, name, company_name, email, features, service_level, status, is_active FROM clients WHERE features IS NOT NULL`
);
const portalClients = clients
  .map((c) => ({ ...c, activation: parsePortalFeatures(c.features) }))
  .filter((c) => c.activation.length > 0);

const companies = await all(lic, 'SELECT id, company_name, email, msp_client_id FROM company_registration');
const licenses = await all(
  lic,
  'SELECT id, company_id, serial_number, is_active, expiration_date, features FROM license_activation'
);

const byMsp = new Map(companies.filter((c) => c.msp_client_id).map((c) => [c.msp_client_id, c]));
const byEmail = new Map(companies.map((c) => [(c.email || '').toLowerCase(), c]));
const licByCompany = new Map();
for (const l of licenses) {
  if (!licByCompany.has(l.company_id)) licByCompany.set(l.company_id, []);
  licByCompany.get(l.company_id).push(l);
}

console.log('=== LICENSE SYNC CHECK ===\n');
console.log('Portal DB:', portalDb);
console.log('License DB:', licenseDb);
console.log(`Portal clients with activation features: ${portalClients.length}`);
console.log(`License companies: ${companies.length} | license rows: ${licenses.length}\n`);

const synced = [];
const issues = [];

for (const client of portalClients) {
  let company = byMsp.get(client.id);
  const matchedByEmail = !company && client.email;
  if (matchedByEmail) company = byEmail.get(client.email.toLowerCase());
  const name = client.company_name || client.name;

  if (!company) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'NOT SYNCED — no company in license DB',
      portalFeatures: client.activation,
    });
    continue;
  }

  const rows = licByCompany.get(company.id) || [];
  if (rows.length === 0) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'PARTIAL — company exists but no license rows',
      portalFeatures: client.activation,
    });
    continue;
  }

  if (company.msp_client_id !== client.id) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'LINK WARNING — matched by email; msp_client_id mismatch',
      licenseMspId: company.msp_client_id || '(empty)',
    });
  }

  const featureStatus = {};
  for (const feat of client.activation) {
    const key = FEATURE_TO_KEY[feat];
    const matching = rows.filter((r) => licenseFeatures(r.features)[key]);
    const active = matching.find(isActive);
    featureStatus[feat] = matching.length ? (active ? 'active' : 'pending') : 'missing';
  }

  const missing = client.activation.filter((f) => featureStatus[f] === 'missing');
  const pending = client.activation.filter((f) => featureStatus[f] === 'pending');
  const active = client.activation.filter((f) => featureStatus[f] === 'active');

  if (missing.length) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'OUT OF SYNC — portal feature(s) missing license row',
      missing,
      active,
      pending,
    });
  } else if (pending.length === client.activation.length) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'PENDING — in license DB but not activated',
      features: client.activation,
      serials: rows.map((r) => r.serial_number),
    });
  } else if (pending.length) {
    issues.push({
      client: name,
      id: client.id,
      problem: 'PARTIAL — some features active, some pending',
      active,
      pending,
    });
  } else {
    synced.push({
      client: name,
      id: client.id,
      features: active,
      serials: rows.filter(isActive).map((r) => r.serial_number),
    });
  }
}

const portalIds = new Set(portalClients.map((c) => c.id));
const orphans = companies.filter((c) => c.msp_client_id && !portalIds.has(c.msp_client_id));

console.log(`IN SYNC (${synced.length}):`);
for (const s of synced) {
  console.log(`  ✓ ${s.client}`);
  console.log(`    features: ${s.features.join(', ')}`);
  console.log(`    serials: ${s.serials.join(', ') || '(none active)'}`);
}

console.log(`\nISSUES (${issues.length}):`);
for (const i of issues) {
  console.log(`  ✗ ${i.client} — ${i.problem}`);
  if (i.missing?.length) console.log(`    missing: ${i.missing.join(', ')}`);
  if (i.pending?.length) console.log(`    pending: ${i.pending.join(', ')}`);
  if (i.active?.length) console.log(`    active: ${i.active.join(', ')}`);
  if (i.serials?.length) console.log(`    serials: ${i.serials.join(', ')}`);
  if (i.licenseMspId) console.log(`    license msp_client_id: ${i.licenseMspId}`);
}

if (orphans.length) {
  console.log(`\nORPHAN license companies (msp id not in portal activation list): ${orphans.length}`);
  for (const o of orphans.slice(0, 15)) {
    console.log(`  ? ${o.company_name} (${o.msp_client_id})`);
  }
}

let dashboardActive = 0;
let dashboardPending = 0;
let notInLicenseDb = 0;

for (const client of portalClients) {
  const company = byMsp.get(client.id) || (client.email && byEmail.get(client.email.toLowerCase()));
  if (!company) {
    notInLicenseDb++;
    continue;
  }
  const rows = licByCompany.get(company.id) || [];
  const found = new Set();
  for (const r of rows) {
    for (const feat of ACTIVATION) {
      if (licenseFeatures(r.features)[FEATURE_TO_KEY[feat]]) found.add(feat);
    }
  }
  if (found.size === 0) continue;

  const perFeatureActive = [...found].map((feat) => {
    const key = FEATURE_TO_KEY[feat];
    return rows.filter((r) => licenseFeatures(r.features)[key]).some(isActive);
  });
  if (perFeatureActive.every(Boolean)) dashboardActive++;
  else dashboardPending++;
}

console.log('\nDashboard counts (matches msp-dashboard logic on license DB features):');
console.log(`  Active: ${dashboardActive}`);
console.log(`  Pending/Partial: ${dashboardPending}`);
console.log(`  Not in license DB: ${notInLicenseDb}`);

portal.close();
lic.close();

// --- Dashboard simulation (portal activation features, matches msp-dashboard.ts) ---
const ACTIVATION_FEATURES_LIST = ['pos', 'restaurant', 'document', 'ecommerce', 'auto', 'distribution'];

function portalActivationFeatures(raw) {
  if (!raw) return [];
  try {
    const p = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(p) ? p.filter((f) => ACTIVATION_FEATURES_LIST.includes(f)) : [];
  } catch {
    return [];
  }
}

function overallFromPortalAndLicense(required, rows) {
  if (required.length === 0) return 'skip';
  const perFeature = required.map((feat) => {
    const key = FEATURE_TO_KEY[feat];
    const matching = rows.filter((r) => licenseFeatures(r.features)[key]);
    return matching.some(isActive);
  });
  const licensed = required.filter((feat) => {
    const key = FEATURE_TO_KEY[feat];
    return rows.some((r) => licenseFeatures(r.features)[key]);
  });
  if (perFeature.every(Boolean)) return 'Active';
  if (perFeature.some(Boolean)) return 'Partial';
  if (licensed.length > 0) return 'Pending';
  return 'Not synced';
}

const portal2 = await openDb(portalDb);
const activationClients = (await all(
  portal2,
  `SELECT id, name, company_name, email, features, service_level FROM clients WHERE features IS NOT NULL`
)).filter((c) => portalActivationFeatures(c.features).length > 0);

let dashActive = 0;
let dashPending = 0;
let dashWithout = 0;
const dashList = [];

for (const client of activationClients) {
  const required = portalActivationFeatures(client.features);
  let company = byMsp.get(client.id);
  if (!company && client.email) company = byEmail.get(client.email.toLowerCase());
  const rows = company ? licByCompany.get(company.id) || [] : [];
  const overall = overallFromPortalAndLicense(required, rows);
  if (overall === 'skip') continue;
  if (overall === 'Active') dashActive++;
  else if (overall === 'Partial' || overall === 'Pending') dashPending++;
  else dashWithout++;
  dashList.push({ name: client.company_name || client.name, overall, features: required, serviceLevel: client.service_level });
}

console.log('\n=== MSP DASHBOARD VIEW (portal activation features) ===');
console.log(`Clients with activation features: ${activationClients.length}`);
console.log(`  Active: ${dashActive}`);
console.log(`  Pending/Partial: ${dashPending}`);
console.log(`  Not synced: ${dashWithout}`);
for (const d of dashList) {
  console.log(`  ${d.name} → ${d.overall} [${d.features.join(', ')}]${d.serviceLevel ? ` (${d.serviceLevel})` : ''}`);
}

portal2.close();
