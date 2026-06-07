# Law Firm Master Vault System
## Self-Hosted Encrypted Secrets Management

A secure, self-hosted vault for storing sensitive keys, credentials, and encryption master keys. Designed specifically for law firms with offline-first capability.

---

## Features

✅ **Military-grade Encryption** - AES-256-GCM encryption for all secrets  
✅ **Zero Trust Architecture** - Every access requires authentication  
✅ **Audit Logging** - Complete access history  
✅ **Offline Capable** - Works without internet connection  
✅ **Simple Interface** - Web UI for easy key management  
✅ **API Access** - For automated deployments  
✅ **Backup/Recovery** - Built-in backup procedures  
✅ **LastPass Integration** - Master password stored in LastPass  

---

## Quick Start

### Installation

```bash
cd master-vault
npm install
```

### Initialize Vault

```bash
# First time setup
npm run init

# You'll be prompted for:
# 1. Master Password (store in LastPass)
# 2. Admin account (for web UI)
```

### Start Vault

```bash
npm start

# Vault starts on https://localhost:3333
# Open browser: https://localhost:3333/admin
```

### Store Your First Secret

```bash
# Via CLI
npm run vault add ENCRYPTION_MASTER_KEY "your-64-char-hex-key"

# Or use web interface
# Login → Secrets → Add Secret
```

### Retrieve Secret (for deployment)

```bash
# Via API
curl -X POST https://localhost:3333/api/secret/get \
  -H "Authorization: Bearer <token>" \
  -H "Content-Type: application/json" \
  -d '{"name": "ENCRYPTION_MASTER_KEY"}'

# Response:
# {"value": "your-64-char-hex-key"}
```

---

## Architecture

```
┌─────────────────────────────────────────────┐
│   Law Firm Master Vault                     │
│   Self-Hosted on Internal Server            │
├─────────────────────────────────────────────┤
│                                             │
│  Encrypted Database (vault.db)              │
│  ├── All secrets encrypted at rest          │
│  ├── Master password: Stored in LastPass    │
│  └── Access logs: Unencrypted audit trail   │
│                                             │
│  Web Interface (https://localhost:3333)     │
│  ├── Admin dashboard                        │
│  ├── Secret management                      │
│  ├── User access control                    │
│  └── Audit log viewer                       │
│                                             │
│  API Endpoints (/api/secret/*)              │
│  ├── Authentication required                │
│  ├── Rate limited                           │
│  ├── All access logged                      │
│  └── TLS encrypted                          │
│                                             │
│  Backup System                              │
│  ├── Encrypted backup files                 │
│  ├── Can be stored on USB/offline           │
│  └── Recovery procedures documented         │
│                                             │
└─────────────────────────────────────────────┘
```

---

## Stored Secrets (Examples)

```
✅ ENCRYPTION_MASTER_KEY
   - Law Firm encryption master key
   - Used by: Application server
   - Access: Automated (server startup)

✅ AWS_ACCESS_KEY_ID
   - AWS account access key
   - Used by: Deployment system
   - Access: CI/CD automation

✅ AWS_SECRET_ACCESS_KEY
   - AWS account secret key
   - Used by: AWS CLI deployments
   - Access: CI/CD automation

✅ DATABASE_PASSWORD
   - Database admin password
   - Used by: Database backups
   - Access: Backup scripts

✅ GITHUB_TOKEN
   - GitHub personal access token
   - Used by: CI/CD deployments
   - Access: GitHub Actions

✅ CLOUDFLARE_API_TOKEN
   - Cloudflare API token
   - Used by: DNS management
   - Access: On-demand by admins
```

---

## Security Model

### Master Password

- **Stored in:** LastPass vault (encrypted)
- **Who knows it:** Managing partner + 1 backup person
- **Used for:** Unlocking vault on server startup
- **Protection:** Only kept in memory, never on disk
- **Backup:** Physical safe deposit box (encrypted backup)

### Access Tokens

- **Type:** JWT tokens with 24-hour expiration
- **Who gets them:** Authorized users and services
- **Revocation:** Immediate (any time)
- **Logging:** Every access logged with timestamp and IP

### Encryption

- **Algorithm:** AES-256-GCM (same as files)
- **Per-secret keys:** Derived from master key
- **At rest:** All secrets encrypted in database
- **In transit:** TLS 1.2+ for all API calls

### Audit Trail

- **What's logged:**
  - Who accessed what secret
  - When they accessed it
  - From which IP address
  - Success or failure
  - What action (read/create/update/delete)

- **Stored:** In unencrypted audit table (for quick queries)
- **Retention:** 2 years minimum
- **Review:** Weekly by security team

