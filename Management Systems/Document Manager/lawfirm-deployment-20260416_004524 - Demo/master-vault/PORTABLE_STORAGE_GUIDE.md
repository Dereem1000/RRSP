# Master Vault - Portable & Secure Storage Guide

## What Can Be Moved

✅ **Can be moved to external storage:**
- `data/vault.db` - Encrypted database (ALL secrets)
- `data/audit.log` - Access history
- `data/backups/` - Backup files
- `certs/` - TLS certificates
- Full `master-vault/` directory

❌ **Should stay on server:**
- `.env` file (server-specific configuration)
- `node_modules/` (npm dependencies)
- Deployment scripts

---

## Setup Options

### Option 1: USB Flash Drive (Recommended for Portability)

**Benefits:**
- Can run vault from any machine
- Portable between locations
- Can keep offline most of the time
- Easy to backup

**Setup:**
```bash
# 1. Format USB drive (Windows)
# - Insert USB drive
# - Right-click → Format
# - Choose: NTFS or exFAT
# - Name: "VAULT-ENCRYPTED"

# 2. Copy vault data to USB
# From master-vault directory:
cp -r data/* /media/usb-drive/vault-data/
cp -r certs/* /media/usb-drive/vault-certs/

# 3. On server, create symlink to USB
ln -s /media/usb-drive/vault-data ./data
ln -s /media/usb-drive/vault-certs ./certs

# 4. Start vault from USB
npm start
```

**Important:** Encrypt the USB drive itself:
```bash
# Windows - Use BitLocker
# Right-click drive → Turn on BitLocker
# Set strong password (store in LastPass)

# Linux - Use LUKS
sudo cryptsetup luksFormat /dev/sdX1
sudo cryptsetup luksOpen /dev/sdX1 vault-encrypted
# Mount and copy files
```

---

### Option 2: Encrypted External Hard Drive

**Benefits:**
- More storage capacity
- Can backup multiple copies
- Long-term archival storage
- Reliable for large deployments

**Setup:**
```bash
# 1. Encrypt external drive (BitLocker or VeraCrypt)

# 2. Mount encrypted drive
# Windows: BitLocker will ask for password on mount
# Linux: 
sudo cryptsetup luksOpen /dev/sdX1 vault-backup
sudo mount /dev/mapper/vault-backup /mnt/vault

# 3. Copy vault data
cp -r master-vault/data /mnt/vault/
cp -r master-vault/certs /mnt/vault/

# 4. Create vault directory structure on drive
mkdir -p /mnt/vault/vault-instance
cd /mnt/vault/vault-instance
npm install # Reinstall if needed

# 5. Run vault from external drive
npm start
```

**Backup Strategy:**
```
External Drive Structure:
├── vault-active/          # Running instance
│   ├── data/
│   ├── certs/
│   └── node_modules/
├── vault-backup-2026-01/  # Monthly backups
├── vault-backup-2026-02/
└── vault-archive/         # Yearly archives
```

---

### Option 3: Network Attached Storage (NAS)

**Benefits:**
- Centralized secure storage
- Can back up from multiple servers
- Professional-grade redundancy
- RAID protection

**Setup:**
```bash
# 1. NAS setup (assuming Synology/QNAP)
# - Create shared folder: /vault/
# - Enable encryption at folder level
# - Set restrictive permissions (admin only)

# 2. Mount NAS on server
# Linux:
sudo apt-get install cifs-utils
sudo mount -t cifs //nas-ip/vault /mnt/vault \
  -o username=admin,password=PASSWORD,uid=node,gid=node

# Windows PowerShell:
New-PSDrive -Name V -PSProvider FileSystem `
  -Root "\\nas-ip\vault" -Credential (Get-Credential)

# 3. Create symlinks
ln -s /mnt/vault/data ./data
ln -s /mnt/vault/certs ./certs

