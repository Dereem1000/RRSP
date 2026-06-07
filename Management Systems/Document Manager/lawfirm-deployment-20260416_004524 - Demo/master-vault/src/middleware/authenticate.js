const jwt = require('jsonwebtoken');
const db = require('../db/init');

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key-change-in-production';

/**
 * Middleware to authenticate JWT tokens
 */
async function authenticate(req, res, next) {
  try {
    // Get token from Authorization header
    const authHeader = req.get('Authorization');

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({
        error: 'Missing or invalid Authorization header',
      });
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    // Verify JWT
    const decoded = jwt.verify(token, JWT_SECRET);

    // Check if token has been revoked
    const storedToken = await db.get(
      'SELECT revoked FROM tokens WHERE id = ?',
      [decoded.jti]
    );

    if (!storedToken || storedToken.revoked) {
      return res.status(401).json({
        error: 'Token has been revoked',
      });
    }

    // Check if user still exists and is active
    const user = await db.get(
      'SELECT id, username, role, is_active FROM users WHERE id = ? AND is_active = 1',
      [decoded.userId]
    );

    if (!user) {
      return res.status(401).json({
        error: 'User not found or inactive',
      });
    }

    // Attach user info to request
    req.user = {
      userId: decoded.userId,
      username: decoded.username,
      role: decoded.role,
      jti: decoded.jti,
    };

    next();

  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      return res.status(401).json({
        error: 'Token has expired',
      });
    }

    if (error instanceof jwt.InvalidTokenError) {
      return res.status(401).json({
        error: 'Invalid token',
      });
    }

    console.error('Authentication error:', error);
    res.status(500).json({
      error: 'Authentication failed',
    });
  }
}

module.exports = authenticate;
