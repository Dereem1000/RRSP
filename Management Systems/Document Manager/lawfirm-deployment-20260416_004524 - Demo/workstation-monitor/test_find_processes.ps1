# Test script to find workstation monitor processes
$pythonProcesses = @()
try { $pythonProcesses += Get-Process python -ErrorAction SilentlyContinue } catch {}
try { $pythonProcesses += Get-Process pythonw -ErrorAction SilentlyContinue } catch {}

Write-Host "Found $($pythonProcesses.Count) Python process(es):" -ForegroundColor Yellow
Write-Host ""

foreach ($proc in $pythonProcesses) {
    try {
        $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $($proc.Id)" -ErrorAction SilentlyContinue
        if ($wmi -and $wmi.CommandLine) {
            $cmdLine = $wmi.CommandLine
            Write-Host "PID: $($proc.Id) | Name: $($proc.ProcessName)"
            Write-Host "  Command: $cmdLine"
            
            # Check if it's workstation monitor
            if ($cmdLine -match "gui_app\.py" -and -not $cmdLine -match "mini_docker") {
                Write-Host "  *** WORKSTATION MONITOR (gui_app.py) ***" -ForegroundColor Yellow
            } elseif ($cmdLine -match "main\.py") {
                Write-Host "  *** WORKSTATION MONITOR (main.py) ***" -ForegroundColor Yellow
            } else {
                Write-Host "  (Other Python app)" -ForegroundColor Gray
            }
            Write-Host ""
        }
    } catch {
        Write-Host "Could not access PID $($proc.Id)"
    }
}
