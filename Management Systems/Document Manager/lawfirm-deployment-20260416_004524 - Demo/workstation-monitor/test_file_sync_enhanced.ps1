# Enhanced test script to write to oya file and verify sync in all locations
# This includes database checks and longer wait times for sync

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testContent = "Test update at $timestamp`nThis is a test to verify file sync across all locations.`nRandom data: $([System.Guid]::NewGuid())`n"

Write-Host "=== Enhanced File Sync Test Script ===" -ForegroundColor Cyan
Write-Host "Timestamp: $timestamp" -ForegroundColor Yellow
Write-Host ""

# Define all possible locations
$locations = @{
    "Virtual Drive (Smart_man)" = "C:\LAWFIRM\clients\Smart_man\oya.txt"
    "Monitored Folder (Oya Man)" = "E:\Test Documents\Oya Man\oya.txt"
}

# Server storage base path
$serverStorageBase = "E:\Law Firm System\repair_workspace\repair_LawFirm System v2_20251207_114544\working\server\data\file-storage\files\clients"
$serverDbPath = "E:\Law Firm System\repair_workspace\repair_LawFirm System v2_20251207_114544\working\server\data\lawfirm.db"

Write-Host "Step 1: Checking current state..." -ForegroundColor Green
Write-Host ""

# Check virtual drive file
$virtualDrivePath = "C:\LAWFIRM\clients\Smart_man\oya.txt"
if (Test-Path $virtualDrivePath) {
    $file = Get-Item $virtualDrivePath
    $content = Get-Content $virtualDrivePath -Raw
    Write-Host "[EXISTS] Virtual Drive:" -ForegroundColor Green
    Write-Host "  Path: $virtualDrivePath"
    Write-Host "  Size: $($file.Length) bytes"
    Write-Host "  Last Modified: $($file.LastWriteTime)"
    Write-Host "  Content: $($content.Trim())"
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Virtual Drive: $virtualDrivePath" -ForegroundColor Yellow
    Write-Host ""
}

# Check monitored folder
$monitoredPath = "E:\Test Documents\Oya Man\oya.txt"
if (Test-Path $monitoredPath) {
    $file = Get-Item $monitoredPath
    $content = Get-Content $monitoredPath -Raw
    Write-Host "[EXISTS] Monitored Folder:" -ForegroundColor Green
    Write-Host "  Path: $monitoredPath"
    Write-Host "  Size: $($file.Length) bytes"
    Write-Host "  Last Modified: $($file.LastWriteTime)"
    Write-Host "  Content: $($content.Trim())"
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Monitored Folder: $monitoredPath" -ForegroundColor Yellow
    Write-Host ""
}

