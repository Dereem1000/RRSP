# Regenerate Caddyfile from MultiServer config.json and optionally validate/run Caddy.
param(
    [string]$ConfigPath = "e:\MultiServer\config.json",
    [int]$MainPort = 8000,
    [switch]$ValidateOnly,
    [switch]$Run
)

$ErrorActionPreference = "Stop"
$root = Split-Path $PSScriptRoot -Parent
$config = Join-Path $root "config.json"
if ($ConfigPath) { $config = $ConfigPath }

$env:PYTHONPATH = $root
python -c @"
from pathlib import Path
from multiserver.config import ConfigStore
from multiserver.urls import caddy_full_config

store = ConfigStore(Path(r'$config'))
text = caddy_full_config(store.settings, store.systems, main_backend_port=$MainPort)
out = Path(r'$PSScriptRoot') / 'Caddyfile'
out.write_text(text, encoding='utf-8')
print('Wrote', out)
"@

$caddyfile = Join-Path $PSScriptRoot "Caddyfile"
if ($ValidateOnly -or $Run) {
    caddy validate --config $caddyfile
}
if ($Run) {
    Write-Host "Starting Caddy (Ctrl+C to stop)..."
    caddy run --config $caddyfile
}
