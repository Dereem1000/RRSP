<#
.SYNOPSIS
  Junction CD data/pos-catalog-uploads/products -> POS server/uploads/products (catalog source of truth on CD disk).

.EXAMPLE
  .\scripts\link-pos-catalog-uploads.ps1
  .\scripts\link-pos-catalog-uploads.ps1 -PosRoot "E:\POS System"
#>
param(
    [string]$CdRoot = (Split-Path -Parent $PSScriptRoot),
    [string]$PosRoot = $env:POS_SYSTEM_ROOT
)

$ErrorActionPreference = 'Stop'

if (-not $PosRoot -or -not (Test-Path -LiteralPath $PosRoot)) {
    $PosRoot = 'E:\POS System'
}

$uploadsSrc = Join-Path $PosRoot 'server\uploads\products'
if (-not (Test-Path -LiteralPath $uploadsSrc)) {
    Write-Error "POS uploads folder not found: $uploadsSrc"
}

$parent = Join-Path $CdRoot 'data\pos-catalog-uploads'
$link = Join-Path $parent 'products'

New-Item -ItemType Directory -Force -Path $parent | Out-Null

if (Test-Path -LiteralPath $link) {
    $item = Get-Item -LiteralPath $link -Force
    if ($item.Attributes -band [IO.FileAttributes]::ReparsePoint) {
        Write-Host "Already linked: $link"
        exit 0
    }
    Write-Error "Path exists and is not a junction: $link"
}

cmd /c mklink /J `"$link`" `"$uploadsSrc`"
Write-Host "Linked $link -> $uploadsSrc"
