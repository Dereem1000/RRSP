# MultiServer Host mode elevated cleanup helper (optional).
# Prefer in-process cleanup when MultiServer is already elevated.
param(
    [string]$KeepPidsFile = ""
)

$ErrorActionPreference = "Continue"
$keep = @{}
if ($KeepPidsFile -and (Test-Path $KeepPidsFile)) {
    Get-Content $KeepPidsFile | ForEach-Object {
        $p = $_.Trim()
        if ($p -match '^\d+$') { $keep[[int]$p] = $true }
    }
}

$keepNames = @(
    'System','Idle','smss','csrss','wininit','services','lsass','svchost','dwm',
    'explorer','fontdrvhost','RuntimeBroker','sihost','taskhostw','conhost',
    'python','pythonw','node','ngrok','caddy','cloudflared','pm2','Cursor','Code',
    'WindowsTerminal','powershell','pwsh','cmd'
)

Get-Process -ErrorAction SilentlyContinue | ForEach-Object {
    $proc = $_
    if ($keep.ContainsKey($proc.Id)) { return }
    if ($proc.Id -le 4) { return }
    $n = $proc.ProcessName
    foreach ($k in $keepNames) {
        if ($n -ieq $k) { return }
    }
    try {
        # Only current user session processes
        $owner = (Get-CimInstance Win32_Process -Filter "ProcessId=$($proc.Id)" -ErrorAction SilentlyContinue |
            Invoke-CimMethod -MethodName GetOwner -ErrorAction SilentlyContinue)
        if ($owner -and $owner.User -and $owner.User -ne $env:USERNAME) { return }
        Stop-Process -Id $proc.Id -Force -ErrorAction SilentlyContinue
        Write-Host "Stopped $($proc.ProcessName) ($($proc.Id))"
    } catch {}
}