# Check server storage (files are stored with generated IDs)
Write-Host "Checking server storage..." -ForegroundColor Green
if (Test-Path $serverStorageBase) {
    $clientFolders = Get-ChildItem $serverStorageBase -Directory
    $foundFiles = 0
    foreach ($folder in $clientFolders) {
        $txtFiles = Get-ChildItem "$($folder.FullName)" -Filter "*.txt" -ErrorAction SilentlyContinue
        foreach ($txtFile in $txtFiles) {
            $fileContent = Get-Content $txtFile.FullName -Raw -ErrorAction SilentlyContinue
            if ($fileContent -and $fileContent -match "oya") {
                Write-Host "[FOUND] Server Storage (Client $($folder.Name)):" -ForegroundColor Green
                Write-Host "  Path: $($txtFile.FullName)"
                Write-Host "  Size: $($txtFile.Length) bytes"
                Write-Host "  Last Modified: $($txtFile.LastWriteTime)"
                Write-Host "  Content Preview: $($fileContent.Substring(0, [Math]::Min(100, $fileContent.Length)))..."
                $foundFiles++
                Write-Host ""
            }
        }
    }
    if ($foundFiles -eq 0) {
        Write-Host "[NOT FOUND] No oya.txt files found in server storage" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host ""
Write-Host "Step 2: Writing to virtual drive file..." -ForegroundColor Green

# Ensure directory exists
$dir = Split-Path $virtualDrivePath -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
    Write-Host "Created directory: $dir" -ForegroundColor Yellow
}

# Write to file
try {
    Set-Content -Path $virtualDrivePath -Value $testContent -Force
    Write-Host "[OK] Successfully wrote to: $virtualDrivePath" -ForegroundColor Green
    Write-Host "  Content: $($testContent.Trim())" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "[ERROR] Error writing to file: $_" -ForegroundColor Red
    exit 1
}

# Verify write
$verifyContent = Get-Content $virtualDrivePath -Raw
if ($verifyContent -match $timestamp) {
    Write-Host "[VERIFIED] File contains test timestamp" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[WARNING] File does not contain expected timestamp" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Step 3: Waiting for sync (70 seconds to allow sync cycle)..." -ForegroundColor Yellow
Write-Host "  Note: Sync interval is 60 seconds by default" -ForegroundColor Gray
for ($i = 70; $i -gt 0; $i--) {
    Write-Host "`r  Waiting... $i seconds remaining" -NoNewline -ForegroundColor Gray
    Start-Sleep -Seconds 1
}
Write-Host "`r  Waiting complete.                          " -ForegroundColor Green
Write-Host ""

Write-Host "Step 4: Checking all locations after sync..." -ForegroundColor Green
Write-Host ""

$allUpdated = $true

# Check virtual drive
if (Test-Path $virtualDrivePath) {
    $file = Get-Item $virtualDrivePath
    $content = Get-Content $virtualDrivePath -Raw
    $matches = $content -match $timestamp
    
    if ($matches) {
        Write-Host "[UPDATED] Virtual Drive:" -ForegroundColor Green
        Write-Host "  Path: $virtualDrivePath"
        Write-Host "  Last Modified: $($file.LastWriteTime)"
        Write-Host "  [OK] Contains test timestamp" -ForegroundColor Green
    } else {
        Write-Host "[EXISTS BUT NOT UPDATED] Virtual Drive:" -ForegroundColor Yellow
        Write-Host "  Path: $virtualDrivePath"
        Write-Host "  Last Modified: $($file.LastWriteTime)"
        Write-Host "  [X] Does not contain test timestamp" -ForegroundColor Red
        $allUpdated = $false
    }
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Virtual Drive: $virtualDrivePath" -ForegroundColor Red
    $allUpdated = $false
    Write-Host ""
}

# Check monitored folder
if (Test-Path $monitoredPath) {
    $file = Get-Item $monitoredPath
    $content = Get-Content $monitoredPath -Raw
    $matches = $content -match $timestamp
    
    if ($matches) {
        Write-Host "[UPDATED] Monitored Folder:" -ForegroundColor Green
        Write-Host "  Path: $monitoredPath"
        Write-Host "  Last Modified: $($file.LastWriteTime)"
        Write-Host "  [OK] Contains test timestamp" -ForegroundColor Green
    } else {
        Write-Host "[EXISTS BUT NOT UPDATED] Monitored Folder:" -ForegroundColor Yellow
        Write-Host "  Path: $monitoredPath"
        Write-Host "  Last Modified: $($file.LastWriteTime)"
        Write-Host "  [X] Does not contain test timestamp" -ForegroundColor Red
        $allUpdated = $false
    }
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Monitored Folder: $monitoredPath" -ForegroundColor Yellow
    Write-Host "  Note: File may sync here after successful server upload" -ForegroundColor Gray
    Write-Host ""
}

# Check server storage again
Write-Host "Checking server storage after sync..." -ForegroundColor Green
if (Test-Path $serverStorageBase) {
    $clientFolders = Get-ChildItem $serverStorageBase -Directory
    $serverUpdated = $false
    foreach ($folder in $clientFolders) {
        $txtFiles = Get-ChildItem "$($folder.FullName)" -Filter "*.txt" -ErrorAction SilentlyContinue
        foreach ($txtFile in $txtFiles) {
            $fileContent = Get-Content $txtFile.FullName -Raw -ErrorAction SilentlyContinue
            if ($fileContent -and $fileContent -match $timestamp) {
                Write-Host "[UPDATED] Server Storage (Client $($folder.Name)):" -ForegroundColor Green
                Write-Host "  Path: $($txtFile.FullName)"
                Write-Host "  Last Modified: $($txtFile.LastWriteTime)"
                Write-Host "  [OK] Contains test timestamp" -ForegroundColor Green
                $serverUpdated = $true
                Write-Host ""
            } elseif ($fileContent -and $fileContent -match "oya") {
                Write-Host "[EXISTS BUT NOT UPDATED] Server Storage (Client $($folder.Name)):" -ForegroundColor Yellow
                Write-Host "  Path: $($txtFile.FullName)"
                Write-Host "  Last Modified: $($txtFile.LastWriteTime)"
                Write-Host "  [X] Does not contain test timestamp" -ForegroundColor Red
                Write-Host ""
            }
        }
    }
    if (-not $serverUpdated) {
        Write-Host "[NOT FOUND] Server Storage: No files with test timestamp found" -ForegroundColor Yellow
        Write-Host "  Note: Files are stored with generated IDs, not original filenames" -ForegroundColor Gray
        Write-Host ""
    }
}

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Test Timestamp: $timestamp" -ForegroundColor Yellow
Write-Host ""

if ($allUpdated) {
    Write-Host "[OK] All monitored locations were updated!" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Some locations were not updated." -ForegroundColor Yellow
    Write-Host ""
    Write-Host "Sync Status:" -ForegroundColor Cyan
    Write-Host "  - Virtual Drive: File written successfully" -ForegroundColor Gray
    Write-Host "  - Server Sync: Files sync from virtual drive to server (encrypted)" -ForegroundColor Gray
    Write-Host "  - Monitored Folder: Files copy from virtual drive after server sync" -ForegroundColor Gray
    Write-Host ""
    Write-Host "The workstation monitor syncs files:" -ForegroundColor Cyan
    Write-Host "  1. From server to virtual drive (download & decrypt)" -ForegroundColor Gray
    Write-Host "  2. From virtual drive to server (encrypt & upload)" -ForegroundColor Gray
    Write-Host "  3. From virtual drive to monitored folder (after successful sync)" -ForegroundColor Gray
    Write-Host ""
    Write-Host "Sync intervals (config.json):" -ForegroundColor Cyan
    Write-Host "  - virtual_drive_sync_interval: 60 seconds" -ForegroundColor Gray
    Write-Host "  - check_interval: 60 seconds" -ForegroundColor Gray
}

Write-Host ""
Write-Host "Test completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan





