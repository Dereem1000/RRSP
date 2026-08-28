# Apply a Mini deploy package onto an existing MultiServer install.
# Copies app/ onto InstallRoot. Never overwrites config.json, manifests, logs, or Caddyfile.

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot
)

$ErrorActionPreference = "Stop"
$Source = Join-Path $PSScriptRoot "app"
if (-not (Test-Path -LiteralPath $Source)) {
    Write-Error "Missing app folder: $Source"
}

if (-not (Test-Path -LiteralPath $InstallRoot)) {
    Write-Error "Install root not found: $InstallRoot"
}
$InstallRoot = (Resolve-Path -LiteralPath $InstallRoot).Path

$preserveFiles = @(
    "config.json",
    "demos-manifest.json",
    "demo-pages.json",
    "DISTRIBUTION-MANIFEST.json",
    "Caddyfile"
)
$preserveDirs = @(
    "logs",
    ".git",
    "distributions",
    "__pycache__",
    ".venv",
    "venv",
    ".cursor",
    ".vscode"
)

function Test-ShouldSkip {
    param([string]$RelativePath)
    $normalized = ($RelativePath -replace "\\", "/").TrimStart("/")
    $name = Split-Path $normalized -Leaf
    if ($preserveFiles -contains $name -or $preserveFiles -contains $normalized) { return $true }
    if ($normalized -eq "deploy/Caddyfile" -or $normalized.EndsWith("/Caddyfile")) { return $true }
    $top = ($normalized -split "/")[0]
    if ($preserveDirs -contains $top) { return $true }
    if ($name -like "config.json.bak*") { return $true }
    return $false
}

$cfg = Join-Path $InstallRoot "config.json"
if (Test-Path -LiteralPath $cfg) {
    $stamp = Get-Date -Format "yyyyMMddHHmmss"
    Copy-Item -LiteralPath $cfg -Destination (Join-Path $InstallRoot "config.json.bak-$stamp") -Force
    Write-Host "Backed up config.json"
}

Write-Host "Updating MultiServer at: $InstallRoot"
Write-Host "Source: $Source"
Write-Host ""

Get-ChildItem -Path $Source -Recurse -File | ForEach-Object {
    $relative = $_.FullName.Substring($Source.Length).TrimStart("\", "/")
    if (Test-ShouldSkip -RelativePath $relative) {
        Write-Host "SKIP: $relative"
        return
    }
    $destPath = Join-Path $InstallRoot $relative
    $destDir = Split-Path $destPath -Parent
    if (-not (Test-Path -LiteralPath $destDir)) {
        New-Item -ItemType Directory -Path $destDir -Force | Out-Null
    }
    Copy-Item -LiteralPath $_.FullName -Destination $destPath -Force
    Write-Host "OK: $relative"
}

Write-Host ""
Write-Host "Update complete. Start with launch.bat"
Write-Host "If you use Caddy: powershell -File deploy\install-caddy.ps1"
