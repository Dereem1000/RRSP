-- Vault Secrets Table
-- Stores encrypted secrets with metadata
CREATE TABLE IF NOT EXISTS secrets (
  id TEXT PRIMARY KEY,
  name TEXT UNIQUE NOT NULL,
  encrypted_value TEXT NOT NULL,
  description TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT,
  updated_by TEXT,
  iv TEXT NOT NULL,
  auth_tag TEXT NOT NULL,
  CONSTRAINT name_unique UNIQUE(name)
);

-- Users Table
-- Stores user accounts for vault access
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  email TEXT,
  role TEXT DEFAULT 'user',
  is_active BOOLEAN DEFAULT 1,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_login DATETIME,
  failed_attempts INTEGER DEFAULT 0,
  locked_until DATETIME,
  CONSTRAINT role_check CHECK(role IN ('admin', 'deployer', 'user'))
);

-- Audit Log Table
-- Stores all access and modification events
CREATE TABLE IF NOT EXISTS audit_logs (
  id TEXT PRIMARY KEY,
  timestamp DATETIME DEFAULT CURRENT_TIMESTAMP,
  user_id TEXT,
  action TEXT NOT NULL,
  resource TEXT,
  resource_id TEXT,
  status TEXT,
  ip_address TEXT,
  user_agent TEXT,
  details TEXT,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT action_check CHECK(action IN (
    'login', 'logout', 'get_secret', 'store_secret', 'delete_secret',
    'create_user', 'delete_user', 'backup_created', 'backup_restored',
    'password_changed', 'server_started', 'server_stopped'
  ))
);

-- Tokens Table
-- Stores active access tokens
CREATE TABLE IF NOT EXISTS tokens (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  token_hash TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  expires_at DATETIME NOT NULL,
  ip_address TEXT,
  user_agent TEXT,
  revoked BOOLEAN DEFAULT 0,
  revoked_at DATETIME,
  FOREIGN KEY(user_id) REFERENCES users(id) ON DELETE CASCADE
);

-- Backup Metadata Table
-- Stores information about backups
CREATE TABLE IF NOT EXISTS backups (
  id TEXT PRIMARY KEY,
  filename TEXT NOT NULL,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  created_by TEXT NOT NULL,
  size_bytes INTEGER,
  hash TEXT,
  encrypted BOOLEAN DEFAULT 1,
  status TEXT DEFAULT 'completed',
  CONSTRAINT status_check CHECK(status IN ('in_progress', 'completed', 'failed'))
);

-- Key Rotation History Table
-- Tracks encryption key rotations
CREATE TABLE IF NOT EXISTS key_rotations (
  id TEXT PRIMARY KEY,
  rotation_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  performed_by TEXT NOT NULL,
  old_key_hash TEXT,
  new_key_hash TEXT,
  status TEXT DEFAULT 'completed',
  notes TEXT
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_secrets_name ON secrets(name);
CREATE INDEX IF NOT EXISTS idx_secrets_created_by ON secrets(created_by);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
CREATE INDEX IF NOT EXISTS idx_audit_user ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_action ON audit_logs(action);
CREATE INDEX IF NOT EXISTS idx_tokens_user ON tokens(user_id);
CREATE INDEX IF NOT EXISTS idx_tokens_expires ON tokens(expires_at);
CREATE INDEX IF NOT EXISTS idx_backups_created ON backups(created_at);

-- Triggers for automatic timestamps
CREATE TRIGGER IF NOT EXISTS update_secrets_timestamp
AFTER UPDATE ON secrets
BEGIN
  UPDATE secrets SET updated_at = CURRENT_TIMESTAMP WHERE id = NEW.id;
END;
