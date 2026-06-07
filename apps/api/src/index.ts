import path from 'path';
import dotenv from 'dotenv';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import { testConnection, getDatabasePath } from '@cd-v2/database';
import authRoutes from './routes/auth';
import clientRoutes from './routes/clients';
import ticketRoutes from './routes/tickets';
import healthRoutes from './routes/health';

dotenv.config({ path: path.resolve(__dirname, '../../../.env') });

const app = express();
const PORT = Number(process.env.PORT) || 4000;
const HOST = process.env.HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:5173';

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
);

app.use('/api/auth', authRoutes);
app.use('/api/clients', clientRoutes);
app.use('/api/tickets', ticketRoutes);
app.use('/api', healthRoutes);

app.get('/', (_req, res) => {
  res.json({
    name: 'Computer Dynamics API v2',
    docs: 'Use /api/health and /api/auth/status',
    database: getDatabasePath(),
  });
});

async function start() {
  try {
    await testConnection();
    console.log('✅ Connected to legacy SQLite database');
    console.log('   Path:', getDatabasePath());

    app.listen(PORT, HOST, () => {
      console.log(`🚀 API listening on http://${HOST}:${PORT}`);
    });
  } catch (error) {
    console.error('❌ Failed to start API — check DATABASE_PATH in .env');
    console.error(error);
    process.exit(1);
  }
}

start();

export default app;
