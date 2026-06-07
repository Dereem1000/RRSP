# PowerShell script to stop workstation monitor applications
# This script only stops workstation monitor processes, leaving other Python apps running

Write-Host "========================================" -ForegroundColor Cyan
Write-Host "Stopping Workstation Monitor Applications" -ForegroundColor Cyan
Write-Host "========================================" -ForegroundColor Cyan
Write-Host ""

# Get the script directory to identify workstation monitor processes
$scriptDir = Split-Path -Parent $MyInvocation.MyCommand.Path
$workstationMonitorPath = $scriptDir

# Workstation monitor specific script names
$workstationScripts = @(
    "main.py",
    "gui_app.py",
    "file_sync.py",
    "file_organizer.py",
    "virtual_drive_sync.py",
    "corruption_detector.py",
    "conflict_resolver.py",
    "tesseract_functions.py"
)

# Find all Python processes (python.exe, pythonw.exe)
$pythonProcesses = @()
try { 
    $procs = Get-Process python -ErrorAction SilentlyContinue
    if ($procs) { $pythonProcesses += $procs }
} catch {}
try { 
    $procs = Get-Process pythonw -ErrorAction SilentlyContinue
    if ($procs) { $pythonProcesses += $procs }
} catch {}

$stoppedCount = 0
$foundProcesses = @()

Write-Host "Scanning for workstation monitor Python processes..." -ForegroundColor Gray
Write-Host ""

foreach ($proc in $pythonProcesses) {
    try {
        # Get command line arguments for the process using WMI
        $wmiProcess = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
        
        if ($wmiProcess -and $wmiProcess.CommandLine) {
            $commandLine = $wmiProcess.CommandLine
            
            # Check if this is a workstation monitor process
            $isWorkstationMonitor = $false
            $matchReason = ""
            $matchedScript = ""
            
            # Check 1: Command line contains any workstation monitor script
            foreach ($script in $workstationScripts) {
                $scriptPattern = [regex]::Escape($script)
                if ($commandLine -match $scriptPattern) {
                    # Exclude mini_docker_gui.py explicitly
                    if ($script -eq "gui_app.py" -and $commandLine -match "mini_docker") {
                        continue
                    }
                    
                    # For gui_app.py and main.py, they are unique to workstation monitor
                    # Accept them even without full path validation
                    if ($script -eq "gui_app.py" -or $script -eq "main.py") {
                        # But still exclude if mini_docker is in the name
                        if ($commandLine -notmatch "mini_docker") {
                            $isWorkstationMonitor = $true
                            $matchedScript = $script
                            $matchReason = "Workstation script: $script"
                            break
                        }
                    }
                    # For other scripts, validate they're from workstation-monitor directory
                    elseif ($commandLine -match "workstation-monitor" -or $commandLine -match [regex]::Escape($workstationMonitorPath)) {
                        $isWorkstationMonitor = $true
                        $matchedScript = $script
                        $matchReason = "Workstation script: $script"
                        break
                    }
                }
            }
            
            # Check 2: Check for compiled executables
            if (-not $isWorkstationMonitor) {
                if ($proc.ProcessName -eq "LawFirm-WorkstationMonitor" -or 
                    $proc.ProcessName -eq "workstation-monitor") {
                    $isWorkstationMonitor = $true
                    $matchReason = "Workstation monitor executable"
                }
            }
            
            # Check 3: Check if running from workstation-monitor directory
            if (-not $isWorkstationMonitor -and $wmiProcess.ExecutablePath) {
                try {
                    $procDir = Split-Path -Parent $wmiProcess.ExecutablePath
                    # Check if process is running from workstation-monitor directory
                    if ($procDir -eq $workstationMonitorPath -or 
                        $procDir -like "*workstation-monitor*") {
                        # Check if any workstation script is in the command line
                        foreach ($script in $workstationScripts) {
                            $scriptPattern = [regex]::Escape($script)
                            if ($commandLine -match $scriptPattern) {
                                $isWorkstationMonitor = $true
                                $matchedScript = $script
                                $matchReason = "Running from workstation directory: $script"
                                break
                            }
                        }
                    }
                } catch {}
            }
            
            # Check 4: Check for "workstation" or "monitor" in command line arguments (case-insensitive)
            if (-not $isWorkstationMonitor) {
                if ($commandLine -match "workstation-monitor" -or 
                    ($commandLine -match "workstation.*monitor" -and $commandLine -notmatch "mini_docker")) {
                    # Additional validation: check if running from this directory
                    if ($commandLine -match [regex]::Escape($workstationMonitorPath)) {
                        $isWorkstationMonitor = $true
                        $matchReason = "Path match: workstation-monitor directory"
                    }
                }
            }
            
            if ($isWorkstationMonitor) {
                $cmdPreview = $commandLine
                if ($cmdPreview.Length -gt 120) {
                    $cmdPreview = $cmdPreview.Substring(0, 120) + "..."
                }
                $foundProcesses += [PSCustomObject]@{
                    PID = $proc.Id
                    Name = $proc.ProcessName
                    Reason = $matchReason
                    Command = $cmdPreview
                }
            }
        }
    } catch {
        # Skip processes we can't access
        continue
    }
}

