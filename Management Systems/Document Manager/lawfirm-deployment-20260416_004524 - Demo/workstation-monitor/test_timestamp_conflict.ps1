# Test script for timestamp-based conflict resolution
# This test verifies that files with newer timestamps take precedence

$testStartTime = Get-Date
$timestamp1 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testContent1 = "TIMESTAMP TEST - First write at $timestamp1`nThis is the first version.`nRandom: $([System.Guid]::NewGuid())`n"

Write-Host "=== Timestamp Conflict Resolution Test ===" -ForegroundColor Cyan
Write-Host "Test Start: $testStartTime" -ForegroundColor Yellow
Write-Host "Conflict Resolution: timestamp" -ForegroundColor Yellow
Write-Host ""

$virtualDrivePath = "C:\LAWFIRM\clients\Smart_man\oya.txt"
$monitoredPath = "E:\Test Documents\Oya Man\oya.txt"
$serverStorageBase = "E:\Law Firm System\repair_workspace\repair_LawFirm System v2_20251207_114544\working\server\data\file-storage\files\clients"

Write-Host "Step 1: Checking current file state..." -ForegroundColor Green
if (Test-Path $virtualDrivePath) {
    $file = Get-Item $virtualDrivePath
    $content = Get-Content $virtualDrivePath -Raw
    Write-Host "[EXISTS] Virtual Drive:" -ForegroundColor Green
    Write-Host "  Path: $virtualDrivePath"
    Write-Host "  Size: $($file.Length) bytes"
    Write-Host "  Last Modified: $($file.LastWriteTime)"
    Write-Host "  Content: $($content.Trim().Substring(0, [Math]::Min(80, $content.Length)))..."
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Virtual Drive: $virtualDrivePath" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "Step 2: Writing FIRST version to virtual drive..." -ForegroundColor Green
$dir = Split-Path $virtualDrivePath -Parent
if (-not (Test-Path $dir)) {
    New-Item -ItemType Directory -Path $dir -Force | Out-Null
}

try {
    Set-Content -Path $virtualDrivePath -Value $testContent1 -Force
    # Set explicit timestamp
    $file1 = Get-Item $virtualDrivePath
    $file1.LastWriteTime = $testStartTime
    Write-Host "[OK] Wrote first version at: $($file1.LastWriteTime)" -ForegroundColor Green
    Write-Host "  Content: $($testContent1.Trim())" -ForegroundColor Gray
    Write-Host ""
} catch {
    Write-Host "[ERROR] Error writing file: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Step 3: Waiting 5 seconds, then writing SECOND version (newer timestamp)..." -ForegroundColor Yellow
Start-Sleep -Seconds 5

$timestamp2 = Get-Date -Format "yyyy-MM-dd HH:mm:ss"
$testContent2 = "TIMESTAMP TEST - Second write at $timestamp2`nThis is the NEWER version (should win).`nRandom: $([System.Guid]::NewGuid())`n"
$testStartTime2 = Get-Date

try {
    Set-Content -Path $virtualDrivePath -Value $testContent2 -Force
    # Set explicit newer timestamp
    $file2 = Get-Item $virtualDrivePath
    $file2.LastWriteTime = $testStartTime2
    Write-Host "[OK] Wrote second version at: $($file2.LastWriteTime)" -ForegroundColor Green
    Write-Host "  Content: $($testContent2.Trim())" -ForegroundColor Gray
    Write-Host "  Timestamp difference: $(($testStartTime2 - $testStartTime).TotalSeconds) seconds" -ForegroundColor Cyan
    Write-Host ""
} catch {
    Write-Host "[ERROR] Error writing second version: $_" -ForegroundColor Red
    exit 1
}

Write-Host "Step 4: Verifying file has newer content..." -ForegroundColor Green
$verifyContent = Get-Content $virtualDrivePath -Raw
if ($verifyContent -match $timestamp2) {
    Write-Host "[VERIFIED] File contains newer timestamp ($timestamp2)" -ForegroundColor Green
    Write-Host ""
} else {
    Write-Host "[WARNING] File does not contain expected newer timestamp" -ForegroundColor Yellow
    Write-Host "  Current content: $($verifyContent.Trim().Substring(0, [Math]::Min(100, $verifyContent.Length)))..." -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Step 5: Waiting for sync cycle (70 seconds)..." -ForegroundColor Yellow
Write-Host "  Note: This allows time for:" -ForegroundColor Gray
Write-Host "    1. Upload to server (virtual drive -> server)" -ForegroundColor Gray
Write-Host "    2. Download from server (server -> virtual drive)" -ForegroundColor Gray
Write-Host "    3. Copy to monitored folder (virtual drive -> monitored)" -ForegroundColor Gray
Write-Host ""

for ($i = 70; $i -gt 0; $i--) {
    if ($i % 10 -eq 0) {
        Write-Host "`r  Waiting... $i seconds remaining (sync should preserve newer timestamp)" -NoNewline -ForegroundColor Gray
    }
    Start-Sleep -Seconds 1
}
Write-Host "`r  Waiting complete.                                                          " -ForegroundColor Green
Write-Host ""

Write-Host "Step 6: Checking all locations after sync..." -ForegroundColor Green
Write-Host ""

# Check virtual drive
Write-Host "--- Virtual Drive ---" -ForegroundColor Cyan
if (Test-Path $virtualDrivePath) {
    $file = Get-Item $virtualDrivePath
    $content = Get-Content $virtualDrivePath -Raw
    $hasNewer = $content -match $timestamp2
    $hasOlder = $content -match $timestamp1
    
    Write-Host "Path: $virtualDrivePath" -ForegroundColor White
    Write-Host "Last Modified: $($file.LastWriteTime)" -ForegroundColor White
    Write-Host "Size: $($file.Length) bytes" -ForegroundColor White
    
    if ($hasNewer) {
        Write-Host "[OK] Contains NEWER timestamp ($timestamp2)" -ForegroundColor Green
        Write-Host "  Result: Timestamp-based resolution preserved newer version" -ForegroundColor Green
    } elseif ($hasOlder) {
        Write-Host "[WARNING] Contains OLDER timestamp ($timestamp1)" -ForegroundColor Yellow
        Write-Host "  Result: Older version was kept (server may have overwritten)" -ForegroundColor Yellow
    } else {
        Write-Host "[UNKNOWN] Contains neither test timestamp" -ForegroundColor Yellow
        Write-Host "  Content: $($content.Trim().Substring(0, [Math]::Min(100, $content.Length)))..." -ForegroundColor Gray
    }
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Virtual Drive file" -ForegroundColor Red
    Write-Host ""
}

# Check monitored folder
Write-Host "--- Monitored Folder ---" -ForegroundColor Cyan
if (Test-Path $monitoredPath) {
    $file = Get-Item $monitoredPath
    $content = Get-Content $monitoredPath -Raw
    $hasNewer = $content -match $timestamp2
    $hasOlder = $content -match $timestamp1
    
    Write-Host "Path: $monitoredPath" -ForegroundColor White
    Write-Host "Last Modified: $($file.LastWriteTime)" -ForegroundColor White
    Write-Host "Size: $($file.Length) bytes" -ForegroundColor White
    
    if ($hasNewer) {
        Write-Host "[OK] Contains NEWER timestamp ($timestamp2)" -ForegroundColor Green
    } elseif ($hasOlder) {
        Write-Host "[WARNING] Contains OLDER timestamp ($timestamp1)" -ForegroundColor Yellow
    } else {
        Write-Host "[UNKNOWN] Contains neither test timestamp" -ForegroundColor Yellow
    }
    Write-Host ""
} else {
    Write-Host "[NOT FOUND] Monitored folder file (may sync after server upload)" -ForegroundColor Yellow
    Write-Host ""
}

# Check server storage
Write-Host "--- Server Storage ---" -ForegroundColor Cyan
if (Test-Path $serverStorageBase) {
    $clientFolders = Get-ChildItem $serverStorageBase -Directory
    $found = $false
    foreach ($folder in $clientFolders) {
        $txtFiles = Get-ChildItem "$($folder.FullName)" -Filter "*.txt" -ErrorAction SilentlyContinue
        foreach ($txtFile in $txtFiles) {
            $fileContent = Get-Content $txtFile.FullName -Raw -ErrorAction SilentlyContinue
            if ($fileContent -and ($fileContent -match "TIMESTAMP TEST")) {
                $hasNewer = $fileContent -match $timestamp2
                $hasOlder = $fileContent -match $timestamp1
                
                Write-Host "Path: $($txtFile.FullName)" -ForegroundColor White
                Write-Host "Last Modified: $($txtFile.LastWriteTime)" -ForegroundColor White
                Write-Host "Size: $($txtFile.Length) bytes" -ForegroundColor White
                
                if ($hasNewer) {
                    Write-Host "[OK] Contains NEWER timestamp ($timestamp2)" -ForegroundColor Green
                } elseif ($hasOlder) {
                    Write-Host "[WARNING] Contains OLDER timestamp ($timestamp1)" -ForegroundColor Yellow
                } else {
                    Write-Host "[UNKNOWN] Contains test marker but neither timestamp" -ForegroundColor Yellow
                }
                $found = $true
                Write-Host ""
            }
        }
    }
    if (-not $found) {
        Write-Host "[NOT FOUND] No test files found in server storage" -ForegroundColor Yellow
        Write-Host "  Note: Files are stored with generated IDs" -ForegroundColor Gray
        Write-Host ""
    }
} else {
    Write-Host "[NOT FOUND] Server storage base path" -ForegroundColor Yellow
    Write-Host ""
}

Write-Host "=== Test Summary ===" -ForegroundColor Cyan
Write-Host "Test Configuration:" -ForegroundColor Yellow
Write-Host "  Conflict Resolution: timestamp" -ForegroundColor White
Write-Host "  First Write Time: $timestamp1" -ForegroundColor White
Write-Host "  Second Write Time: $timestamp2" -ForegroundColor White
Write-Host "  Time Difference: $(($testStartTime2 - $testStartTime).TotalSeconds) seconds" -ForegroundColor White
Write-Host ""

Write-Host "Expected Behavior:" -ForegroundColor Yellow
Write-Host "  With timestamp-based conflict resolution:" -ForegroundColor White
Write-Host "    - Newer file (by modification time) should take precedence" -ForegroundColor Gray
Write-Host "    - If local file is newer, it should upload to server" -ForegroundColor Gray
Write-Host "    - If server file is newer, it should download to local" -ForegroundColor Gray
Write-Host ""

Write-Host "Note:" -ForegroundColor Yellow
Write-Host "  The timestamp conflict resolution may not be fully implemented yet." -ForegroundColor Gray
Write-Host "  Check the conflict_resolver.py and virtual_drive_sync.py for implementation." -ForegroundColor Gray
Write-Host ""

Write-Host "Test completed at: $(Get-Date -Format 'yyyy-MM-dd HH:mm:ss')" -ForegroundColor Cyan





