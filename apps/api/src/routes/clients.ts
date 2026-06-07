import { Router, Response } from 'express';
import { Client } from '@cd-v2/database';
import { AuthRequest, authenticateJWT, requireRole } from '../middleware/auth';

const router = Router();

router.use(authenticateJWT);

router.get('/', requireRole('admin', 'technician'), async (_req: AuthRequest, res: Response) => {
  const clients = await Client.findAll({
    order: [['created_at', 'DESC']],
  });
  res.json({ success: true, clients });
});

router.get('/:id', requireRole('admin', 'technician', 'client'), async (req: AuthRequest, res: Response) => {
  const id = String(req.params.id);
  const client = await Client.findByPk(id);
  if (!client) {
    res.status(404).json({ success: false, message: 'Client not found' });
    return;
  }
  res.json({ success: true, client });
});

export default router;
