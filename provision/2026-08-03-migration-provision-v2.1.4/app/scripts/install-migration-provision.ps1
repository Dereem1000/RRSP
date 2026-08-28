# Install a Computer Dynamics v2 MIGRATION provision package (live data move).
# Copies provision/<package>/app/ onto the install root and restores seed/data + license DB.

param(
    [Parameter(Mandatory = $true)]
    [string]$InstallRoot,

    [Parameter(Mandatory = $true)]
    [string]$PackageRoot,

    [switch]$FreshDatabase
)

$ErrorActionPreference = "Stop"

function Resolve-InstallPath([string]$p, [switch]$Create) {
    if ([string]::IsNullOrWhiteSpace($p)) { throw "Path is required." }
    $normalized = $p.Trim().TrimEnd('\', '/')
    if ($Create -and -not (Test-Path -LiteralPath $normalized)) {
        New-Item -ItemType Directory -Path $normalized -Force | Out-Null
    }
    $item = Resolve-Path -LiteralPath $normalized -ErrorAction Stop
    return $item.Path
}

function Copy-Tree([string]$Source, [string]$Dest, [scriptblock]$Skip) {
    if (-not (Test-Path -LiteralPath $Source)) { return }
    Get-ChildItem -Path $Source -Recurse -File | ForEach-Object {
        $relative = $_.FullName.Substring($Source.Length).TrimStart("\", "/")
        if ($Skip -and ($Skip.Invoke($relative))) {
            Write-Host "SKIP: $relative"
            return
        }
        $destPath = Join-Path $Dest $relative
        $destDir = Split-Path $destPath -Parent
        if (-not (Test-Path $destDir)) {
            New-Item -ItemType Directory -Path $destDir -Force | Out-Null
        }
        Copy-Item -LiteralPath $_.FullName -Destination $destPath -Force
        Write-Host "OK: $relative"
    }
}

$InstallRoot = Resolve-InstallPath $InstallRoot -Create
$PackageRoot = Resolve-InstallPath $PackageRoot

$layoutPath = Join-Path $PackageRoot "update-layout.json"
if (-not (Test-Path $layoutPath)) {
    Write-Error "Missing update-layout.json in package root."
}
$layout = Get-Content -LiteralPath $layoutPath -Raw -Encoding UTF8 | ConvertFrom-Json

$sourceSubdir = if ($layout.package_source_subdir) { $layout.package_source_subdir } else { "app" }
$source = Join-Path $PackageRoot $sourceSubdir
if (-not (Test-Path $source)) {
    Write-Error "Missing source folder: $source"
}

$runtimeRel = if ($layout.runtime_relative) { $layout.runtime_relative } else { "." }
$destRoot = Join-Path $InstallRoot $runtimeRel
New-Item -ItemType Directory -Path $destRoot -Force | Out-Null

Write-Host "Install root: $InstallRoot"
Write-Host "Runtime dest: $destRoot"
Write-Host "Source: $source"
Write-Host ""

Copy-Item -LiteralPath $layoutPath -Destination (Join-Path $InstallRoot "update-layout.json") -Force
Write-Host "OK: update-layout.json"

$skipDb = {
    param($relative)
    $n = ($relative -replace '\\', '/').TrimStart('/')
    return $n -match '\.(sqlite|db)(-wal|-shm)?$' -or $n -match '^data/'
}

Copy-Tree -Source $source -Dest $destRoot -Skip $skipDb

$seedData = Join-Path $PackageRoot "seed\data"
$dataRoot = Join-Path $InstallRoot "data"
New-Item -ItemType Directory -Path $dataRoot -Force | Out-Null

if (Test-Path -LiteralPath $seedData) {
    Copy-Tree -Source $seedData -Dest $dataRoot -Skip $null
}

$seedLicense = Join-Path $PackageRoot "seed\license_activation_system_new\instance\license_system.db"
if (Test-Path -LiteralPath $seedLicense) {
    $licenseDestDir = Join-Path $InstallRoot "license_activation_system_new\instance"
    New-Item -ItemType Directory -Path $licenseDestDir -Force | Out-Null
    $liveLicense = Join-Path $licenseDestDir "license_system.db"
    if ($FreshDatabase -or -not (Test-Path -LiteralPath $liveLicense)) {
        Copy-Item -LiteralPath $seedLicense -Destination $liveLicense -Force
        Write-Host "OK seed: license_system.db"
    } else {
        Write-Host "SKIP seed: existing license_system.db (use -FreshDatabase to replace)"
    }
}

$envMigrated = Join-Path $PackageRoot "seed\.env.migrated"
$envExample = Join-Path $PackageRoot ".env.example"
if (Test-Path -LiteralPath $envExample) {
    Copy-Item -LiteralPath $envExample -Destination (Join-Path $InstallRoot ".env.example") -Force
    Write-Host "OK: .env.example"
}
$liveEnv = Join-Path $InstallRoot ".env"
if (-not (Test-Path -LiteralPath $liveEnv)) {
    if (Test-Path -LiteralPath $envMigrated) {
        Copy-Item -LiteralPath $envMigrated -Destination $liveEnv -Force
        Write-Host "OK: .env created from seed/.env.migrated"
    } elseif (Test-Path -LiteralPath $envExample) {
        Copy-Item -LiteralPath $envExample -Destination $liveEnv -Force
        Write-Host "OK: .env created from .env.example (edit secrets before production)"
    }
}

$mdSrc = Join-Path $PackageRoot "MIGRATION-PROVISION.md"
if (Test-Path -LiteralPath $mdSrc) {
    Copy-Item -LiteralPath $mdSrc -Destination (Join-Path $InstallRoot "MIGRATION-PROVISION.md") -Force
}

if ($layout.post_apply -and $layout.post_apply.npm_install) {
    $workDir = $InstallRoot
    if ($layout.post_apply.working_directory_relative) {
        $workDir = Join-Path $InstallRoot $layout.post_apply.working_directory_relative
    }
    if (Test-Path -LiteralPath (Join-Path $workDir "package.json")) {
        Write-Host ""
        Write-Host "Running npm install in $workDir ..."
        Push-Location $workDir
        try {
            npm install --omit=dev
            if ($LASTEXITCODE -ne 0) { throw "npm install failed with exit code $LASTEXITCODE" }
        } finally {
            Pop-Location
        }
    }
}

Write-Host ""
Write-Host "Migration provision install complete."
Write-Host "Next: review .env, configure cloudflared on this machine if needed, run start-production.bat"
