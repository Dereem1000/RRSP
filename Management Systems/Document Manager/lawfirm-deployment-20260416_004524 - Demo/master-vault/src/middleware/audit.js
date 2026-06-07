const auditService = require('../services/auditService');

/**
 * Middleware to log API requests
 */
async function auditMiddleware(req, res, next) {
  // Skip logging for health checks
  if (req.path === '/health') {
    return next();
  }

  // Attach response logging
  const originalSend = res.send;

  res.send = function(data) {
    res.send = originalSend;
    return originalSend.call(this, data);
  };

  next();
}

module.exports = auditMiddleware;
