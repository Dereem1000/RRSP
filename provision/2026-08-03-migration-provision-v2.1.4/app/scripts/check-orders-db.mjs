import { getSequelize, getDatabasePath } from '../packages/database/dist/connection.js';
import { QueryTypes } from 'sequelize';

const sequelize = getSequelize();
console.log('DB:', getDatabasePath());

try {
  const tables = await sequelize.query(
    "SELECT name FROM sqlite_master WHERE type='table' AND name='orders'",
    { type: QueryTypes.SELECT }
  );
  console.log('orders table exists:', tables.length > 0);
  if (tables.length) {
    const count = await sequelize.query('SELECT COUNT(*) AS c FROM orders', { type: QueryTypes.SELECT });
    console.log('order count:', count[0]?.c);
    const sample = await sequelize.query(
      'SELECT id, orderNumber, title, status, clientId FROM orders LIMIT 3',
      { type: QueryTypes.SELECT }
    );
    console.log('sample:', sample);
  }
} catch (e) {
  console.error('error:', e.message);
}

await sequelize.close();
