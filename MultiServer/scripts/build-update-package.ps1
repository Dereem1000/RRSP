# Build a dated MultiServer update package for existing installations.
param(
    [string]$Version = "",
    [string]$BuildDate = ""
)

$ErrorActionPreference = "Stop"
$Root = Split-Path -Parent $PSScriptRoot
$PreservesPath = Join-Path $Root "distributions\update-preserves.json"

if (-not (Test-Path $PreservesPath)) {
    throw "Missing $PreservesPath"
}
$Preserves = Get-Content $PreservesPath -Raw | ConvertFrom-Json

if (-not $Version) {
    $init = Get-Content (Join-Path $Root "multiserver\__init__.py") -Raw
    if ($init -match '__version__\s*=\s*"([^"]+)"') {
        $Version = $Matches[1]
    } else {
        throw "Could not read __version__ from multiserver/__init__.py"
    }
}

if (-not $BuildDate) {
    $BuildDate = Get-Date -Format "yyyyMMdd"
}

$PackageName = "MultiServer-Update_v${Version}_${BuildDate}"
$OutDir = Join-Path $Root "distributions\$PackageName"
$Payload = Join-Path $OutDir "payload"

if (Test-Path $OutDir) {
    Remove-Item $OutDir -Recurse -Force
}
New-Item -ItemType Directory -Path $Payload -Force | Out-Null

$Include = @(
    "multiserver",
    "deploy",
    "scripts",
    "launch.bat",
    "run.py",
    "requirements.txt",
    "README.md"
)

foreach ($item in $Include) {
    $src = Join-Path $Root $item
    if (-not (Test-Path $src)) {
        throw "Missing source path: $src"
    }
    $dest = Join-Path $Payload $item
    if (Test-Path $src -PathType Container) {
        Copy-Item $src $dest -Recurse -Force
    } else {
        $destParent = Split-Path $dest -Parent
        if (-not (Test-Path $destParent)) {
            New-Item -ItemType Directory -Path $destParent -Force | Out-Null
        }
        Copy-Item $src $dest -Force
    }
}

Get-ChildItem $Payload -Recurse -Directory -Filter "__pycache__" | Remove-Item -Recurse -Force -ErrorAction SilentlyContinue
Get-ChildItem $Payload -Recurse -Filter "*.pyc" | Remove-Item -Force -ErrorAction SilentlyContinue

function Remove-PayloadMatches {
    param([string[]]$Names)
    foreach ($name in $Names) {
        $normalized = $name -replace '\\', '/'
        if ($normalized -match '/') {
            $relative = $normalized
            $full = Join-Path $Payload ($relative -replace '/', '\')
            if (Test-Path $full) {
                Write-Warning "Removing from payload: $relative"
                Remove-Item $full -Recurse -Force
            }
            continue
        }
        Get-ChildItem $Payload -Recurse -Force -ErrorAction SilentlyContinue |
            Where-Object { $_.Name -ceq $name } |
            ForEach-Object {
                Write-Warning "Removing from payload: $($_.FullName.Substring($Payload.Length + 1))"
                Remove-Item $_.FullName -Recurse -Force
            }
    }
}

Remove-PayloadMatches -Names @($Preserves.excludeFromPayload)

$leftover = @()
foreach ($name in @($Preserves.verifyAbsentFromPayload)) {
    $normalized = $name -replace '\\', '/'
    if ($normalized -match '/') {
        $full = Join-Path $Payload ($normalized -replace '/', '\')
        if (Test-Path $full) { $leftover += $name }
    } else {
        $hit = Get-ChildItem $Payload -Recurse -Filter $name -ErrorAction SilentlyContinue
        if ($hit) { $leftover += $name }
    }
}
if ($leftover.Count -gt 0) {
    throw "Payload still contains instance-specific files: $($leftover -join ', '). Aborting build."
}

$IsoDate = if ($BuildDate -match '^(\d{4})(\d{2})(\d{2})$') {
    "$($Matches[1])-$($Matches[2])-$($Matches[3])"
} else {
    (Get-Date -Format "yyyy-MM-dd")
}

$RobocopyXf = @($Preserves.preserveOnTarget.files + $Preserves.preserveOnTarget.filePatterns) -join ' '
$RobocopyXd = @($Preserves.preserveOnTarget.directories) -join ' '

$Manifest = @{
    product               = "MultiServer"
    packageType           = "update"
    version               = $Version
    buildDate             = $IsoDate
    buildId               = $BuildDate
    minCompatibleVersion  = "1.0.0"
    preserves             = @($Preserves.preserveOnTarget.files + $Preserves.preserveOnTarget.filePatterns + $Preserves.preserveOnTarget.directories)
    excludesFromPayload   = @($Preserves.excludeFromPayload)
    preserveNotes         = $Preserves.notes
    appliesTo             = "Existing MultiServer installs - instance config, manifests, Caddyfile, and logs are never copied from the package"
    changelog             = @(
        "v1.1.0 - ngrok tunnel support (per-system + settings)"
        "v1.1.0 - monolith app detection (CRM-style apps no longer misclassified as split stack)"
        "v1.1.0 - server-only launchers and ngrok v2 compatibility"
        "v1.1.0 - version shown in GUI, /health, and demos-manifest.json"
    )
} | ConvertTo-Json -Depth 5

Set-Content -Path (Join-Path $OutDir "DISTRIBUTION-MANIFEST.json") -Value $Manifest -Encoding UTF8
Copy-Item $PreservesPath (Join-Path $OutDir "update-preserves.json") -Force

$ApplyTemplate = Join-Path $Root "distributions\apply-update.template.bat"
$ApplyOut = Join-Path $OutDir "apply-update.bat"
$ReadmeTemplate = Join-Path $Root "distributions\README-UPDATE.template.md"
$ReadmeOut = Join-Path $OutDir "README-UPDATE.md"

Copy-Item $ApplyTemplate $ApplyOut -Force
Copy-Item $ReadmeTemplate $ReadmeOut -Force

$PreserveList = @(
    ($Preserves.preserveOnTarget.files -join ", ")
    ($Preserves.preserveOnTarget.directories -join ", ")
) -join "; "

foreach ($file in @($ReadmeOut, $ApplyOut)) {
    (Get-Content $file -Raw) `
        -replace '\{\{VERSION\}\}', $Version `
        -replace '\{\{BUILD_DATE\}\}', $IsoDate `
        -replace '\{\{BUILD_ID\}\}', $BuildDate `
        -replace '\{\{PRESERVE_LIST\}\}', $PreserveList `
        -replace '\{\{ROBOCOPY_XF\}\}', $RobocopyXf `
        -replace '\{\{ROBOCOPY_XD\}\}', $RobocopyXd |
        Set-Content $file -Encoding ASCII
}

$ZipPath = Join-Path $Root "distributions\$PackageName.zip"
if (Test-Path $ZipPath) {
    Remove-Item $ZipPath -Force
}
Compress-Archive -Path $OutDir -DestinationPath $ZipPath -Force

Write-Host "Built update package:"
Write-Host "  Folder: $OutDir"
Write-Host "  Zip:    $ZipPath"
Write-Host "  Version $Version  Build $BuildDate"
Write-Host ""
Write-Host "Excluded from payload / preserved on target:"
foreach ($item in $Preserves.excludeFromPayload) {
    Write-Host "  - $item"
}
