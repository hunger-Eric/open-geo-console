param(
  [switch]$EnableProductionDeep,
  [switch]$SkipBuild,
  [switch]$PrepareOnly,
  [switch]$PrepareStagingOnly,
  [switch]$InitializeStagingEmailActivation,
  [string]$RuntimeInputRoot
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$RuntimeInputRoot = if ([string]::IsNullOrWhiteSpace($RuntimeInputRoot)) { $repoRoot } else { $RuntimeInputRoot }; if (-not (Test-Path -LiteralPath $RuntimeInputRoot -PathType Container)) { throw "Runtime input root is not a directory: $RuntimeInputRoot" }
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
    $values["NODE_OPTIONS"] = "--dns-result-order=ipv4first"
  } else {
    Merge-EnvFile $values (Join-Path $repoRoot ".vercel\.env.production.local")
    $values["OGC_DEPLOYMENT_PROFILE"] = "production"
    $values["VERCEL_ENV"] = "production"
    if (-not $values.ContainsKey("COMMERCE_MODE")) { $values["COMMERCE_MODE"] = "disabled" }
  }

  $providerNames = @(
    "OGC_PROVIDER_PROFILE", "OGC_AI_BASE_URL", "OGC_AI_API_KEY", "OGC_AI_MODEL",
    "OGC_AI_TIMEOUT_MS", "OGC_AI_JSON_RESPONSE_FORMAT", "OGC_REPORT_V4_MODEL_PROFILE_ID",
    "OGC_REPORT_V4_MIMO_BASE_URL", "OGC_REPORT_V4_MIMO_API_KEY", "OGC_TOKEN_HASH_SECRET",
    "OGC_PUBLIC_SEARCH_RUNTIME_ENABLED", "OGC_PUBLIC_SEARCH_ADAPTER", "OGC_PUBLIC_SEARCH_LOCALE",
    "OGC_PUBLIC_SEARCH_REGION", "OGC_PUBLIC_SEARCH_AUTHORITY_VERSION", "OGC_PUBLIC_SEARCH_MIMO_BASE_URL",
    "OGC_PUBLIC_SEARCH_MIMO_API_KEY", "OGC_PUBLIC_SEARCH_MIMO_MODEL",
    "OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL", "OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY"
  )
  Merge-EnvFile $values (Join-Path $webRoot ".env.local") -AllowedNames $providerNames -OnlyIfMissing
  $values["FULFILLMENT_MODE"] = "realtime"
  $values["OGC_JOB_QUEUE_PROVIDER"] = "postgres"
  $values["OGC_WORKER_POLL_MS"] = "5000"
  $values["OGC_PUBLIC_DNS_DOH_URL"] = "https://cloudflare-dns.com/dns-query"
  $values["OGC_DEPLOYMENT_VERSION"] = "docker-desktop-$Environment"
  $values["NODE_ENV"] = "production"

  Require-Values $values @("DATABASE_URL", "OGC_DEPLOYMENT_PROFILE", "OGC_PROVIDER_PROFILE", "OGC_TOKEN_HASH_SECRET", "OGC_PUBLIC_SEARCH_RUNTIME_ENABLED", "OGC_PUBLIC_SEARCH_LOCALE", "OGC_PUBLIC_SEARCH_REGION") "$Environment Worker"
  if ($values["OGC_PUBLIC_SEARCH_RUNTIME_ENABLED"] -ne "true") { throw "$Environment Worker requires OGC_PUBLIC_SEARCH_RUNTIME_ENABLED=true." }
  $profile = $values["OGC_PROVIDER_PROFILE"]
  if ($profile -eq "mimo_native") {
    Require-Values $values @("OGC_REPORT_V4_MIMO_BASE_URL", "OGC_REPORT_V4_MIMO_API_KEY", "OGC_PUBLIC_SEARCH_MIMO_BASE_URL", "OGC_PUBLIC_SEARCH_MIMO_API_KEY", "OGC_PUBLIC_SEARCH_MIMO_MODEL") "$Environment MiMo provider profile"
    if ($values.ContainsKey("OGC_PUBLIC_SEARCH_ADAPTER") -and $values["OGC_PUBLIC_SEARCH_ADAPTER"] -ne "mimo") { throw "OGC_PUBLIC_SEARCH_ADAPTER conflicts with mimo_native." }
    if ($values.ContainsKey("OGC_REPORT_V4_MODEL_PROFILE_ID") -and $values["OGC_REPORT_V4_MODEL_PROFILE_ID"] -ne "report-v4-mimo-v2.5-pro-v1") { throw "OGC_REPORT_V4_MODEL_PROFILE_ID conflicts with mimo_native." }
  } elseif ($profile -eq "sensenova_anysearch") {
    Require-Values $values @("OGC_AI_BASE_URL", "OGC_AI_API_KEY", "OGC_AI_MODEL", "OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL", "OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY") "$Environment SenseNova and AnySearch provider profile"
    if (($values.ContainsKey("OGC_REPORT_V4_MIMO_BASE_URL") -and -not [string]::IsNullOrWhiteSpace($values["OGC_REPORT_V4_MIMO_BASE_URL"])) -or ($values.ContainsKey("OGC_REPORT_V4_MIMO_API_KEY") -and -not [string]::IsNullOrWhiteSpace($values["OGC_REPORT_V4_MIMO_API_KEY"]))) { throw "Stale MiMo V4 routing values conflict with sensenova_anysearch." }
    if ($values.ContainsKey("OGC_PUBLIC_SEARCH_ADAPTER") -and $values["OGC_PUBLIC_SEARCH_ADAPTER"] -ne "anysearch") { throw "OGC_PUBLIC_SEARCH_ADAPTER conflicts with sensenova_anysearch." }
    if ($values.ContainsKey("OGC_REPORT_V4_MODEL_PROFILE_ID") -and $values["OGC_REPORT_V4_MODEL_PROFILE_ID"] -ne "report-v4-sensenova-deepseek-v4-flash-v1") { throw "OGC_REPORT_V4_MODEL_PROFILE_ID conflicts with sensenova_anysearch." }
  } else {
    throw "OGC_PROVIDER_PROFILE is unsupported: $profile"
  }
  if ($Environment -eq "staging") {
    Require-Values $values @("OGC_EVIDENCE_STORAGE", "BLOB_READ_WRITE_TOKEN") "Staging Worker"
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

function Write-StagingCommerceEnv {
  $values = @{}
  $commerceSourceNames = @(
    "DATABASE_URL", "COMMERCE_MODE", "OGC_TEST_EMAIL_RECIPIENT", "RESEND_API_KEY",
    "RESEND_FROM_EMAIL", "OGC_REPLY_TO_EMAIL", "OGC_TOKEN_HASH_SECRET", "OGC_DATABASE_POOL_SIZE"
  )
  Merge-EnvFile $values (Join-Path $repoRoot ".vercel\.env.preview.local") -AllowedNames $commerceSourceNames
  Merge-EnvFile $values (Join-Path $webRoot ".env.staging.local") -AllowedNames $commerceSourceNames
  Merge-EnvFile $values (Join-Path $runtimeDirectory "staging.env") -AllowedNames $commerceSourceNames
  $values["OGC_DEPLOYMENT_PROFILE"] = "staging"
  $values["VERCEL_ENV"] = "preview"
  $values["NODE_ENV"] = "production"
  $values["OGC_STAGING_EMAIL_INTERVAL_MS"] = "5000"
  $values["OGC_REPORT_BASE_URL"] = "https://open-geo-console-staging-itheheda.vercel.app"
  if ($values["COMMERCE_MODE"] -ne "test") { throw "Staging email delivery requires COMMERCE_MODE=test." }

  $path = Join-Path $runtimeDirectory "staging-commerce.env"
  $activationPath = Join-Path $runtimeDirectory "staging-commerce.activation"
  $activation = $null
  if (Test-Path -LiteralPath $path) {
    foreach ($line in Get-Content -LiteralPath $path) {
      if ($line -match '^OGC_STAGING_EMAIL_ACTIVATION_AT=(.*)$') { $activation = Convert-EnvValue $matches[1] }
    }
  }
  $persistedActivation = if (Test-Path -LiteralPath $activationPath) {
    (Get-Content -LiteralPath $activationPath -Raw).Trim()
  } else { $null }
  if (-not [string]::IsNullOrWhiteSpace($activation) -and
      -not [string]::IsNullOrWhiteSpace($persistedActivation) -and
      $activation -ne $persistedActivation) {
    throw "The Staging email activation authorities disagree."
  }
  if ($InitializeStagingEmailActivation -and
      (-not [string]::IsNullOrWhiteSpace($activation) -or
       -not [string]::IsNullOrWhiteSpace($persistedActivation))) {
    throw "Staging email activation is already initialized."
  }
  if ([string]::IsNullOrWhiteSpace($activation)) { $activation = $persistedActivation }
  if ([string]::IsNullOrWhiteSpace($activation)) {
    if (-not $InitializeStagingEmailActivation) {
      throw "Staging email activation is absent; initialize it explicitly once."
    }
    $activation = [DateTime]::UtcNow.ToString("yyyy-MM-ddTHH:mm:ss.fffZ", [Globalization.CultureInfo]::InvariantCulture)
  }
  $parsedActivation = [DateTime]::MinValue
  if (-not [DateTime]::TryParseExact($activation, "yyyy-MM-ddTHH:mm:ss.fffZ",
      [Globalization.CultureInfo]::InvariantCulture,
      [Globalization.DateTimeStyles]::AssumeUniversal -bor [Globalization.DateTimeStyles]::AdjustToUniversal,
      [ref]$parsedActivation) -or $parsedActivation.Kind -ne [DateTimeKind]::Utc) {
    throw "The Staging email activation timestamp is invalid."
  }
  $values["OGC_STAGING_EMAIL_ACTIVATION_AT"] = $activation

  $required = @(
    "DATABASE_URL", "OGC_DEPLOYMENT_PROFILE", "VERCEL_ENV", "COMMERCE_MODE",
    "OGC_TEST_EMAIL_RECIPIENT", "RESEND_API_KEY", "RESEND_FROM_EMAIL",
    "OGC_REPLY_TO_EMAIL", "OGC_REPORT_BASE_URL", "OGC_TOKEN_HASH_SECRET",
    "OGC_STAGING_EMAIL_ACTIVATION_AT"
  )
  Require-Values $values $required "Staging email delivery"
  $placeholders = @($required | Where-Object { $values[$_] -eq "[SENSITIVE]" })
  if ($placeholders.Count -gt 0) { throw "Staging email delivery has unresolved Sensitive placeholders: $($placeholders -join ', ')." }
  $allowed = @($required + @("NODE_ENV", "OGC_DATABASE_POOL_SIZE", "OGC_STAGING_EMAIL_INTERVAL_MS"))
  $lines = @($allowed | Sort-Object -Unique | ForEach-Object { "$_=$($values[$_])" })
  [System.IO.File]::WriteAllLines($path, $lines, [System.Text.UTF8Encoding]::new($false))
  [System.IO.File]::WriteAllText($activationPath, $activation, [System.Text.UTF8Encoding]::new($false))
  & icacls.exe $path /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on the Staging email runtime file." }
  & icacls.exe $activationPath /inheritance:r /grant:r "${env:USERNAME}:(R,W)" | Out-Null
  if ($LASTEXITCODE -ne 0) { throw "Could not restrict permissions on the Staging email activation file." }
}

$repoRoot = (Resolve-Path -LiteralPath $RuntimeInputRoot).Path; $webRoot = Join-Path $repoRoot "apps\web"
Write-RuntimeEnv "staging"
Write-StagingCommerceEnv
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path; $webRoot = Join-Path $repoRoot "apps\web"
if ($PrepareStagingOnly) {
  if (-not $PrepareOnly) { throw "-PrepareStagingOnly requires -PrepareOnly." }
  Write-Host "Docker Desktop staging Worker environment prepared."
  exit 0
}
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
  "OGC_PROVIDER_PROFILE",
  "OGC_REPORT_V4_MODEL_PROFILE_ID",
  "OGC_REPORT_V4_MIMO_BASE_URL",
  "OGC_REPORT_V4_MIMO_API_KEY",
  "OGC_TOKEN_HASH_SECRET",
  "OGC_PUBLIC_SEARCH_RUNTIME_ENABLED",
  "OGC_PUBLIC_SEARCH_ADAPTER",
  "OGC_PUBLIC_SEARCH_LOCALE",
  "OGC_PUBLIC_SEARCH_REGION",
  "OGC_PUBLIC_SEARCH_AUTHORITY_VERSION",
  "OGC_PUBLIC_SEARCH_MIMO_BASE_URL",
  "OGC_PUBLIC_SEARCH_MIMO_API_KEY",
  "OGC_PUBLIC_SEARCH_MIMO_MODEL",
  "OGC_PUBLIC_SEARCH_ANYSEARCH_BASE_URL",
  "OGC_PUBLIC_SEARCH_ANYSEARCH_API_KEY",
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
  $services = @("staging-worker-free", "staging-worker-deep", "staging-commerce", "production-worker-free", "production-commerce")
  if ($script:ProductionDeepReady) { $services += "production-worker-deep" }
  docker compose --profile workstation --profile workstation-production-deep up -d @services
  if ($LASTEXITCODE -ne 0) { throw "Worker containers did not start." }
} finally {
  Pop-Location
}

Write-Host "Docker Desktop Workers started. Production deep=$script:ProductionDeepReady."
