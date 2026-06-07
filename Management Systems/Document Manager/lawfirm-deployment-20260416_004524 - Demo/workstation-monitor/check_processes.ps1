# Quick check script for Python processes
$processIds = @(10264, 8232, 9392)
foreach ($processId in $processIds) {
    try {
        $proc = Get-Process -Id $processId -ErrorAction SilentlyContinue
        if ($proc) {
            $wmi = Get-CimInstance Win32_Process -Filter "ProcessId = $processId" -ErrorAction SilentlyContinue
            if ($wmi -and $wmi.CommandLine) {
                Write-Host "PID: $processId | Name: $($proc.ProcessName)"
                Write-Host "  Command: $($wmi.CommandLine)"
                Write-Host ""
                
                # Check if it's a workstation monitor process
                if ($wmi.CommandLine -match "main\.py" -or $wmi.CommandLine -match "gui_app\.py" -or 
                    $wmi.CommandLine -match "workstation-monitor") {
                    Write-Host "  *** THIS IS A WORKSTATION MONITOR PROCESS ***" -ForegroundColor Yellow
                    Write-Host ""
                }
            }
        }
    } catch {
        Write-Host "Could not access PID $processId"
    }
}
