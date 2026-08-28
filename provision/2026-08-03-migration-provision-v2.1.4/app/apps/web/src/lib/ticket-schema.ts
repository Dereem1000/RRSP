import { QueryTypes } from 'sequelize';
import { getOperationalSequelize, getRrspContext, ensureRrspDatabase } from '@/lib/rrsp-db';

let linkedOrderColumnReady = false;

export async function ensureCommentLinkedOrderColumn() {
  const rrsp = getRrspContext();
  if (rrsp) {
    await ensureRrspDatabase(rrsp.mspClientId);
    return;
  }
  if (linkedOrderColumnReady) return;
  const sequelize = getOperationalSequelize();
  const cols = await sequelize.query<{ name: string }>(`PRAGMA table_info(ticket_comments)`, {
    type: QueryTypes.SELECT,
  });
  if (!cols.some((c) => c.name === 'linkedOrderId')) {
    await sequelize.query(`ALTER TABLE ticket_comments ADD COLUMN linkedOrderId TEXT`);
  }
  linkedOrderColumnReady = true;
}
