import type { WhereOptions } from 'sequelize';
import { Op } from 'sequelize';

/** Use DB column names — global Sequelize config uses underscored + created_at. */
export const ORDER_BY_CREATED_DESC: [string, string][] = [['created_at', 'DESC']];

export function whereCreatedSince(since: Date): WhereOptions {
  return { created_at: { [Op.gte]: since } };
}

export function eventCreatedAt(row: { created_at?: Date; get?: (k: string) => unknown }): string {
  const raw = row.created_at ?? row.get?.('created_at');
  return raw ? String(raw) : '';
}
