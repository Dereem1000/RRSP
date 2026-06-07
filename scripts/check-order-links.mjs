import { getSequelize } from '../packages/database/dist/connection.js';
import { QueryTypes } from 'sequelize';

const s = getSequelize();
const t = await s.query(`SELECT name FROM sqlite_master WHERE type='table' AND name='order_links'`, { type: QueryTypes.SELECT });
console.log('order_links exists', t.length > 0);
if (t.length) {
  const c = await s.query('PRAGMA table_info(order_links)', { type: QueryTypes.SELECT });
  console.log(c.map((x) => x.name).join(', '));
}
await s.close();
