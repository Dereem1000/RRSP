# apply-update.ps1
# Applies a new Restaurant System deployment package to an existing installation,
# preserving the client's runtime state (.env, database, backups).
#
# Run this from INSIDE the new deployment folder, pointing at the existing installation:
#
#   .\apply-update.ps1 -InstallPath "C:\RestaurantSystem"
#
# If -InstallPath is omitted, the script will ask interactively.
#
# What is REPLACED (new code from this package):
#   All .py application files, templates/, static/, database/, utils/, scripts/
#   run_production.bat, setup_secrets.py, install_dependencies.bat, requirements.txt
#   env.template
#
# What is PRESERVED (client's runtime state, never overwritten):
#   .env                    <- secrets, must survive
#   restaurant.db           <- live data
#   license_cache.json      <- offline license cache
#   backups/                <- client's backup folder
#   restaurant.db.backup_*  <- db snapshots

param(
    [string]$InstallPath = ""
)

$ErrorActionPreference = "Stop"
$packageDir = $PSScriptRoot   # This script lives inside the deployment package folder

Write-Host ""
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host "  Restaurant System -- Apply Update" -ForegroundColor Cyan
Write-Host "============================================================" -ForegroundColor Cyan
Write-Host ""

# ── Resolve installation path ─────────────────────────────────────────────────
if (-not $InstallPath) {
    Write-Host "Enter the path to the existing Restaurant System installation." -ForegroundColor White
    Write-Host "Example: C:\RestaurantSystem" -ForegroundColor DarkGray
    Write-Host ""
    $InstallPath = Read-Host "Installation path"
}

$InstallPath = $InstallPath.Trim().TrimEnd('\')

if (-not (Test-Path $InstallPath)) {
    Write-Host "[FATAL] Installation path not found: $InstallPath" -ForegroundColor Red
    exit 1
}

# Sanity check: the target looks like a Restaurant System installation
if (-not (Test-Path (Join-Path $InstallPath "app.py"))) {
    Write-Host "[FATAL] app.py not found in: $InstallPath" -ForegroundColor Red
    Write-Host "        This does not look like a Restaurant System installation." -ForegroundColor Red
    exit 1
}

Write-Host "Installation: $InstallPath" -ForegroundColor Cyan
Write-Host "Package:      $packageDir" -ForegroundColor Cyan
Write-Host ""

# ── Step 1: Stop running server ───────────────────────────────────────────────
Write-Host "[1/5] Checking for running server..." -ForegroundColor Yellow
$port5000 = Get-NetTCPConnection -LocalPort 5000 -State Listen -ErrorAction SilentlyContinue
if ($port5000) {
    $pid5000 = $port5000.OwningProcess | Select-Object -First 1
    $proc    = Get-Process -Id $pid5000 -ErrorAction SilentlyContinue
    if ($proc) {
        Write-Host "      Server process found: $($proc.Name) (PID $pid5000)" -ForegroundColor Yellow
        $answer = Read-Host "      Stop it now? [Y/n]"
        if ($answer -eq "" -or $answer -ieq "y") {
            Stop-Process -Id $pid5000 -Force
            Start-Sleep -Seconds 2
            Write-Host "      Server stopped." -ForegroundColor Green
        } else {
            Write-Host "      Skipped. Files in use may fail to copy." -ForegroundColor Yellow
        }
    }
} else {
    Write-Host "      No server running on port 5000." -ForegroundColor Green
}

# ── Step 2: Backup runtime state ──────────────────────────────────────────────
Write-Host "[2/5] Backing up runtime state..." -ForegroundColor Yellow
$ts        = Get-Date -Format "yyyyMMdd_HHmmss"
$backupDir = Join-Path $InstallPath "update-backup-$ts"
New-Item -ItemType Directory -Path $backupDir | Out-Null

$runtimeItems = @(
    ".env",
    "restaurant.db",
    "license_cache.json",
    "backups"
)
# Also capture any .backup_* db files
$dbBackups = Get-ChildItem -Path $InstallPath -Filter "restaurant.db.backup_*" -ErrorAction SilentlyContinue

foreach ($item in $runtimeItems) {
    $src = Join-Path $InstallPath $item
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination $backupDir -Recurse -Force
        Write-Host ("      Saved  " + $item) -ForegroundColor DarkGray
    }
}
foreach ($db in $dbBackups) {
    Copy-Item -Path $db.FullName -Destination $backupDir -Force
}

