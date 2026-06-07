const express = require('express');
const router = express.Router();
const { v4: uuidv4 } = require('uuid');
const db = require('../db/init');
const encrypt = require('../crypto/encryption');
const authenticate = require('../middleware/authenticate');
const auditService = require('../services/auditService');

const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'change-me-in-production';

/**
 * POST /api/secret/store
 * Store a new secret or update existing
 */
router.post('/store', authenticate, async (req, res) => {
  try {
    const { name, value, description } = req.body;

    if (!name || !value) {
      return res.status(400).json({
        error: 'Secret name and value required',
      });
    }

    // Check permissions (only admin and deployer can store secrets)
    if (!['admin', 'deployer'].includes(req.user.role)) {
      await auditService.log({
        user_id: req.user.userId,
        action: 'store_secret',
        resource: name,
        status: 'denied',
        ip_address: req.ip,
        details: 'Permission denied',
      });
      return res.status(403).json({
        error: 'Permission denied',
      });
    }

    // Encrypt the secret value
    const encrypted = encrypt.encrypt(value, MASTER_PASSWORD);

    const secretId = uuidv4();

    // Check if secret already exists
    const existing = await db.get(
      'SELECT id FROM secrets WHERE name = ?',
      [name]
    );

    if (existing) {
      // Update existing
      await db.run(
        `UPDATE secrets 
         SET encrypted_value = ?, iv = ?, auth_tag = ?, salt = ?, 
             description = ?, updated_by = ?, updated_at = ?
         WHERE id = ?`,
        [
          encrypted.encryptedData,
          encrypted.iv,
          encrypted.authTag,
          encrypted.salt,
          description,
          req.user.username,
          new Date().toISOString(),
          existing.id,
        ]
      );

      await auditService.log({
        user_id: req.user.userId,
        action: 'store_secret',
        resource: name,
        resource_id: existing.id,
        status: 'success',
        ip_address: req.ip,
        details: 'Secret updated',
      });

      return res.json({
        success: true,
        message: 'Secret updated',
        secretId: existing.id,
      });
    }

    // Create new secret
    await db.run(
      `INSERT INTO secrets (id, name, encrypted_value, iv, auth_tag, salt, description, created_by)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
      [
        secretId,
        name,
        encrypted.encryptedData,
        encrypted.iv,
        encrypted.authTag,
        encrypted.salt,
        description,
        req.user.username,
      ]
    );

    await auditService.log({
      user_id: req.user.userId,
      action: 'store_secret',
      resource: name,
      resource_id: secretId,
      status: 'success',
      ip_address: req.ip,
      details: 'Secret created',
    });

    res.status(201).json({
      success: true,
      message: 'Secret stored',
      secretId,
    });

  } catch (error) {
    console.error('Secret storage error:', error);
    res.status(500).json({
      error: 'Failed to store secret',
    });
  }
});

/**
 * POST /api/secret/get
 * Retrieve a secret
 */
router.post('/get', authenticate, async (req, res) => {
  try {
    const { name } = req.body;

    if (!name) {
      return res.status(400).json({
        error: 'Secret name required',
      });
    }

    // Get secret from database
    const secret = await db.get(
      'SELECT * FROM secrets WHERE name = ?',
      [name]
    );

    if (!secret) {
      await auditService.log({
        user_id: req.user.userId,
        action: 'get_secret',
        resource: name,
        status: 'not_found',
        ip_address: req.ip,
      });
      return res.status(404).json({
        error: 'Secret not found',
      });
    }

    // Decrypt the secret value
    const decrypted = encrypt.decrypt(
      secret.encrypted_value,
      secret.iv,
      secret.auth_tag,
      secret.salt,
      MASTER_PASSWORD
    );

    await auditService.log({
      user_id: req.user.userId,
      action: 'get_secret',
      resource: name,
      resource_id: secret.id,
      status: 'success',
      ip_address: req.ip,
    });

    res.json({
      name,
      value: decrypted,
      description: secret.description,
      lastAccessed: new Date().toISOString(),
    });

  } catch (error) {
    console.error('Secret retrieval error:', error);
    res.status(500).json({
      error: 'Failed to retrieve secret',
    });
  }
});

/**
 * DELETE /api/secret/:name
 * Delete a secret
 */
router.delete('/:name', authenticate, async (req, res) => {
  try {
    const { name } = req.params;

    // Check permissions (only admin can delete secrets)
    if (req.user.role !== 'admin') {
      await auditService.log({
        user_id: req.user.userId,
        action: 'delete_secret',
        resource: name,
        status: 'denied',
        ip_address: req.ip,
        details: 'Permission denied - admin only',
      });
      return res.status(403).json({
        error: 'Only admins can delete secrets',
      });
    }

    // Get secret first
    const secret = await db.get(
      'SELECT id FROM secrets WHERE name = ?',
      [name]
    );

    if (!secret) {
      return res.status(404).json({
        error: 'Secret not found',
      });
    }

    // Delete secret
    await db.run(
      'DELETE FROM secrets WHERE id = ?',
      [secret.id]
    );

    await auditService.log({
      user_id: req.user.userId,
      action: 'delete_secret',
      resource: name,
      resource_id: secret.id,
      status: 'success',
      ip_address: req.ip,
    });

    res.json({
      success: true,
      message: 'Secret deleted',
    });

  } catch (error) {
    console.error('Secret deletion error:', error);
    res.status(500).json({
      error: 'Failed to delete secret',
    });
  }
});

module.exports = router;
