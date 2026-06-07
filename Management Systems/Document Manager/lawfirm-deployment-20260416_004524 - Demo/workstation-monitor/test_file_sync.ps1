# Test script to write to oya file and verify sync in all locations
# This script writes to the file and checks all sync locations

$timestamp = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testContent = "Test update at $timestamp`nThis is a test to verify file sync across all locations.`n"

Write-Host "=== File Sync Test Script ===" -ForegroundColor Cyan
Write-Host "Timestamp: $timestamp" -ForegroundColor Yellow
Write-Host ""

# Define all possible locations
$locations = @{
    "Virtual Drive" = "C:\LAWFIRM\clients\Smart_man\oya.txt"
    "Monitored Folder (Oya Man)" = "E:\Test Documents\Oya Man\oya.txt"
    "Monitored Folder (smartman)" = "E:\Test Documents\smartman\oya.txt"
}

# Check server storage location (need to find client ID)
$serverStorageBase = "E:\Law Firm System\repair_workspace\repair_LawFirm System v2_20251207_114544\working\server\data\file-storage\files\clients"

Write-Host "Step 1: Checking current state of files..." -ForegroundColor Green
Write-Host ""

foreach ($location in $locations.GetEnumerator()) {
    $path = $location.Value
    if (Test-Path $path) {
        $file = Get-Item $path
        $content = Get-Content $path -Raw
        Write-Host "[EXISTS] $($location.Key):" -ForegroundColor Green
        Write-Host "  Path: $path"
        Write-Host "  Size: $($file.Length) bytes"
        Write-Host "  Last Modified: $($file.LastWriteTime)"
        Write-Host "  Content Preview: $($content.Substring(0, [Math]::Min(50, $content.Length)))..."
        Write-Host ""
    } else {
        Write-Host "[NOT FOUND] $($location.Key): $path" -ForegroundColor Yellow
        Write-Host ""
    }
}

# Check server storage
Write-Host "Checking server storage locations..." -ForegroundColor Green
if (Test-Path $serverStorageBase) {
    $clientFolders = Get-ChildItem $serverStorageBase -Directory
    foreach ($folder in $clientFolders) {
        $oyaFile = Get-ChildItem "$($folder.FullName)\oya.txt" -ErrorAction SilentlyContinue
        if ($oyaFile) {
            Write-Host "[EXISTS] Server Storage (Client $($folder.Name)):" -ForegroundColor Green
            Write-Host "  Path: $($oyaFile.FullName)"
            Write-Host "  Size: $($oyaFile.Length) bytes"
            Write-Host "  Last Modified: $($oyaFile.LastWriteTime)"
            Write-Host ""
        }
    }
}

Write-Host ""
Write-Host "Step 2: Writing to virtual drive file..." -ForegroundColor Green
$virtualDrivePath = "C:\LAWFIRM\clients\Smart_man\oya.txt"

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
} catch {
    Write-Host "[ERROR] Error writing to file: $_" -ForegroundColor Red
    exit 1
}

Write-Host ""
Write-Host "Step 3: Waiting 5 seconds for sync to process..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

Write-Host ""
Write-Host "Step 4: Checking all locations again..." -ForegroundColor Green
Write-Host ""

$allUpdated = $true
foreach ($location in $locations.GetEnumerator()) {
    $path = $location.Value
    if (Test-Path $path) {
        $file = Get-Item $path
        $content = Get-Content $path -Raw
        $matches = $content -match $timestamp
        
        if ($matches) {
            Write-Host "[UPDATED] $($location.Key):" -ForegroundColor Green
            Write-Host "  Path: $path"
            Write-Host "  Last Modified: $($file.LastWriteTime)"
            Write-Host "  [OK] Contains test timestamp" -ForegroundColor Green
        } else {
            Write-Host "[EXISTS BUT NOT UPDATED] $($location.Key):" -ForegroundColor Yellow
            Write-Host "  Path: $path"
            Write-Host "  Last Modified: $($file.LastWriteTime)"
            Write-Host "  [X] Does not contain test timestamp" -ForegroundColor Red
            $allUpdated = $false
        }
        Write-Host ""
    } else {
        Write-Host "[NOT FOUND] $($location.Key): $path" -ForegroundColor Yellow
        Write-Host "  [X] File not found in this location" -ForegroundColor Red
        $allUpdated = $false
        Write-Host ""
    }
}

# Check server storage again
Write-Host "Checking server storage again..." -ForegroundColor Green
if (Test-Path $serverStorageBase) {
    $clientFolders = Get-ChildItem $serverStorageBase -Directory
    $serverUpdated = $false
    foreach ($folder in $clientFolders) {
        $oyaFile = Get-ChildItem "$($folder.FullName)\oya.txt" -ErrorAction SilentlyContinue
        if ($oyaFile) {
            $content = Get-Content $oyaFile.FullName -Raw -ErrorAction SilentlyContinue
            $matches = $content -match $timestamp
            
            if ($matches) {
                Write-Host "[UPDATED] Server Storage (Client $($folder.Name)):" -ForegroundColor Green
                Write-Host "  Path: $($oyaFile.FullName)"
                Write-Host "  Last Modified: $($oyaFile.LastWriteTime)"
                Write-Host "  [OK] Contains test timestamp" -ForegroundColor Green
                $serverUpdated = $true
            } else {
                Write-Host "[EXISTS BUT NOT UPDATED] Server Storage (Client $($folder.Name)):" -ForegroundColor Yellow
                Write-Host "  Path: $($oyaFile.FullName)"
                Write-Host "  Last Modified: $($oyaFile.LastWriteTime)"
                Write-Host "  [X] Does not contain test timestamp" -ForegroundColor Red
            }
            Write-Host ""
        }
    }
    if (-not $serverUpdated) {
        Write-Host "[NOT FOUND] Server Storage: oya.txt not found in any client folder" -ForegroundColor Yellow
        Write-Host ""
    }
}

Write-Host ""
Write-Host "=== Test Summary ===" -ForegroundColor Cyan
if ($allUpdated) {
    Write-Host "[OK] All monitored locations were updated!" -ForegroundColor Green
} else {
    Write-Host "[WARNING] Some locations were not updated. Sync may need to run." -ForegroundColor Yellow
    Write-Host "  Note: Files sync automatically when the workstation monitor is running." -ForegroundColor Gray
    Write-Host "  The sync interval is configured in config.json (default: 60 seconds)." -ForegroundColor Gray
}

Write-Host ""
Write-Host "Test completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan

