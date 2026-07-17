import { Router, type Request, type Response } from 'express';
import { dispatchSecurity } from '@cd-v2/api-handlers';
import { applyApiResult, buildApiContext, runDispatcher } from '../adapters/handlers';

const router = Router();

router.all('*', async (req: Request, res: Response) => {
  try {
    const result = await runDispatcher(req, dispatchSecurity);
    applyApiResult(res, result);
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Internal server error';
    console.error(`[api] ${req.method} ${req.originalUrl}:`, error);
    res.status(500).json({ success: false, message, error: message });
  }
});

export default router;
