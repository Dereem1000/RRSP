// @ts-nocheck
import type { ApiContext, ApiResult } from '@cd-v2/api-handlers';
import {
  requireSession,
  requireRole,
  requireAdmin,
  authErrorResult,
  COOKIE_NAME,
  signToken,
  requireMspApiAuth,
  mspAuthErrorResult,
} from '@cd-v2/api-handlers';

import { parse } from 'csv-parse/sync';
import { Op } from 'sequelize';
import { Client, Ticket } from '@web/lib/db';
import { generateTicketId, generateTicketNumber } from '@web/lib/tickets';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}

async function getFormDataFromCtx(ctx: ApiContext): Promise<FormData> {
  if (ctx.formData) return ctx.formData;
  throw new Error('Multipart form data not available');
}


export async function POSTHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const session = requireSession(ctx);
    requireRole(session, 'admin');

    const form = await getFormDataFromCtx(ctx);
    const file = form.get('csvFile');
    if (!(file instanceof File)) {
      return { status: 400, body: { success: false, message: 'No CSV file uploaded' } };
    }

    let text = await file.text();
    if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);

    const rows = parse(text, {
      columns: (headers: string[]) => headers.map(normalizeHeader),
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
    }) as Record<string, string>[];

    const results: string[] = [];
    const errors: Array<{ row: number; message: string }> = [];
    let processed = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      const rowNum = i + 2;

      if (pick(row, 'date created', 'date').toLowerCase() === 'total') continue;

      const customer = pick(row, 'customer', 'client', 'client name');
      const issue = pick(row, 'issue', 'title', 'description', 'problem');
      if (!customer && !issue) continue;

      try {
        let clientId: string | null = null;
        let clientName = customer || 'Unknown client';

        if (customer) {
          const client = await Client.findOne({
            where: {
              [Op.or]: [
                { name: customer },
                { companyName: customer },
                { contactPerson: customer },
                { email: customer },
              ],
            },
          });

          if (client) {
            clientId = client.id;
            clientName = client.name;
          } else {
            const created = await Client.create({
              name: customer,
              companyName: customer,
              contactPerson: customer,
              email: `${customer.replace(/\s+/g, '.').toLowerCase().slice(0, 80)}@import.local`,
              status: 'active',
              isActive: true,
            });
            clientId = created.id;
            clientName = created.name;
          }
        }

        const dateCreated = pick(row, 'date created', 'date') || new Date().toISOString();
        const dueDate = pick(row, 'due date', 'due') || null;
        const status = pick(row, 'status') || 'New';
        const priority = pick(row, 'priority') || 'medium';
        const location = pick(row, 'location') || 'Not specified';
        const deviceType = pick(row, 'device type', 'device') || 'Other';
        const technician = pick(row, 'technician', 'assigned to') || 'Unassigned';

        const ticketNumber = pick(row, 'ticket number', 'ticket', 'number') || generateTicketNumber();

        await Ticket.create({
          id: generateTicketId(),
          ticketNumber,
          clientId,
          clientName,
          clientContactNumber: pick(row, 'contact', 'phone') || null,
          issue: issue || `Imported ticket for ${clientName}`,
          location,
          deviceType,
          deviceModel: pick(row, 'model', 'device model') || null,
          serialNumber: pick(row, 'serial', 'serial number') || null,
          status,
          technician,
          notes: pick(row, 'notes', 'comments') || null,
          priority,
          category: pick(row, 'category') || 'general',
          dueDate,
          dateCreated: new Date(dateCreated).toISOString(),
          lastUpdated: new Date().toISOString(),
          subscription: pick(row, 'subscription') || null,
          isActive: 1,
          hasUnreadClientComments: false,
          attachments: [],
          tags: ['csv-import'],
        });

        results.push(ticketNumber);
        processed++;
      } catch (err) {
        errors.push({
          row: rowNum,
          message: err instanceof Error ? err.message : 'Import failed',
        });
      }
    }

    return { status: 200, body: {
      success: true,
      message: `Imported ${processed} ticket(s)`,
      processed,
      imported: results,
      errors,
    } };
  } catch (error) {
    return authErrorResult(error);
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'POST') return POSTHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

