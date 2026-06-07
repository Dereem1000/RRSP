import { Router, Response } from 'express';
import { Op } from 'sequelize';
import { Ticket, Client } from '@cd-v2/database';
import { AuthRequest, authenticateJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.get('/stats/summary', requireRole('admin', 'technician'), async (_req, res: Response) => {
  const openStatuses = ['New', 'Open', 'In Progress', 'Pending'];
  const [total, open] = await Promise.all([
    Ticket.count({ where: { isActive: 1 } }),
    Ticket.count({ where: { isActive: 1, status: { [Op.in]: openStatuses } } }),
  ]);
  res.json({ success: true, stats: { total, open } });
});

router.get('/', requireRole('admin', 'technician', 'client'), async (req: AuthRequest, res: Response) => {
  const where: Record<string, unknown> = { isActive: 1 };

  if (req.user?.role === 'client') {
    const linkedClient = await Client.findOne({ where: { userId: req.user.id } });
    if (!linkedClient) {
      res.json({ success: true, tickets: [] });
      return;
    }
    where.clientId = linkedClient.id;
  }

  const tickets = await Ticket.findAll({
    where,
    order: [['lastUpdated', 'DESC']],
    limit: 200,
  });

  res.json({ success: true, tickets });
});

router.get('/:id', requireRole('admin', 'technician', 'client'), async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const ticket = await Ticket.findByPk(id);
  if (!ticket) {
    res.status(404).json({ success: false, message: 'Ticket not found' });
    return;
  }

  if (req.user?.role === 'client') {
    const linkedClient = await Client.findOne({ where: { userId: req.user.id } });
    if (!linkedClient || ticket.clientId !== linkedClient.id) {
      res.status(403).json({ success: false, message: 'Access denied' });
      return;
    }
  }

  res.json({ success: true, ticket });
});

export default router;
