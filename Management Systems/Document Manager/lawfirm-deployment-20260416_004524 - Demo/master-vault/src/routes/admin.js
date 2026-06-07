/**
 * Admin Routes
 * Provides administrative endpoints for vault management
 * Requires admin role authentication
 */

const express = require('express');
const router = express.Router();
const db = require('../db/init');
const authenticateToken = require('../middleware/authenticate');

// Middleware to check admin role
const requireAdmin = async (req, res, next) => {
  if (!req.user || req.user.role !== 'admin') {
    return res.status(403).json({ error: 'Admin access required' });
  }
  next();
};

/**
 * Get vault statistics and health
 */
router.get('/stats', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const stats = {
      uptime: process.uptime(),
      timestamp: new Date().toISOString(),
      database: {
        status: 'connected',
      },
    };

    // Get user count
    const userCount = await db.getAsync('SELECT COUNT(*) as count FROM users');
    stats.users = userCount.count;

    // Get secret count
    const secretCount = await db.getAsync('SELECT COUNT(*) as count FROM secrets');
    stats.secrets = secretCount.count;

    // Get audit log count
    const auditCount = await db.getAsync('SELECT COUNT(*) as count FROM audit_logs');
    stats.auditLogs = auditCount.count;

    res.json(stats);
  } catch (error) {
    console.error('Error getting stats:', error);
    res.status(500).json({ error: 'Failed to get statistics' });
  }
});

/**
 * Get all users
 */
router.get('/users', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const users = await db.allAsync(
      'SELECT id, username, email, role, created_at, last_login FROM users'
    );
    res.json(users);
  } catch (error) {
    console.error('Error getting users:', error);
    res.status(500).json({ error: 'Failed to get users' });
  }
});

/**
 * Get specific user
 */
router.get('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const user = await db.getAsync(
      'SELECT id, username, email, role, created_at, last_login FROM users WHERE id = ?',
      [req.params.id]
    );

    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    res.json(user);
  } catch (error) {
    console.error('Error getting user:', error);
    res.status(500).json({ error: 'Failed to get user' });
  }
});

/**
 * Delete user
 */
router.delete('/users/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    // Prevent deleting self
    if (req.user.id === parseInt(req.params.id)) {
      return res.status(400).json({ error: 'Cannot delete yourself' });
    }

    await db.runAsync('DELETE FROM users WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'User deleted' });
  } catch (error) {
    console.error('Error deleting user:', error);
    res.status(500).json({ error: 'Failed to delete user' });
  }
});

/**
 * Get all secrets (metadata only)
 */
router.get('/secrets', authenticateToken, requireAdmin, async (req, res) => {
  try {
    const secrets = await db.allAsync(
      'SELECT id, name, created_at, updated_at FROM secrets'
    );
    res.json(secrets);
  } catch (error) {
    console.error('Error getting secrets:', error);
    res.status(500).json({ error: 'Failed to get secrets' });
  }
});

/**
 * Delete secret
 */
router.delete('/secrets/:id', authenticateToken, requireAdmin, async (req, res) => {
  try {
    await db.runAsync('DELETE FROM secrets WHERE id = ?', [req.params.id]);

    res.json({ success: true, message: 'Secret deleted' });
  } catch (error) {
    console.error('Error deleting secret:', error);
    res.status(500).json({ error: 'Failed to delete secret' });
  }
});

/**
 * Get system configuration
 */
router.get('/config', authenticateToken, requireAdmin, (req, res) => {
  const config = {
    node_env: process.env.NODE_ENV,
    port: process.env.PORT,
    vault_version: '1.0.0',
    encryption: {
      algorithm: process.env.ENCRYPTION_ALGORITHM || 'aes-256-gcm',
      iterations: process.env.ENCRYPTION_ITERATIONS || 100000,
    },
    rate_limiting: {
      auth_attempts: 5,
      window_ms: 900000,
    },
  };

  res.json(config);
});

module.exports = router;