---

## Usage Examples

### Deploy with Encryption Key from Vault

```bash
#!/bin/bash
# deployment-script.sh

# 1. Get token from vault
TOKEN=$(curl -s -X POST https://localhost:3333/api/auth/token \
  -H "Content-Type: application/json" \
  -d '{"username":"deployer","password":"deployment-password"}' \
  | jq -r '.token')

# 2. Retrieve encryption key
ENCRYPTION_KEY=$(curl -s -X POST https://localhost:3333/api/secret/get \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{"name":"ENCRYPTION_MASTER_KEY"}' \
  | jq -r '.value')

# 3. Deploy with key
export ENCRYPTION_MASTER_KEY=$ENCRYPTION_KEY
npm start
```

### Automated Server Startup

```javascript
// server/startup.js
const vaultClient = require('./vault-client');

async function initializeServer() {
  try {
    // 1. Authenticate with vault
    const token = await vaultClient.authenticate({
      username: 'server-service',
      password: process.env.VAULT_SERVICE_PASSWORD
    });
    
    // 2. Get encryption key
    const encryptionKey = await vaultClient.getSecret(
      token,
      'ENCRYPTION_MASTER_KEY'
    );
    
    // 3. Load key into memory
    global.encryptionKey = encryptionKey;
    
    // 4. Start server
    startServer();
    
  } catch (error) {
    console.error('Failed to initialize encryption key:', error);
    process.exit(1);
  }
}
```

### Manual Key Retrieval

```bash
# 1. SSH to server
ssh admin@lawfirm-server.local

# 2. Login to vault web interface
# https://localhost:3333/admin
# Username: admin
# Password: [from LastPass]

# 3. View ENCRYPTION_MASTER_KEY
# Navigate to: Secrets → ENCRYPTION_MASTER_KEY
# Value is displayed and can be copied

# 4. Use key for emergency recovery
export ENCRYPTION_MASTER_KEY="<value from vault>"
npm start
```

---

## File Structure

```
master-vault/
├── README.md                    # This file
├── package.json                 # Dependencies
├── .env.example                 # Environment template
│
├── src/
│   ├── index.js                 # Server entry point
│   ├── config.js                # Configuration
│   │
│   ├── db/
│   │   ├── init.js              # Database initialization
│   │   ├── migrations.js        # Database migrations
│   │   └── schema.sql           # Database schema
│   │
│   ├── crypto/
│   │   ├── encryption.js        # AES-256-GCM encryption
│   │   ├── hashing.js           # Password hashing (bcrypt)
│   │   └── keys.js              # Key derivation
│   │
│   ├── routes/
│   │   ├── auth.js              # Authentication endpoints
│   │   ├── secrets.js           # Secret management
│   │   ├── admin.js             # Admin endpoints
│   │   └── audit.js             # Audit log endpoints
│   │
│   ├── middleware/
│   │   ├── authenticate.js      # Token validation
│   │   ├── rateLimit.js         # Rate limiting
│   │   ├── audit.js             # Audit logging
│   │   └── errorHandler.js      # Error handling
│   │
│   ├── ui/
│   │   ├── admin.html           # Admin dashboard
│   │   ├── admin.js             # Dashboard logic
│   │   └── styles.css           # Styling
│   │
│   └── services/
│       ├── vaultService.js      # Business logic
│       ├── auditService.js      # Audit logging
│       └── backupService.js     # Backup operations
│
├── scripts/
│   ├── init.js                  # Initial setup
│   ├── add-secret.js            # CLI: Add secret
│   ├── get-secret.js            # CLI: Get secret
│   ├── backup.js                # Backup creation
│   └── restore.js               # Backup restoration
│
├── certs/
│   ├── vault.key                # TLS private key
│   └── vault.crt                # TLS certificate
│
├── data/
│   ├── vault.db                 # SQLite database (encrypted)
│   ├── audit.log                # Audit trail
│   └── backups/                 # Backup files
│
└── tests/
    ├── encryption.test.js
    ├── vault.test.js
    └── api.test.js
```

---

## Security Checklist

### Initial Setup

- [ ] Generate strong master password (24+ characters)
- [ ] Store master password in LastPass vault
- [ ] Store backup password in physical safe
- [ ] Enable server firewall (port 3333 only for admins)
- [ ] Generate TLS certificates (self-signed OK for internal)
- [ ] Create admin account with strong password
- [ ] Enable 2FA on admin account (if supported)
- [ ] Test backup and recovery procedure

### Regular Maintenance

