import { getSequelize } from '../packages/database/dist/connection.js';
import { QueryTypes } from 'sequelize';

const sequelize = getSequelize();
const cols = await sequelize.query('PRAGMA table_info(orders)', { type: QueryTypes.SELECT });
console.log(cols.map((c) => c.name).join('\n'));
await sequelize.close();
