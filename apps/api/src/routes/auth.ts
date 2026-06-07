import { Router, Response } from 'express';
import bcrypt from 'bcryptjs';
import { Op } from 'sequelize';
import { User, SystemConfig, getDatabasePath, testConnection } from '@cd-v2/database';
import { signToken, signRefreshToken } from '../utils/jwt';
import { AuthRequest, authenticateJWT } from '../middleware/auth';

const router = Router();

function publicUser(user: User) {
  return {
    id: user.id,
    username: user.username,
    email: user.email,
    role: user.role,
    securityClearance: user.securityClearance,
    firstName: user.firstName,
    lastName: user.lastName,
    passwordSet: user.passwordSet,
  };
}

router.post('/login', async (req, res: Response) => {
  const { username, password } = req.body ?? {};
  if (!username || !password) {
    res.status(400).json({ success: false, message: 'Username and password required' });
    return;
  }

  try {
    const maintenanceMode = await SystemConfig.getConfig<boolean>('maintenance_mode', false);

    const user = await User.findOne({
      where: { [Op.or]: [{ username }, { email: username }] },
    });

    if (maintenanceMode) {
      if (!user || user.role !== 'admin') {
        res.status(503).json({
          success: false,
          message: 'System is currently under maintenance. Please try again later.',
          maintenance_mode: true,
        });
        return;
      }
    }

    if (!user) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    if (user.tempPassword && !user.passwordSet) {
      const tempValid = await bcrypt.compare(password, user.tempPassword);
      if (!tempValid) {
        await user.incrementFailedLoginAttempts();
        res.status(401).json({ success: false, message: 'Invalid credentials' });
        return;
      }
      await user.resetFailedLoginAttempts();
      await user.updateLastLogin();
      res.json({
        success: true,
        token: signToken({ id: user.id, role: user.role, clearance: user.securityClearance }),
        refreshToken: signRefreshToken({ id: user.id, username: user.username, role: user.role }),
        user: publicUser(user),
        requiresPasswordSetup: true,
      });
      return;
    }

    if (!user.isActive) {
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    const valid = await user.validatePassword(password);
    if (!valid) {
      await user.incrementFailedLoginAttempts();
      res.status(401).json({ success: false, message: 'Invalid credentials' });
      return;
    }

    await user.resetFailedLoginAttempts();
    await user.updateLastLogin();

    res.json({
      success: true,
      token: signToken({ id: user.id, role: user.role, clearance: user.securityClearance }),
      refreshToken: signRefreshToken({ id: user.id, username: user.username, role: user.role }),
      user: publicUser(user),
    });
  } catch (error) {
    console.error('Login error:', error);
    res.status(500).json({ success: false, message: 'Login error' });
  }
});

router.get('/me', authenticateJWT, async (req: AuthRequest, res: Response) => {
  const user = await User.findByPk(req.user!.id, {
    attributes: { exclude: ['password', 'tempPassword'] },
  });
  if (!user) {
    res.status(404).json({ success: false, message: 'User not found' });
    return;
  }
  res.json({ success: true, user: publicUser(user) });
});

router.get('/status', async (_req, res: Response) => {
  try {
    await testConnection();
    res.json({
      success: true,
      version: '2.0.0',
      database: getDatabasePath(),
      compatible: true,
    });
  } catch {
    res.status(503).json({ success: false, message: 'Database unavailable' });
  }
});

export default router;