# 4. Start vault
npm start
```

**Recommended NAS Settings:**
```
Folder Permissions:
├── Share Permission: admin only
├── NTFS Permission: admin only
├── Encryption: AES-256
├── Versioning: Enabled (keep 30 versions)
└── Snapshot: Daily
```

---

### Option 4: Multi-Location Backup Strategy (Best Practice)

**Primary + Backup + Archive:**

```
LOCATION 1: Server (Running Instance)
├── data/ → symlink to USB drive
├── certs/ → on server
└── vault.db access → immediate

LOCATION 2: USB Flash Drive (Always Encrypted)
├── vault.db (backup copy)
├── audit.log (backup)
├── certs/
└── Status: Can run vault if server fails

LOCATION 3: External Hard Drive (Offline)
├── Monthly full backup of vault.db
├── Encrypted with BitLocker/VeraCrypt
├── Stored in physical safe
└── Status: Disaster recovery only

LOCATION 4: LastPass Vault (Master Password)
├── Master password stored
├── Accessible from anywhere
├── Backup password in safe
└── Status: Required to unlock vault
```

---

## Implementation Steps

### Step 1: Prepare External Storage

```bash
# Create encrypted USB drive (Windows)
1. Insert USB drive
2. Right-click → Manage BitLocker
3. Set very strong password (20+ chars)
4. Store password in LastPass
5. Wait for encryption to complete

# Or Linux with LUKS
sudo cryptsetup luksFormat --type luks2 /dev/sdX1
# Set password when prompted
sudo cryptsetup luksOpen /dev/sdX1 vault-usb
sudo mkfs.ext4 /dev/mapper/vault-usb
sudo mount /dev/mapper/vault-usb /mnt/vault-usb
```

### Step 2: Copy Vault Data

```bash
# Stop running vault (if any)
npm stop

# Create directories on USB
mkdir -p /mnt/vault-usb/vault-data
mkdir -p /mnt/vault-usb/vault-certs

