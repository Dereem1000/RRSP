import { QueryTypes } from 'sequelize';
import { getSequelize } from '@cd-v2/database';

let linkedOrderColumnReady = false;

export async function ensureCommentLinkedOrderColumn() {
  if (linkedOrderColumnReady) return;
  const sequelize = getSequelize();
  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(ticket_comments)`, {
    type: QueryTypes.SELECT,
  });
  if (!cols.some((c) => c.name === 'linkedOrderId')) {
    await sequelize.query(`ALTER TABLE ticket_comments ADD COLUMN linkedOrderId TEXT`);
  }
  linkedOrderColumnReady = true;
}
