param(
  [switch]$EnableProductionDeep,
  [switch]$SkipBuild,
  [switch]$PrepareOnly
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$webRoot = Join-Path $repoRoot "apps\web"
$runtimeDirectory = Join-Path $repoRoot ".data\workstation-docker"
New-Item -ItemType Directory -Force -Path $runtimeDirectory | Out-Null
$script:ProductionDeepReady = $false

function Convert-EnvValue {
  param([string]$Value)
  $normalized = $Value.Trim()
  if ($normalized.Length -ge 2 -and $normalized[0] -eq '"' -and $normalized[$normalized.Length - 1] -eq '"') {
    return $normalized.Substring(1, $normalized.Length - 2).Replace('\"', '"').Replace('\\', '\')
  }
  if ($normalized.Length -ge 2 -and $normalized[0] -eq "'" -and $normalized[$normalized.Length - 1] -eq "'") {
    return $normalized.Substring(1, $normalized.Length - 2)
  }
  return $normalized
}

function Merge-EnvFile {
  param([hashtable]$Values, [string]$Path, [string[]]$AllowedNames = @(), [switch]$OnlyIfMissing)
  if (-not (Test-Path -LiteralPath $Path)) { throw "Required environment file is missing: $Path" }
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
    $name = $matches[1]
    if ($AllowedNames.Count -gt 0 -and $AllowedNames -notcontains $name) { continue }
    $value = Convert-EnvValue $matches[2]
    if ([string]::IsNullOrWhiteSpace($value)) { continue }
    if ($OnlyIfMissing -and $Values.ContainsKey($name) -and -not [string]::IsNullOrWhiteSpace($Values[$name])) { continue }
    $Values[$name] = $value
  }
}

function Require-Values {
  param([hashtable]$Values, [string[]]$Names, [string]$Purpose)
  $missing = @($Names | Where-Object { -not $Values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($Values[$_]) })
  if ($missing.Count -gt 0) { throw "$Purpose is not configured. Missing: $($missing -join ', ')." }
}

function Write-RuntimeEnv {
  param([string]$Environment)
  $values = @{}
  if ($Environment -eq "staging") {
    Merge-EnvFile $values (Join-Path $repoRoot ".vercel\.env.preview.local")
    Merge-EnvFile $values (Join-Path $webRoot ".env.staging.local")
    $publicSearchPath = Join-Path $webRoot ".env.public-search.staging.local"
    if (Test-Path -LiteralPath $publicSearchPath) { Merge-EnvFile $values $publicSearchPath }
    $values["OGC_DEPLOYMENT_PROFILE"] = "staging"
    $values["VERCEL_ENV"] = "preview"
  } else {
    Merge-EnvFile $values (Join-Path $repoRoot ".vercel\.env.production.local")
    $values["OGC_DEPLOYMENT_PROFILE"] = "production"
    $values["VERCEL_ENV"] = "production"
    if (-not $values.ContainsKey("COMMERCE_MODE")) { $values["COMMERCE_MODE"] = "disabled" }
  }

  $providerNames = @("OGC_AI_BASE_URL", "OGC_AI_API_KEY", "OGC_AI_MODEL", "OGC_AI_TIMEOUT_MS", "OGC_AI_JSON_RESPONSE_FORMAT")
  Merge-EnvFile $values (Join-Path $webRoot ".env.local") -AllowedNames $providerNames -OnlyIfMissing
  if ($Environment -eq "staging" -and $values["OGC_PUBLIC_SEARCH_RUNTIME_ENABLED"] -eq "true") {
    $publicSearchMiMoFallbacks = @{
      "OGC_PUBLIC_SEARCH_MIMO_BASE_URL" = "OGC_AI_BASE_URL"
      "OGC_PUBLIC_SEARCH_MIMO_API_KEY" = "OGC_AI_API_KEY"
      "OGC_PUBLIC_SEARCH_MIMO_MODEL" = "OGC_AI_MODEL"
    }
    foreach ($target in $publicSearchMiMoFallbacks.Keys) {
      $source = $publicSearchMiMoFallbacks[$target]
      if ((-not $values.ContainsKey($target) -or [string]::IsNullOrWhiteSpace($values[$target])) -and
          $values.ContainsKey($source) -and -not [string]::IsNullOrWhiteSpace($values[$source])) {
        $values[$target] = $values[$source]
      }
    }
  }
  $values["FULFILLMENT_MODE"] = "realtime"
  $values["OGC_JOB_QUEUE_PROVIDER"] = "postgres"
  $values["OGC_WORKER_POLL_MS"] = "5000"
  $values["OGC_PUBLIC_DNS_DOH_URL"] = "https://cloudflare-dns.com/dns-query"
  $values["OGC_DEPLOYMENT_VERSION"] = "docker-desktop-$Environment"
  $values["NODE_ENV"] = "production"

  Require-Values $values @("DATABASE_URL", "OGC_DEPLOYMENT_PROFILE", "OGC_AI_BASE_URL", "OGC_AI_API_KEY", "OGC_AI_MODEL") "$Environment Worker"
  if ($Environment -eq "staging") {
    Require-Values $values @("OGC_EVIDENCE_STORAGE", "BLOB_READ_WRITE_TOKEN") "Staging deep-report storage"
    if ($values["OGC_PUBLIC_SEARCH_RUNTIME_ENABLED"] -eq "true") {
      Require-Values $values @("OGC_PUBLIC_SEARCH_ADAPTER", "OGC_PUBLIC_SEARCH_MIMO_BASE_URL", "OGC_PUBLIC_SEARCH_MIMO_API_KEY", "OGC_PUBLIC_SEARCH_MIMO_MODEL", "OGC_PUBLIC_SEARCH_LOCALE", "OGC_PUBLIC_SEARCH_REGION") "Staging public-search runtime"
    }
  }
  if ($Environment -eq "production") {
    if ($values["OGC_EVIDENCE_STORAGE"] -eq "vercel-blob") {
      if ($values.ContainsKey("BLOB_READ_WRITE_TOKEN") -and -not [string]::IsNullOrWhiteSpace($values["BLOB_READ_WRITE_TOKEN"])) {
        $script:ProductionDeepReady = $true
      } elseif ($EnableProductionDeep) {
        Require-Values $values @("BLOB_READ_WRITE_TOKEN") "Production deep-report Vercel Blob storage"
      }
    } elseif ($values["OGC_EVIDENCE_STORAGE"] -eq "s3") {
      $s3Names = @("OGC_EVIDENCE_S3_ENDPOINT", "OGC_EVIDENCE_S3_REGION", "OGC_EVIDENCE_S3_BUCKET", "OGC_EVIDENCE_S3_ACCESS_KEY_ID", "OGC_EVIDENCE_S3_SECRET_ACCESS_KEY")
      $missingS3 = @($s3Names | Where-Object { -not $values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace($values[$_]) })
      if ($missingS3.Count -eq 0) {
        $script:ProductionDeepReady = $true
      } elseif ($EnableProductionDeep) {
        Require-Values $values $s3Names "Production deep-report S3 storage"
      }
    } elseif ($EnableProductionDeep) {
      throw "Production deep-report private storage is not configured."
    }
  }

  $path = Join-Path $runtimeDirectory "$Environment.env"
  $lines = @($values.GetEnumerator() | Sort-Object Key | ForEach-Object { "$($_.Key)=$($_.Value)" })
  [System.IO.File]::WriteAllLines($path, $lines, [System.Text.UTF8Encoding]::new($false))
  & icacls.exe $path /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $path." }
}

Write-RuntimeEnv "staging"
Write-RuntimeEnv "production"

$productionPath = Join-Path $runtimeDirectory "production.env"
$commercePath = Join-Path $runtimeDirectory "production-commerce.env"
$commerceExcluded = @(
  "BLOB_READ_WRITE_TOKEN",
  "FULFILLMENT_MODE",
  "OGC_AI_BASE_URL",
  "OGC_AI_API_KEY",
  "OGC_AI_JSON_RESPONSE_FORMAT",
  "OGC_AI_MODEL",
  "OGC_AI_TIMEOUT_MS",
  "OGC_DEPLOYMENT_VERSION",
  "OGC_EVIDENCE_STORAGE",
  "OGC_JOB_QUEUE_PROVIDER",
  "OGC_PUBLIC_DNS_DOH_URL",
  "OGC_WORKER_POLL_MS"
)
$commerceLines = @(Get-Content -LiteralPath $productionPath | Where-Object {
  $name = ($_ -split "=", 2)[0]
  $commerceExcluded -notcontains $name -and $name -notlike "OGC_EVIDENCE_S3_*"
})
[System.IO.File]::WriteAllLines($commercePath, $commerceLines, [System.Text.UTF8Encoding]::new($false))
& icacls.exe $commercePath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on $commercePath." }

if ($PrepareOnly) {
  Write-Host "Docker Desktop Worker environment prepared. Production deep=$script:ProductionDeepReady."
  exit 0
}

Push-Location $repoRoot
try {
  if (-not $SkipBuild) { docker compose build staging-worker-free }
  if ($LASTEXITCODE -ne 0) { throw "Worker image build failed." }
  $services = @("staging-worker-free", "staging-worker-deep", "production-worker-free", "production-commerce")
  if ($script:ProductionDeepReady) { $services += "production-worker-deep" }
  docker compose --profile workstation --profile workstation-production-deep up -d @services
  if ($LASTEXITCODE -ne 0) { throw "Worker containers did not start." }
} finally {
  Pop-Location
}

Write-Host "Docker Desktop Workers started. Production deep=$script:ProductionDeepReady."