# Copy vault database and certificates
cp -v master-vault/data/vault.db /mnt/vault-usb/vault-data/
cp -v master-vault/data/audit.log /mnt/vault-usb/vault-data/
cp -rv master-vault/certs/* /mnt/vault-usb/vault-certs/

# Verify copy completed
ls -lh /mnt/vault-usb/vault-data/
ls -lh /mnt/vault-usb/vault-certs/
```

### Step 3: Configure Server to Use External Storage

```bash
# Remove local data/certs directories
# (backup first!)
cp -rv master-vault/data master-vault/data.backup
rm -rf master-vault/data master-vault/certs

# Create symlinks to USB
cd master-vault
ln -s /mnt/vault-usb/vault-data ./data
ln -s /mnt/vault-usb/vault-certs ./certs

# Verify symlinks work
ls -la data/
ls -la certs/
# Should show: data -> /mnt/vault-usb/vault-data
```

### Step 4: Test Vault Startup

```bash
# Start vault with external storage
npm start

# In another terminal, verify vault is working
curl -k https://localhost:3333/health

# Should respond: {"status":"healthy",...}
```

### Step 5: Create Backup Copy

```bash
# Make backup of encrypted USB
# Windows: Use File Explorer to copy entire USB to external drive

# Or from Linux:
dd if=/dev/sdX1 of=vault-backup-2026-01-22.img
# Keep this .img file encrypted and offline
```

---

## USB Flash Drive Security

### Encrypt the USB Drive

**Windows (BitLocker):**
```
1. Insert USB drive
2. Right-click → "Manage BitLocker"
3. Click "Turn on BitLocker"
4. Choose: "Use a password"
5. Create VERY STRONG password (24+ characters)
6. Store password in LastPass
7. Allow encryption to complete (5-30 min)
```

**macOS (FileVault):**
```
1. Insert USB drive
2. Right-click → Encrypt
3. Set password
4. Store in LastPass
```

**Linux (LUKS):**
```bash
# Encrypt entire USB partition
sudo cryptsetup luksFormat /dev/sdX1

# When prompted, enter strong password
# Store password in LastPass

# To mount later:
sudo cryptsetup luksOpen /dev/sdX1 vault-usb
sudo mount /dev/mapper/vault-usb /mnt/vault-usb
```

### USB Security Best Practices

✅ **DO:**
- Encrypt entire drive (not just folder)
- Use strong password (store in LastPass)
- Keep drive physically secure
- Store in locked drawer/safe
- Periodically verify data integrity
- Create encrypted backup copies

❌ **DON'T:**
- Leave unencrypted USB on desk
- Share password via email
- Store password in plain text
- Leave USB in public places
- Use default passwords
- Forget where you stored it!

---

## Automate Backup to USB

### Linux/Mac - Automatic Daily Backup Script

```bash
#!/bin/bash
# backup-to-usb.sh

USB_MOUNT="/mnt/vault-usb"
VAULT_DATA="./master-vault/data"
VAULT_CERTS="./master-vault/certs"
TIMESTAMP=$(date +%Y-%m-%d-%H%M%S)

# Check if USB is mounted
if [ ! -d "$USB_MOUNT" ]; then
    echo "❌ USB drive not mounted"
    exit 1
fi

# Create backup directory
mkdir -p "$USB_MOUNT/backups/$TIMESTAMP"

# Backup vault database
cp "$VAULT_DATA/vault.db" "$USB_MOUNT/backups/$TIMESTAMP/"
cp "$VAULT_DATA/audit.log" "$USB_MOUNT/backups/$TIMESTAMP/"

# Verify backup
if [ -f "$USB_MOUNT/backups/$TIMESTAMP/vault.db" ]; then
    echo "✅ Backup created: $TIMESTAMP"
    echo "   Location: $USB_MOUNT/backups/$TIMESTAMP/"
else
    echo "❌ Backup failed"
    exit 1
fi

# Keep only last 30 backups
cd "$USB_MOUNT/backups"
ls -t | tail -n +31 | xargs rm -rf

echo "✅ Backup complete"
```

### Windows PowerShell - Automatic Backup

```powershell
# backup-to-usb.ps1

param(
    [string]$UsbDrivePath = "E:\",  # Change to your USB drive letter
    [string]$VaultDataPath = "C:\vault\master-vault\data",
    [string]$VaultCertsPath = "C:\vault\master-vault\certs"
)

$timestamp = Get-Date -Format "yyyy-MM-dd-HHmmss"
$backupPath = "$UsbDrivePath\backups\$timestamp"

# Create backup directory
New-Item -ItemType Directory -Path $backupPath -Force | Out-Null

# Copy vault files
Copy-Item "$VaultDataPath\vault.db" -Destination $backupPath
Copy-Item "$VaultDataPath\audit.log" -Destination $backupPath
Copy-Item "$VaultCertsPath\*" -Destination "$backupPath\certs" -Recurse

Write-Host "✅ Backup created: $timestamp"

# Cleanup old backups (keep last 30)
Get-ChildItem "$UsbDrivePath\backups" -Directory | 
    Sort-Object LastWriteTime -Descending | 
    Select-Object -Skip 30 | 
    Remove-Item -Recurse -Force
```

### Schedule Backup - Linux Cron

```bash
# Add to crontab: crontab -e
# Daily backup at 2 AM
0 2 * * * /path/to/backup-to-usb.sh

# Or weekly backups (Sunday at 3 AM)
0 3 * * 0 /path/to/backup-to-usb.sh
```

### Schedule Backup - Windows Task Scheduler

```powershell
# Create scheduled task
$action = New-ScheduledTaskAction -Execute "PowerShell.exe" `
    -Argument "-File C:\scripts\backup-to-usb.ps1"

$trigger = New-ScheduledTaskTrigger -Daily -At 2AM

Register-ScheduledTask -TaskName "Vault USB Backup" `
    -Action $action -Trigger $trigger -RunLevel Highest

# Verify task was created
Get-ScheduledTask -TaskName "Vault USB Backup"
```

---

## Recovery Procedures

### If Server Vault Fails

```bash
# 1. Verify USB drive is accessible
mount | grep vault-usb

# 2. Check vault database integrity
sqlite3 /mnt/vault-usb/vault-data/vault.db ".tables"

# 3. Restart vault (will use USB data)
cd master-vault
npm stop
npm start

# 4. Verify vault is working
curl -k https://localhost:3333/health
```

### If USB Drive Fails

```bash
# 1. Restore from encrypted backup image
dd if=vault-backup-2026-01-22.img of=/dev/sdX1

# 2. Or copy from external hard drive
cp /mnt/backup-drive/vault-data/vault.db ./master-vault/data/

# 3. Restart vault
npm restart
```

### If Master Password Lost

```
1. Open LastPass vault
2. Retrieve master password
3. Update MASTER_PASSWORD in .env
4. Restart vault

If LastPass also lost:
1. Use backup master password from physical safe
2. Same process
3. Contact AWS support if backed up in AWS KMS
```

---

## Monitoring & Verification

### Daily Health Check

```bash
# Check if USB mount is still accessible
mount | grep vault-usb || echo "USB not mounted!"

# Verify vault database is not corrupted
sqlite3 master-vault/data/vault.db "SELECT COUNT(*) FROM secrets;" 

# Check vault process
ps aux | grep "npm start"

# Test vault API
curl -k https://localhost:3333/health
```

### Weekly Integrity Check

```bash
# Verify USB file integrity
md5sum /mnt/vault-usb/vault-data/vault.db > /tmp/vault.md5
md5sum -c /tmp/vault.md5

# Check backup size hasn't grown unusually
du -sh /mnt/vault-usb/backups/

# Verify encryption still active (BitLocker)
manage-bde -status E:  # Windows
```

### Monthly Full Verification

```bash
# 1. Decrypt vault database and check contents
sqlite3 master-vault/data/vault.db ".schema"

# 2. Verify all secrets are accessible
curl -X POST https://localhost:3333/api/secret/get \
  -H "Authorization: Bearer <token>" \
  -d '{"name":"ENCRYPTION_MASTER_KEY"}'

# 3. Check audit log for suspicious activity
tail -100 master-vault/data/audit.log

# 4. Verify backup copies exist
ls -lh /mnt/vault-usb/backups/
```

---

## Storage Location Recommendations

### Home Office/Small Firm
```
Primary: USB drive in locked drawer at office
Backup: External HD encrypted, stored in safe deposit box
Archive: Keep in separate location (different building)
```

### Medium/Large Firm
```
Primary: NAS with RAID + encryption
Backup: USB drive encrypted, locked safe
Tertiary: External HD in off-site storage
Cloud: Encrypted backup in AWS S3 (optional)
```

### Enterprise Law Firm
```
Primary: NAS with redundant storage
Backup 1: USB drives (multiple encrypted copies)
Backup 2: External harddrives (multiple locations)
Archive: Cold storage (kept offline)
Cloud: AWS encrypted backups
Disaster Recovery: Full backup at separate location
```

---

## Summary

| Storage Type | Portability | Security | Best For |
|---|---|---|---|
| USB Flash Drive | ⭐⭐⭐⭐⭐ | ⭐⭐⭐ | Mobile, Quick Recovery |
| External HD | ⭐⭐⭐ | ⭐⭐⭐⭐ | Backup, Archive |
| NAS | ⭐⭐ | ⭐⭐⭐⭐⭐ | Enterprise, Redundancy |
| Cloud (Encrypted) | ⭐⭐⭐⭐ | ⭐⭐⭐⭐ | Geographic Distribution |

---

## Checklist

- [ ] Obtain encrypted USB drive or external storage
- [ ] Encrypt storage device with strong password
- [ ] Store encryption password in LastPass
- [ ] Create backup of vault data
- [ ] Copy vault to encrypted storage
- [ ] Create symlinks on server
- [ ] Test vault startup from external storage
- [ ] Verify vault API works
- [ ] Create automatic backup script
- [ ] Schedule daily backups
- [ ] Document recovery procedures
- [ ] Create offline master password backup
- [ ] Store physical backup in safe location
- [ ] Monthly integrity verification
- [ ] Test recovery procedure (quarterly)

---

## Version

v1.0 - January 22, 2026
