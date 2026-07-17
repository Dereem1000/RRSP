import './env';
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import multer from 'multer';
import { testConnection, getDatabasePath } from '@cd-v2/database';
import securityRoutes from './routes/security';
import portalRoutes from './routes/portal';

const app = express();
const PORT = Number(process.env.CD_API_PORT) || 4000;
const HOST = process.env.CD_API_HOST || process.env.HOST || '127.0.0.1';
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';

const upload = multer({ storage: multer.memoryStorage() });

app.set('trust proxy', 1);
app.use(helmet({ contentSecurityPolicy: false }));
app.use(cors({ origin: CORS_ORIGIN, credentials: true }));
app.use(cookieParser());

app.use(
  '/api/auth/login',
  rateLimit({ windowMs: 15 * 60 * 1000, max: 30, standardHeaders: true, legacyHeaders: false })
);

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/api/backup/upload-restore', upload.any());
app.use('/api/tickets/import-csv', upload.any());

app.use('/api/security', securityRoutes);
app.use('/api', portalRoutes);

app.get('/', (_req, res) => {
  res.json({
    name: 'Computer Dynamics API v2',
    docs: 'Use /api/health and /api/auth/me',
    database: getDatabasePath(),
  });
});

async function start() {
  try {
    await testConnection();
    console.log('✅ Connected to legacy SQLite database');
    console.log('   Path:', getDatabasePath());

    const server = app.listen(PORT, HOST, () => {
      console.log(`🚀 API listening on http://${HOST}:${PORT}`);
    });

    // Long Mini/provision runs can exceed minutes; keep sockets from going stale mid-request.
    server.requestTimeout = 0;
    server.headersTimeout = 120_000;
    server.keepAliveTimeout = 65_000;

    server.on('error', (error: NodeJS.ErrnoException) => {
      if (error.code === 'EADDRINUSE') {
        console.error(`❌ Port ${PORT} is already in use — run stop.bat or scripts\\clear-port.bat ${PORT}`);
      } else {
        console.error('❌ Failed to bind Express API:', error);
      }
      process.exit(1);
    });
  } catch (error) {
    console.error('❌ Failed to start API — check DATABASE_PATH in .env');
    console.error(error);
    process.exit(1);
  }
}

start();

export default app;
