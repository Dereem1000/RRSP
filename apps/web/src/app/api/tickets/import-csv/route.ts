import { NextRequest, NextResponse } from 'next/server';
import { parse } from 'csv-parse/sync';
import { Op } from 'sequelize';
import { Client, Ticket } from '@/lib/db';
import { authErrorResponse, requireRole, requireSession } from '@/lib/auth';
import { generateTicketId, generateTicketNumber } from '@/lib/tickets';

function normalizeHeader(header: string) {
  return header.trim().toLowerCase();
}

function pick(row: Record<string, string>, ...keys: string[]) {
  for (const key of keys) {
    const val = row[key];
    if (val?.trim()) return val.trim();
  }
  return '';
}

export async function POST(req: NextRequest) {
  try {
    const session = requireSession(req);
    requireRole(session, 'admin');

    const form = await req.formData();
    const file = form.get('csvFile');
    if (!(file instanceof File)) {
      return NextResponse.json({ success: false, message: 'No CSV file uploaded' }, { status: 400 });
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

    return NextResponse.json({
      success: true,
      message: `Imported ${processed} ticket(s)`,
      processed,
      imported: results,
      errors,
    });
  } catch (error) {
    return authErrorResponse(error);
  }
}
