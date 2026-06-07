import { getSequelize, getDatabasePath } from '../packages/database/dist/connection.js';
import { QueryTypes, Op } from 'sequelize';
import { Client } from '../packages/database/dist/index.js';

const SERVICE_LEVELS = ['basic', 'standard', 'premium', 'enterprise', 'per-job'];

const sequelize = getSequelize();
console.log('DB path:', getDatabasePath());
await sequelize.authenticate();

const invCount = await sequelize.query('SELECT COUNT(*) AS c FROM invoices', { type: QueryTypes.SELECT });
const quoCount = await sequelize.query('SELECT COUNT(*) AS c FROM quotes', { type: QueryTypes.SELECT });
console.log('Total invoices:', invCount[0]?.c, 'quotes:', quoCount[0]?.c);

const fixedInv = await sequelize.query(
  `SELECT i.id, i.invoice_number, COALESCE(c.company_name, c.name) AS clientName
   FROM invoices i LEFT JOIN clients c ON c.id = i.client_id LIMIT 3`,
  { type: QueryTypes.SELECT }
);
console.log('Fixed invoice join sample:', fixedInv);

const fixedQuo = await sequelize.query(
  `SELECT q.id, q.quote_number, COALESCE(c.company_name, c.name) AS clientName
   FROM quotes q LEFT JOIN clients c ON c.id = q.client_id LIMIT 3`,
  { type: QueryTypes.SELECT }
);
console.log('Fixed quote join sample:', fixedQuo);

const mspClients = await Client.findAll({
  where: { serviceLevel: { [Op.in]: SERVICE_LEVELS } },
  attributes: ['id'],
});
const mspIds = mspClients.map((c) => c.id);
console.log('MSP client count:', mspIds.length);

if (mspIds.length) {
  const mspInv = await sequelize.query(
    `SELECT COUNT(*) AS c FROM invoices i WHERE i.client_id IN (:clientIds)`,
    { type: QueryTypes.SELECT, replacements: { clientIds: mspIds } }
  );
  console.log('Invoices for MSP clients:', mspInv[0]?.c);
}

const orphanInv = await sequelize.query(
  `SELECT COUNT(*) AS c FROM invoices i
   LEFT JOIN clients c ON c.id = i.client_id
   WHERE c.service_level IS NULL OR c.service_level NOT IN ('basic','standard','premium','enterprise','per-job')`,
  { type: QueryTypes.SELECT }
);
console.log('Invoices for non-MSP/null clients:', orphanInv[0]?.c);

await sequelize.close();