Write-Host "      Backup location: $backupDir" -ForegroundColor Green

# ── Step 3: Copy new application files ───────────────────────────────────────
Write-Host "[3/5] Installing new files..." -ForegroundColor Yellow

$deployableFiles = @(
    "app.py",
    "production_server.py",
    "simple_production.py",
    "wsgi_server.py",
    "database_manager.py",
    "database_server.py",
    "license_creation_middleware.py",
    "license_middleware.py",
    "license_registration.py",
    "license_security.py",
    "restaurant_license_validator.py",
    "run_production.bat",
    "setup_secrets.py",
    "apply-update.ps1",
    "install_dependencies.bat",
    "requirements.txt",
    "env.template",
    "database_icon.png",
    "start_waitress.py",
    "_launch_server.py",
    "_validate_env.py"
)

$deployableFolders = @(
    "database",
    "templates",
    "static",
    "utils",
    "scripts",
    "migrations"
)

foreach ($file in $deployableFiles) {
    $src = Join-Path $packageDir $file
    if (Test-Path $src) {
        Copy-Item -Path $src -Destination (Join-Path $InstallPath $file) -Force
        Write-Host ("      -> " + $file) -ForegroundColor DarkGray
    }
}

foreach ($folder in $deployableFolders) {
    $src  = Join-Path $packageDir $folder
    $dest = Join-Path $InstallPath $folder
    if (Test-Path $src) {
        # Remove old folder contents, then copy fresh
        if (Test-Path $dest) { Remove-Item $dest -Recurse -Force }
        Copy-Item -Path $src -Destination $dest -Recurse -Force
        # Strip __pycache__ from destination
        Get-ChildItem -Path $dest -Recurse -Directory -Filter "__pycache__" |
            ForEach-Object { Remove-Item $_.FullName -Recurse -Force }
        Write-Host ("      -> " + $folder + "/") -ForegroundColor DarkGray
    }
}

# ── Step 4: Confirm runtime state is intact ───────────────────────────────────
Write-Host "[4/5] Verifying runtime state is preserved..." -ForegroundColor Yellow

$preserved = @(".env", "restaurant.db")
$allOk = $true
foreach ($item in $preserved) {
    $p = Join-Path $InstallPath $item
    if (Test-Path $p) {
        Write-Host ("      OK  " + $item) -ForegroundColor Green
    } else {
        Write-Host ("      MISSING  " + $item + "  (was it present before?)") -ForegroundColor Yellow
        # Not fatal — a fresh install won't have these yet
    }
}

# ── Step 5: Summary ───────────────────────────────────────────────────────────
Write-Host "[5/5] Done." -ForegroundColor Yellow
Write-Host ""
Write-Host "============================================================" -ForegroundColor Green
Write-Host "  Update applied successfully." -ForegroundColor Green
Write-Host "============================================================" -ForegroundColor Green
Write-Host ""
Write-Host "Runtime state backup: $backupDir" -ForegroundColor Cyan
Write-Host ""
Write-Host "Next steps:" -ForegroundColor White
Write-Host "  1. If this is a fresh installation (no .env yet):" -ForegroundColor White
Write-Host "       cd `"$InstallPath`"" -ForegroundColor DarkGray
Write-Host "       python setup_secrets.py" -ForegroundColor DarkGray
Write-Host "  2. Start the system:" -ForegroundColor White
Write-Host "       run_production.bat" -ForegroundColor DarkGray
Write-Host "  3. Once confirmed working, you may delete the backup folder:" -ForegroundColor White
Write-Host "       $backupDir" -ForegroundColor DarkGray
Write-Host ""
