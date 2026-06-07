import { Op } from 'sequelize';
import { Client, Ticket as TicketModel, User } from '@/lib/db';
import { OPEN_STATUSES, RESOLVED_STATUSES, IN_PROGRESS_STATUSES } from '@/lib/ticket-constants';
import { requirePortalUser } from '@/lib/session';
import { getTicketNotificationSettings } from '@/lib/settings';
import { getTicketScopeWhere, serializeTicket } from '@/lib/tickets';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { StatCard } from '@/components/dashboard/StatCard';
import { TicketsPageClient } from '@/components/tickets/TicketsPageClient';
import { Ticket, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default async function TicketsPage() {
  const { user } = await requirePortalUser();
  const { where, denied } = await getTicketScopeWhere(user);
  const isStaff = user.role === 'admin' || user.role === 'technician';
  const listWhere = { ...where };
  if (isStaff) {
    delete listWhere.isActive;
  }

  const ticketSettings = user.role === 'client' ? await getTicketNotificationSettings() : null;

  const [tickets, total, open, resolved, inProgress, clients, technicians] = denied
    ? [[], 0, 0, 0, 0, [], []]
    : await Promise.all([
        TicketModel.findAll({
          where: listWhere,
          order: [['lastUpdated', 'DESC']],
          limit: 300,
        }),
        TicketModel.count({ where }),
        TicketModel.count({ where: { ...where, status: { [Op.in]: OPEN_STATUSES } } }),
        TicketModel.count({ where: { ...where, status: { [Op.in]: RESOLVED_STATUSES } } }),
        TicketModel.count({ where: { ...where, status: { [Op.in]: IN_PROGRESS_STATUSES } } }),
        user.role !== 'client'
          ? Client.findAll({
              where: { isActive: true },
              attributes: [...CLIENT_PICKER_ATTRIBUTES],
              order: [['name', 'ASC']],
            })
          : Promise.resolve([]),
        user.role !== 'client'
          ? User.findAll({
              where: { isActive: true, role: { [Op.in]: ['admin', 'technician'] } },
              attributes: ['id', 'username', 'firstName', 'lastName'],
              order: [['firstName', 'ASC']],
            })
          : Promise.resolve([]),
      ]);

  const heading = user.role === 'client' ? 'My tickets' : 'Tickets';
  const description =
    user.role === 'client'
      ? 'Track your support requests'
      : 'Create, assign, and manage service tickets';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900">{heading}</h1>
        <p className="mt-1 text-sm text-slate-500">{description}</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <StatCard label="Total" value={total} icon={Ticket} accent="bg-violet-50 text-violet-600" />
        <StatCard label="Open" value={open} icon={AlertCircle} accent="bg-amber-50 text-amber-600" />
        <StatCard label="In progress" value={inProgress} icon={Clock} accent="bg-sky-50 text-sky-600" />
        <StatCard label="Resolved" value={resolved} icon={CheckCircle2} accent="bg-emerald-50 text-emerald-600" />
      </div>

      <TicketsPageClient
        tickets={tickets.map((t) => serializeTicket(t) as import('@/components/tickets/TicketsPageClient').TicketRow)}
        userRole={user.role}
        clients={clients.map((c) => mapClientToPickerOption(c))}
        technicians={technicians.map((t) => ({
          id: t.id,
          firstName: t.firstName,
          lastName: t.lastName,
          username: t.username,
        }))}
        clientCanCreate={ticketSettings?.clientCanCreateTickets ?? false}
      />
    </div>
  );
}