- [ ] Monthly: Review audit logs for anomalies
- [ ] Monthly: Verify backup integrity
- [ ] Quarterly: Rotate service passwords
- [ ] Yearly: Rotate master password
- [ ] Yearly: Full disaster recovery test

### Access Control

- [ ] Only managing partner knows master password
- [ ] Only ops person has admin access
- [ ] Deploy person has limited "deployer" access
- [ ] No permanent API tokens (rotate every 90 days)
- [ ] Rate limiting on all endpoints

---

## Deployment

### Option 1: Docker (Recommended)

```bash
# Build container
docker build -t law-firm-vault .

# Run vault
docker run -d \
  --name law-firm-vault \
  -p 3333:3333 \
  -v vault-data:/app/data \
  -e MASTER_PASSWORD_HASH=$HASH \
  law-firm-vault

# Access
https://vault.lawfirm.local:3333
```

### Option 2: Direct Installation (Linux/Mac)

```bash
# Clone vault code
git clone vault-repo /opt/law-firm-vault

# Install dependencies
cd /opt/law-firm-vault && npm install

# Start service
systemctl start law-firm-vault

# Access
https://localhost:3333
```

### Option 3: Windows

```powershell
# Extract vault
Expand-Archive vault.zip -DestinationPath C:\LawFirmVault

# Install dependencies
cd C:\LawFirmVault
npm install

# Create Windows service
npm install -g nssm
nssm install LawFirmVault "node C:\LawFirmVault\src\index.js"

# Start service
nssm start LawFirmVault
```

---

## API Reference

### Authentication

```bash
POST /api/auth/token
Content-Type: application/json

{
  "username": "deployer",
  "password": "password"
}

Response: { "token": "eyJhbGc...", "expiresIn": 86400 }
```

### Get Secret

```bash
POST /api/secret/get
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "ENCRYPTION_MASTER_KEY"
}

Response: { "value": "1a2b3c4d..." }
```

### Store Secret

```bash
POST /api/secret/store
Authorization: Bearer <token>
Content-Type: application/json

{
  "name": "NEW_KEY",
  "value": "secret-value",
  "description": "Optional description"
}

Response: { "success": true }
```

### List Secrets (admin only)

```bash
GET /api/secrets
Authorization: Bearer <admin-token>

Response: [
  { "name": "ENCRYPTION_MASTER_KEY", "lastAccessed": "2026-01-22T10:30:00Z" },
  { "name": "AWS_KEY", "lastAccessed": "2026-01-21T15:45:00Z" }
]
```

### Audit Log

```bash
GET /api/audit?days=30
Authorization: Bearer <admin-token>

Response: [
  {
    "timestamp": "2026-01-22T10:30:00Z",
    "user": "deployer",
    "action": "get_secret",
    "resource": "ENCRYPTION_MASTER_KEY",
    "status": "success",
    "ipAddress": "192.168.1.100"
  }
]
```

---

## Disaster Recovery

### Scenario 1: Master Password Forgotten

**Recovery:**
1. Use backup master password from physical safe
2. Or contact LastPass support with proof of ownership
3. Generate new master password
4. Update in LastPass

### Scenario 2: Vault Database Corrupted

**Recovery:**
1. Stop vault service
2. Restore from encrypted backup file
3. Provide master password when starting
4. Vault automatically decrypts backup
5. Resume operations

### Scenario 3: Vault Server Compromised

**Recovery:**
1. Immediately revoke all active tokens
2. Change all stored secrets (rotate keys)
3. Redeploy application with new keys
4. Audit logs will show what was accessed
5. Restore from clean backup if needed

---

## Monitoring

### Health Check

```bash
curl https://localhost:3333/health -k
# Response: { "status": "healthy", "uptime": 86400 }
```

### Check Audit Logs

```bash
# View recent access
curl https://localhost:3333/api/audit?days=1 \
  -H "Authorization: Bearer <token>"
```

### Backup Status

```bash
# Check last backup
curl https://localhost:3333/api/backup/status \
  -H "Authorization: Bearer <token>"
```

---

## Support & Troubleshooting

### Vault won't start

```bash
# Check logs
tail -f data/vault.log

# Common issues:
# 1. Port 3333 already in use
# 2. Database locked
# 3. Certificate path incorrect
```

### Can't login to admin panel

```bash
# Reset admin password
npm run reset-admin

# Prompts for new password
```

### Lost access to vault

```bash
# Use master password from LastPass
# Or restore from encrypted backup

# See Disaster Recovery section
```

---

## License

Proprietary - Law Firm Internal Use Only

---

## Version

v1.0.0 - January 22, 2026
