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

import { Op } from 'sequelize';
import { Client, Ticket, User } from '@web/lib/db';


function searchParamsFrom(ctx: ApiContext): URLSearchParams {
  const params = new URLSearchParams();
  for (const [key, value] of Object.entries(ctx.query)) {
    if (value === undefined) continue;
    if (Array.isArray(value)) value.forEach((v) => params.append(key, v));
    else params.set(key, value);
  }
  return params;
}


export async function GETHandler(ctx: ApiContext): Promise<ApiResult> {
  try {
    const { identifier: raw } = ctx.params;
    const identifier = decodeURIComponent(raw).trim();

    if (!identifier) {
      return { status: 400, body: { success: false, message: 'Ticket number or email is required' } };
    }

    const isEmail = identifier.includes('@') && identifier.includes('.');
    let ticket;

    if (isEmail) {
      const client = await Client.findOne({
        where: {
          email: identifier,
          status: { [Op.ne]: 'inactive' },
        },
      });

      if (!client) {
        return { status: 404, body: {
            success: false,
            message: 'No tickets found for this email address. Please check your email or contact support.',
          } };
      }

      ticket = await Ticket.findOne({
        where: { clientId: client.id, isActive: 1 },
        include: [
          { model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'phone', 'email'] },
          { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'username'] },
          { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'username'] },
        ],
        order: [['dateCreated', 'DESC']],
      });
    } else {
      ticket = await Ticket.findOne({
        where: { ticketNumber: identifier, isActive: 1 },
        include: [
          { model: Client, as: 'client', attributes: ['id', 'name', 'companyName', 'phone', 'email'] },
          { model: User, as: 'assignee', attributes: ['id', 'firstName', 'lastName', 'username'] },
          { model: User, as: 'creator', attributes: ['id', 'firstName', 'lastName', 'username'] },
        ],
      });
    }

    if (!ticket) {
      return { status: 404, body: {
          success: false,
          message: isEmail
            ? 'No active tickets found for this email address. Please check your email or contact support.'
            : 'Ticket not found. Please check your ticket number.',
        } };
    }

    const issue = ticket.issue ?? '';
    const description = issue.length > 200 ? `${issue.substring(0, 200)}...` : issue;
    const client = ticket.get('Client') as Client | undefined;

    return { status: 200, body: {
      success: true,
      ticket: {
        ticketNumber: ticket.ticketNumber,
        title: issue,
        description,
        status: ticket.status,
        priority: ticket.priority ?? 'medium',
        dateCreated: ticket.dateCreated,
        lastUpdated: ticket.lastUpdated,
        client: client
          ? {
              name: client.name || client.companyName,
              phone: client.phone,
              email: client.email,
            }
          : undefined,
      },
    } };
  } catch {
    return { status: 500, body: { success: false, message: 'Failed to fetch ticket status' } };
  }
}

export async function dispatch(ctx: ApiContext): Promise<ApiResult> {
  const method = ctx.method.toUpperCase();
  try {
    if (method === 'GET') return GETHandler(ctx);
    return { status: 405, body: { success: false, message: 'Method not allowed' } };
  } catch (error) {
    return authErrorResult(error);
  }
}

