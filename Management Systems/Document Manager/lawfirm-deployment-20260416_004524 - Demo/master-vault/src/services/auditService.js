const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');

/**
 * Log an audit event
 * @param {object} event - Audit event data
 */
async function log(event) {
  try {
    const {
      timestamp = new Date(),
      user_id = null,
      action,
      resource = null,
      resource_id = null,
      status = 'unknown',
      ip_address = null,
      user_agent = null,
      details = null,
    } = event;

    await db.run(
      `INSERT INTO audit_logs (id, timestamp, user_id, action, resource, resource_id, status, ip_address, user_agent, details)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        uuidv4(),
        timestamp.toISOString(),
        user_id,
        action,
        resource,
        resource_id,
        status,
        ip_address,
        user_agent,
        details,
      ]
    );
  } catch (error) {
    console.error('Failed to log audit event:', error);
    // Don't throw - audit failures shouldn't break the app
  }
}

/**
 * Get audit logs with filtering
 */
async function getLogs(filters = {}) {
  try {
    const {
      action = null,
      user_id = null,
      status = null,
      days = 30,
      limit = 1000,
    } = filters;

    let query = 'SELECT * FROM audit_logs WHERE timestamp > datetime("now", ?)';
    const params = [`-${days} days`];

    if (action) {
      query += ' AND action = ?';
      params.push(action);
    }

    if (user_id) {
      query += ' AND user_id = ?';
      params.push(user_id);
    }

    if (status) {
      query += ' AND status = ?';
      params.push(status);
    }

    query += ' ORDER BY timestamp DESC LIMIT ?';
    params.push(limit);

    const logs = await db.all(query, params);
    return logs;
  } catch (error) {
    console.error('Failed to retrieve audit logs:', error);
    throw error;
  }
}

module.exports = {
  log,
  getLogs,
};
