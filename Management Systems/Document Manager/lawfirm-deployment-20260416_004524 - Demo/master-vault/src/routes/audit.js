/**
 * Audit Routes
 * Provides access to audit logs
 */

const express = require('express');
const router = express.Router();
const db = require('../db/init');
const auditService = require('../services/auditService');
const authenticateToken = require('../middleware/authenticate');

/**
 * Get audit logs
 * Supports filtering by action, user_id, status, and date range
 */
router.get('/', authenticateToken, async (req, res) => {
  try {
    const filters = {
      action: req.query.action,
      user_id: req.query.user_id ? parseInt(req.query.user_id) : null,
      status: req.query.status,
      start_date: req.query.start_date,
      end_date: req.query.end_date,
      limit: req.query.limit ? Math.min(parseInt(req.query.limit), 1000) : 100,
      offset: req.query.offset ? parseInt(req.query.offset) : 0,
    };

    const logs = await auditService.getLogs(filters);
    res.json(logs);
  } catch (error) {
    console.error('Error getting audit logs:', error);
    res.status(500).json({ error: 'Failed to get audit logs' });
  }
});

/**
 * Get audit log by ID
 */
router.get('/:id', authenticateToken, async (req, res) => {
  try {
    const log = await db.getAsync(
      'SELECT * FROM audit_logs WHERE id = ?',
      [req.params.id]
    );

    if (!log) {
      return res.status(404).json({ error: 'Log not found' });
    }

    res.json(log);
  } catch (error) {
    console.error('Error getting audit log:', error);
    res.status(500).json({ error: 'Failed to get audit log' });
  }
});

/**
 * Get audit stats
 */
router.get('/stats/summary', authenticateToken, async (req, res) => {
  try {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    const stats = {
      total_logs: await db.getAsync('SELECT COUNT(*) as count FROM audit_logs'),
      logs_today: await db.getAsync(
        'SELECT COUNT(*) as count FROM audit_logs WHERE created_at >= ?',
        [today.toISOString()]
      ),
      by_action: await db.allAsync(
        'SELECT action, COUNT(*) as count FROM audit_logs GROUP BY action'
      ),
      by_status: await db.allAsync(
        'SELECT status, COUNT(*) as count FROM audit_logs GROUP BY status'
      ),
    };

    res.json(stats);
  } catch (error) {
    console.error('Error getting audit stats:', error);
    res.status(500).json({ error: 'Failed to get audit statistics' });
  }
});

module.exports = router;