if ($foundProcesses.Count -eq 0) {
    Write-Host "No workstation monitor processes found running." -ForegroundColor Green
    Write-Host ""
    Write-Host "Other Python applications are still running." -ForegroundColor Cyan
    exit 0
}

Write-Host "Found $($foundProcesses.Count) workstation monitor process(es):" -ForegroundColor Yellow
Write-Host ""

foreach ($procInfo in $foundProcesses) {
    Write-Host "  PID: $($procInfo.PID) | Name: $($procInfo.Name) | Reason: $($procInfo.Reason)" -ForegroundColor Cyan
    Write-Host "    Command: $($procInfo.Command)" -ForegroundColor Gray
    Write-Host ""
}

Write-Host "Stopping processes..." -ForegroundColor Yellow
Write-Host ""

foreach ($procInfo in $foundProcesses) {
    try {
        $proc = Get-Process -Id $procInfo.PID -ErrorAction SilentlyContinue
        if ($proc) {
            # Try graceful shutdown first
            if ($proc.MainWindowHandle -ne [IntPtr]::Zero) {
                Write-Host "  Attempting graceful shutdown for PID $($procInfo.PID)..." -ForegroundColor Gray
                $proc.CloseMainWindow() | Out-Null
                Start-Sleep -Milliseconds 1000
            }
            
            # Check if still running
            $proc = Get-Process -Id $procInfo.PID -ErrorAction SilentlyContinue
            if ($proc) {
                Write-Host "  Force stopping PID $($procInfo.PID)..." -ForegroundColor Yellow
                Stop-Process -Id $procInfo.PID -Force -ErrorAction Stop
                Start-Sleep -Milliseconds 500
            }
            
            # Verify it's stopped
            $proc = Get-Process -Id $procInfo.PID -ErrorAction SilentlyContinue
            if (-not $proc) {
                Write-Host "  Successfully stopped PID $($procInfo.PID)" -ForegroundColor Green
                $stoppedCount++
            } else {
                Write-Host "  Failed to stop PID $($procInfo.PID) (may require admin privileges)" -ForegroundColor Red
            }
        } else {
            Write-Host "  Process PID $($procInfo.PID) already terminated" -ForegroundColor Gray
        }
    } catch {
        Write-Host "  Error stopping PID $($procInfo.PID): $_" -ForegroundColor Red
    }
}

Write-Host ""
if ($stoppedCount -gt 0) {
    Write-Host "Successfully stopped $stoppedCount workstation monitor process(es)." -ForegroundColor Green
} else {
    Write-Host "No processes were stopped (they may have already been terminated)." -ForegroundColor Yellow
}

Write-Host ""
Write-Host "Other Python applications are still running." -ForegroundColor Cyan
