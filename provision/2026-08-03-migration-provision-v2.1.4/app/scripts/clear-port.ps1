param(
  [Parameter(Mandatory = $true)]
  [int]$Port
)

$pids = New-Object 'System.Collections.Generic.HashSet[int]'
foreach ($line in (netstat -ano)) {
  if ($line -notmatch 'LISTENING') { continue }
  $parts = ($line.Trim() -split '\s+')
  if ($parts.Length -lt 4) { continue }
  $local = $parts[1]
  # local address must end with :<port> (IPv4 or IPv6)
  if ($local -notmatch ":${Port}$") { continue }
  $procId = 0
  if (-not [int]::TryParse($parts[-1], [ref]$procId)) { continue }
  if ($procId -gt 0) { [void]$pids.Add($procId) }
}

foreach ($procId in $pids) {
  Write-Host "  Clearing PID $procId on port $Port..."
  & taskkill.exe /PID $procId /T /F 2>$null | Out-Null
}
