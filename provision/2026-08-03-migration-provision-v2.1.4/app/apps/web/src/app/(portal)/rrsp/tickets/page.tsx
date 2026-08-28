import { Op } from 'sequelize';
import { requirePortalUser } from '@/lib/session';
import { requireRrspModule } from '@/lib/rrsp-access';
import { withOptionalRrspDb } from '@/lib/rrsp-page';
import { getTicketNotificationSettings } from '@/lib/settings';
import { getTicketScopeWhere, serializeTicket, getTicketModel, getShopClientModel } from '@/lib/tickets';
import { CLIENT_PICKER_ATTRIBUTES, mapClientToPickerOption } from '@/lib/client-picker';
import { OPEN_STATUSES, RESOLVED_STATUSES, IN_PROGRESS_STATUSES } from '@/lib/ticket-constants';
import { StatCard } from '@/components/dashboard/StatCard';
import { TicketsPageClient } from '@/components/tickets/TicketsPageClient';
import { Ticket, AlertCircle, CheckCircle2, Clock } from 'lucide-react';

export default async function RrspTicketsPage() {
  const { user } = await requirePortalUser();
  const gate = await requireRrspModule(user, 'tickets');

  return withOptionalRrspDb(gate, async () => {
    const { where, denied } = await getTicketScopeWhere(user);
    const TicketModel = getTicketModel();
    const ShopClient = getShopClientModel();
    const ticketSettings = await getTicketNotificationSettings();

    const [tickets, total, open, resolved, inProgress, clients] = denied
      ? [[], 0, 0, 0, 0, []]
      : await Promise.all([
          TicketModel.findAll({
            where,
            order: [['lastUpdated', 'DESC']],
            limit: 300,
          }),
          TicketModel.count({ where }),
          TicketModel.count({ where: { ...where, status: { [Op.in]: OPEN_STATUSES } } }),
          TicketModel.count({ where: { ...where, status: { [Op.in]: RESOLVED_STATUSES } } }),
          TicketModel.count({ where: { ...where, status: { [Op.in]: IN_PROGRESS_STATUSES } } }),
          ShopClient.findAll({
            where: { isActive: true },
            attributes: [...CLIENT_PICKER_ATTRIBUTES],
            order: [['name', 'ASC']],
          }),
        ]);

    return (
      <div className="space-y-6">
        <div>
          <h1 className="text-2xl font-bold tracking-tight text-slate-900">Shop tickets</h1>
          <p className="mt-1 text-sm text-slate-500">Repair tickets for your shop customers</p>
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
          clients={clients.map((c) => mapClientToPickerOption(c as never))}
          technicians={[]}
          clientCanCreate={ticketSettings?.clientCanCreateTickets ?? true}
          shopOperator
        />
      </div>
    );
  });
}
