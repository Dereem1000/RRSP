const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');
const encrypt = require('../crypto/encryption');
const authenticate = require('../middleware/authenticate');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';
const TOKEN_EXPIRY = 24 * 60 * 60; // 24 hours

/**
 * POST /api/auth/token
 * Generate authentication token
 */
router.post('/token', async (req, res) => {
  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return res.status(400).json({
        error: 'Username and password required',
      });
    }

    // Get user from database
    const user = await db.get(
      'SELECT * FROM users WHERE username = ? AND is_active = 1',
      [username]
    );

    if (!user) {
      return res.status(401).json({
        error: 'Invalid credentials',
      });
    }

    // Check account lockout
    if (user.locked_until && new Date(user.locked_until) > new Date()) {
      return res.status(429).json({
        error: 'Account is locked due to too many failed login attempts',
      });
    }

    // Verify password with bcrypt (in real implementation)
    // For now using simple hash comparison
    const bcrypt = require('bcryptjs');
    const passwordValid = await bcrypt.compare(password, user.password_hash);

    if (!passwordValid) {
      // Increment failed attempts
      const failedAttempts = (user.failed_attempts || 0) + 1;
      const lockUntil = failedAttempts >= 5
        ? new Date(Date.now() + 15 * 60 * 1000) // Lock for 15 minutes
        : null;

      await db.run(
        'UPDATE users SET failed_attempts = ?, locked_until = ? WHERE id = ?',
        [failedAttempts, lockUntil ? lockUntil.toISOString() : null, user.id]
      );

      return res.status(401).json({
        error: 'Invalid credentials',
      });
    }

    // Reset failed attempts on successful login
    await db.run(
      'UPDATE users SET failed_attempts = 0, locked_until = NULL, last_login = ? WHERE id = ?',
      [new Date().toISOString(), user.id]
    );

    // Generate JWT token
    const tokenId = uuidv4();
    const expiresAt = new Date(Date.now() + TOKEN_EXPIRY * 1000);

    const token = jwt.sign(
      {
        userId: user.id,
        username: user.username,
        role: user.role,
        jti: tokenId,
      },
      JWT_SECRET,
      { expiresIn: TOKEN_EXPIRY }
    );

    // Store token in database for revocation tracking
    await db.run(
      `INSERT INTO tokens (id, user_id, token_hash, expires_at, ip_address, user_agent)
       VALUES (?, ?, ?, ?, ?, ?)`,
      [
        tokenId,
        user.id,
        require('crypto').createHash('sha256').update(token).digest('hex'),
        expiresAt.toISOString(),
        req.ip,
        req.get('user-agent'),
      ]
    );

    // Log successful authentication
    const auditService = require('../services/auditService');
    await auditService.log({
      user_id: user.id,
      action: 'login',
      resource: 'authentication',
      status: 'success',
      ip_address: req.ip,
      user_agent: req.get('user-agent'),
    });

    res.json({
      token,
      expiresIn: TOKEN_EXPIRY,
      user: {
        id: user.id,
        username: user.username,
        role: user.role,
      },
    });

  } catch (error) {
    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
    });
  }
});

/**
 * POST /api/auth/logout
 * Revoke authentication token
 */
router.post('/logout', authenticate, async (req, res) => {
  try {
    const userId = req.user.userId;
    const jti = req.user.jti;

    // Revoke token
    await db.run(
      'UPDATE tokens SET revoked = 1, revoked_at = ? WHERE id = ?',
      [new Date().toISOString(), jti]
    );

    // Log logout
    const auditService = require('../services/auditService');
    await auditService.log({
      user_id: userId,
      action: 'logout',
      resource: 'authentication',
      status: 'success',
      ip_address: req.ip,
    });

    res.json({ success: true });

  } catch (error) {
    console.error('Logout error:', error);
    res.status(500).json({
      error: 'Logout failed',
    });
  }
});

/**
 * GET /api/auth/verify
 * Verify token validity
 */
router.get('/verify', authenticate, (req, res) => {
  res.json({
    valid: true,
    user: req.user,
  });
});

module.exports = router;
