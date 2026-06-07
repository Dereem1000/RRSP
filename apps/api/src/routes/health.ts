import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { User, Client, Ticket, testConnection, getDatabasePath } from '@cd-v2/database';
import { AuthRequest, authenticateJWT, requireRole } from '../middleware/auth';

const router = Router();

router.get('/health', async (_req, res: Response) => {
  try {
    await testConnection();
    res.json({
      success: true,
      status: 'ok',
      version: '2.0.0',
      database: getDatabasePath(),
    });
  } catch (error) {
    res.status(503).json({
      success: false,
      status: 'degraded',
      error: error instanceof Error ? error.message : 'Unknown error',
    });
  }
});

router.get('/dashboard', authenticateJWT, requireRole('admin', 'technician'), async (_req, res: Response) => {
  const openStatuses = ['New', 'Open', 'In Progress', 'Pending'];
  const [users, clients, tickets, openTickets] = await Promise.all([
    User.count({ where: { isActive: true } }),
    Client.count({ where: { isActive: true } }),
    Ticket.count({ where: { isActive: 1 } }),
    Ticket.count({ where: { isActive: 1, status: { [Op.in]: openStatuses } } }),
  ]);

  res.json({
    success: true,
    stats: {
      activeUsers: users,
      activeClients: clients,
      totalTickets: tickets,
      openTickets,
    },
  });
});

export default router;
