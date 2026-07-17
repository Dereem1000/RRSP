/**
 * PM2 Ecosystem Configuration
 * Production process manager configuration for ZenLaw.online
 */

const path = require('path');

const vaultEnv = {
  MASTER_PASSWORD: process.env.LAWFIRM_MASTER_PASSWORD || 'Opseccdynamics12$',
  JWT_SECRET: process.env.LAWFIRM_JWT_SECRET || '5c2d9dd64ffdc88e969cbce54e98d3e5',
  JWT_EXPIRATION: process.env.LAWFIRM_JWT_EXPIRATION || '2h',
};

module.exports = {
  apps: [{
    name: 'master-vault',
    script: './src/index.js',
    cwd: './master-vault',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 3333,
      HOST: 'localhost',
      HTTPS_ENABLED: 'true',
      SSL_KEY_PATH: '../server/certs/server.key',
      SSL_CERT_PATH: '../server/certs/server.crt',
      ...vaultEnv,
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 3333,
      HOST: 'localhost',
      HTTPS_ENABLED: 'true',
      SSL_KEY_PATH: '../server/certs/server.key',
      SSL_CERT_PATH: '../server/certs/server.crt',
      ...vaultEnv,
    },
    error_file: './logs/vault-error.log',
    out_file: './logs/vault-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 10,
    restart_delay: 5000,
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      'data'
    ]
  },
  {
    name: 'zenlaw-server',
    script: './dist/index.js',
    cwd: './server',
    instances: 1,
    exec_mode: 'fork',
    env: {
      NODE_ENV: 'production',
      PORT: 5002,
      BEHIND_PROXY: 'true',
      BEHIND_CLOUDFLARE: 'true',
      // Master Vault: hostname only (client builds https://host:port). Use 'localhost' not 'https://localhost'
      VAULT_URL: 'localhost',
      VAULT_PORT: 3333,
      VAULT_CA_CERT: './certs/server.crt',
      VAULT_CACHE_EXPIRY: '3600000',
      // Encryption configuration
      ENCRYPTION_ENABLED: 'true',
      ENCRYPTION_AUTO_ENCRYPT: 'true'
    },
    env_production: {
      NODE_ENV: 'production',
      PORT: 5002,
      BEHIND_PROXY: 'true',
      BEHIND_CLOUDFLARE: 'true',
      VAULT_URL: 'localhost',
      VAULT_PORT: 3333,
      VAULT_CA_CERT: './certs/server.crt',
      VAULT_CACHE_EXPIRY: '3600000',
      ENCRYPTION_ENABLED: 'true',
      ENCRYPTION_AUTO_ENCRYPT: 'true'
    },
    error_file: './logs/pm2-error.log',
    out_file: './logs/pm2-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '1G',
    min_uptime: '10s',          // Minimum uptime before considering it a successful start
    max_restarts: 10,           // Maximum number of restarts
    restart_delay: 5000,        // Wait 5 seconds before restarting (gives port time to be released)
    watch: false,
    ignore_watch: [
      'node_modules',
      'logs',
      'data',
      'uploads'
    ]
  },
  {
    name: 'rotation-scheduler',
    script: './workstation-monitor/rotation_scheduler.py',
    cwd: '.',
    instances: 1,
    exec_mode: 'fork',
    interpreter: 'python',
    env: {
      ROTATION_ADMIN_EMAIL: 'admin@lawfirm.com',
      ROTATION_ADMIN_PASSWORD: 'admin123',
      // Use HTTP so scheduler works when server runs without SSL (dev folder / PM2 from working)
      ROTATION_API_URL: 'http://localhost:5002/api',
      ROTATION_DB_PATH: path.join(__dirname, 'server', 'data', 'lawfirm.db'),
      ROTATION_CHECK_INTERVAL_MINUTES: '60',
      ROTATION_INTERVAL_DAYS: '90',
      ROTATION_GRACE_PERIOD_DAYS: '14'
    },
    error_file: './logs/scheduler-error.log',
    out_file: './logs/scheduler-out.log',
    log_date_format: 'YYYY-MM-DD HH:mm:ss Z',
    merge_logs: true,
    autorestart: true,
    max_memory_restart: '500M',
    min_uptime: '10s',
    max_restarts: 5,
    restart_delay: 5000,
    watch: false,
    ignore_watch: [
      'node_modules',
      '__pycache__',
      'logs',
      'data'
    ]
  }]
};





