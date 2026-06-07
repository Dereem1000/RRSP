const express = require('express');
const https = require('https');
const fs = require('fs');
const path = require('path');
const helmet = require('helmet');
const cors = require('cors');
const morgan = require('morgan');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const db = require('./db/init');
const authRoutes = require('./routes/auth');
const secretRoutes = require('./routes/secrets');
const adminRoutes = require('./routes/admin');
const auditRoutes = require('./routes/audit');
const auditMiddleware = require('./middleware/audit');

const app = express();

// Trust proxy
app.set('trust proxy', 1);

// Security middleware
app.use(helmet({
  contentSecurityPolicy: {
    directives: {
      defaultSrc: ["'self'"],
      scriptSrc: ["'self'", "'unsafe-inline'"],
      styleSrc: ["'self'", "'unsafe-inline'"],
      imgSrc: ["'self'", 'data:'],
    },
  },
  hsts: {
    maxAge: 31536000,
    includeSubDomains: true,
    preload: true,
  },
}));

// CORS configuration
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'localhost:3333',
  credentials: true,
}));

// Body parser
app.use(express.json({ limit: '10kb' }));
app.use(express.urlencoded({ limit: '10kb', extended: true }));

// Logging
app.use(morgan('combined'));

// Rate limiting
const generalLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // Limit each IP to 100 requests per windowMs
  message: 'Too many requests from this IP, please try again later.',
});

const authLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 5, // Limit each IP to 5 auth requests per windowMs
  message: 'Too many authentication attempts, please try again later.',
  skipSuccessfulRequests: true, // Don't count successful requests
});

app.use(generalLimiter);

// Audit logging middleware
app.use(auditMiddleware);

// Routes
app.use('/api/auth', authLimiter, authRoutes);
app.use('/api/secret', secretRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/audit', auditRoutes);

// Health check
app.get('/health', (req, res) => {
  res.json({
    status: 'healthy',
    uptime: process.uptime(),
    timestamp: new Date().toISOString(),
  });
});

// Serve admin UI
app.use(express.static(path.join(__dirname, 'ui')));
app.get('/admin', (req, res) => {
  res.sendFile(path.join(__dirname, 'ui', 'admin.html'));
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);

  // Don't expose internal error details to client
  const status = err.status || 500;
  const message = process.env.NODE_ENV === 'production'
    ? 'Internal server error'
    : err.message;

  res.status(status).json({
    error: message,
    ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
  });
});

// Initialize database and start server
async function start() {
  try {
    console.log('🔐 Law Firm Master Vault System');
    console.log('================================\n');

    // Initialize database
    console.log('📦 Initializing database...');
    await db.initialize();
    console.log('✅ Database initialized\n');

    // Load TLS certificates
    const certPath = path.join(__dirname, '..', 'certs', 'vault.crt');
    const keyPath = path.join(__dirname, '..', 'certs', 'vault.key');

    let server;

    if (fs.existsSync(certPath) && fs.existsSync(keyPath)) {
      // HTTPS
      const options = {
        key: fs.readFileSync(keyPath),
        cert: fs.readFileSync(certPath),
      };

      server = https.createServer(options, app);
      console.log('🔒 Using HTTPS with TLS certificates');
    } else {
      // HTTP (development only - not recommended for production)
      const http = require('http');
      server = http.createServer(app);
      console.log('⚠️  Using HTTP (not secure - development only)');
      console.log('   Run: npm run init-certs (to generate TLS certificates)\n');
    }

    const PORT = process.env.PORT || 3333;

    server.listen(PORT, () => {
      console.log(`\n✅ Master Vault listening on port ${PORT}`);
      console.log(`   Admin UI:  https://localhost:${PORT}/admin`);
      console.log(`   API:       https://localhost:${PORT}/api`);
      console.log(`   Health:    https://localhost:${PORT}/health\n`);

      // Log startup event
      const auditService = require('./services/auditService');
      auditService.log({
        timestamp: new Date(),
        user: 'system',
        action: 'server_started',
        resource: 'vault',
        status: 'success',
        ipAddress: '127.0.0.1',
        details: 'Vault server started',
      });
    });

    // Graceful shutdown
    process.on('SIGTERM', () => {
      console.log('\n📥 SIGTERM received, graceful shutdown...');
      server.close(() => {
        console.log('✅ Server closed');

        // Log shutdown event
        const auditService = require('./services/auditService');
        auditService.log({
          timestamp: new Date(),
          user: 'system',
          action: 'server_stopped',
          resource: 'vault',
          status: 'success',
          ipAddress: '127.0.0.1',
          details: 'Vault server stopped gracefully',
        });

        process.exit(0);
      });
    });

  } catch (error) {
    console.error('❌ Failed to start vault:', error);
    process.exit(1);
  }
}

// Start the server
start();

module.exports = app;
