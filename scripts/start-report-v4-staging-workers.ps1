param()

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$composeFile = Join-Path $repoRoot "compose.yaml"
$runtimeEnv = Join-Path $repoRoot ".data\workstation-docker\staging.env"
$composeOverride = Join-Path ([System.IO.Path]::GetTempPath()) "ogc-report-v4-staging-$PID.compose.yaml"
$allowedProtectedPlanEntry = "?? docs/superpowers/plans/2026-07-15-v3-paid-acceptance-remediation.md"
$requiredV4Names = @(
  "OGC_REPORT_V4_MODEL_PROFILE_ID",
  "OGC_REPORT_V4_MIMO_BASE_URL",
  "OGC_REPORT_V4_MIMO_API_KEY"
)

function Assert-LastExitCode {
  param([string]$Failure)
  if ($LASTEXITCODE -ne 0) { throw $Failure }
}

function Assert-ExactSourceWorktree {
  param([string]$Root)
  $entries = @(& git -C $Root status --porcelain=v1 --untracked-files=all)
  Assert-LastExitCode "Git status failed."
  $unexpectedEntries = @($entries | Where-Object { $_ -cne $allowedProtectedPlanEntry })
  $protectedPlanEntries = @($entries | Where-Object { $_ -ceq $allowedProtectedPlanEntry })
  if ($unexpectedEntries.Count -gt 0 -or $protectedPlanEntries.Count -gt 1) {
    throw "Exact-commit staging launch rejects every worktree change except the protected V3 plan path."
  }

  $dockerIgnorePath = Join-Path $Root ".dockerignore"
  if (-not (Test-Path -LiteralPath $dockerIgnorePath -PathType Leaf)) {
    throw "Exact-commit staging launch requires .dockerignore."
  }
  $dockerIgnoreLines = [System.IO.File]::ReadAllLines($dockerIgnorePath)
  $exactDocsRules = @($dockerIgnoreLines | Where-Object { $_ -ceq "docs" })
  $effectiveRules = @($dockerIgnoreLines | Where-Object {
    -not [string]::IsNullOrWhiteSpace($_) -and -not $_.TrimStart().StartsWith("#")
  })
  if ($exactDocsRules.Count -ne 1 -or $effectiveRules.Count -eq 0 -or $effectiveRules[-1] -cne "docs") {
    throw "Exact-commit staging launch requires a final top-level exact 'docs' Docker exclusion."
  }
}

function Convert-EnvValue {
  param([string]$Value)
  $normalized = $Value.Trim()
  if ($normalized.Length -ge 2 -and
      (($normalized[0] -eq '"' -and $normalized[$normalized.Length - 1] -eq '"') -or
       ($normalized[0] -eq "'" -and $normalized[$normalized.Length - 1] -eq "'"))) {
    return $normalized.Substring(1, $normalized.Length - 2)
  }
  return $normalized
}

function Read-RuntimeEnv {
  param([string]$Path)
  if (-not (Test-Path -LiteralPath $Path)) { throw "The merged staging Worker environment is missing." }
  $values = @{}
  foreach ($line in Get-Content -LiteralPath $Path) {
    if ($line -notmatch '^([A-Za-z_][A-Za-z0-9_]*)=(.*)$') { continue }
    $name = $matches[1]
    if ($values.ContainsKey($name)) { throw "The merged staging Worker environment contains a duplicate variable name." }
    $values[$name] = Convert-EnvValue $matches[2]
  }
  return $values
}

function Require-NonblankValues {
  param([hashtable]$Values, [string[]]$Names)
  $missing = @($Names | Where-Object {
    -not $Values.ContainsKey($_) -or [string]::IsNullOrWhiteSpace([string]$Values[$_])
  })
  if ($missing.Count -gt 0) {
    throw "The merged staging Worker environment is missing required variable names: $($missing -join ', ')."
  }
}

function Set-RuntimeDeploymentVersion {
  param([string]$Path, [string]$Revision)
  $lines = @(Get-Content -LiteralPath $Path)
  $matches = @($lines | Where-Object { $_ -match '^OGC_DEPLOYMENT_VERSION=' })
  if ($matches.Count -gt 1) { throw "The merged staging Worker environment has duplicate deployment-version variables." }
  if ($matches.Count -eq 1) {
    $lines = @($lines | ForEach-Object {
      if ($_ -match '^OGC_DEPLOYMENT_VERSION=') { "OGC_DEPLOYMENT_VERSION=$Revision" } else { $_ }
    })
  } else {
    $lines += "OGC_DEPLOYMENT_VERSION=$Revision"
  }
  [System.IO.File]::WriteAllLines($Path, $lines, [System.Text.UTF8Encoding]::new($false))
}

function Read-ContainerEnvironment {
  param([string]$ContainerId)
  $json = & docker inspect --format '{{json .Config.Env}}' $ContainerId
  Assert-LastExitCode "The staging Worker container environment could not be inspected."
  $values = @{}
  foreach ($entry in @($json | ConvertFrom-Json)) {
    $parts = ([string]$entry).Split('=', 2)
    if ($parts.Count -eq 2) { $values[$parts[0]] = $parts[1] }
  }
  return $values
}

function Wait-WorkerReadiness {
  param([string]$ContainerId, [string]$ExpectedTier, [int]$TimeoutSeconds = 60)
  $deadline = [DateTimeOffset]::UtcNow.AddSeconds($TimeoutSeconds)
  while ([DateTimeOffset]::UtcNow -lt $deadline) {
    $inspectionJson = & docker inspect $ContainerId
    Assert-LastExitCode "The staging Worker readiness state could not be inspected."
    $inspection = @($inspectionJson | ConvertFrom-Json)[0]
    if ($inspection.State.Status -in @("dead", "exited", "removing")) {
      throw "The $ExpectedTier staging Worker exited before reporting readiness."
    }
    $healthConfigured = $null -ne $inspection.Config.Healthcheck
    if ($healthConfigured -and $inspection.State.Health.Status -eq "unhealthy") {
      throw "The $ExpectedTier staging Worker became unhealthy before reporting readiness."
    }
    $healthReady = (-not $healthConfigured) -or $inspection.State.Health.Status -eq "healthy"
    $logs = (& docker logs $ContainerId 2>&1 | Out-String)
    Assert-LastExitCode "The staging Worker readiness output could not be inspected."
    $readinessPattern = "Open GEO Console $([regex]::Escape($ExpectedTier)) worker .+ is ready\."
    if ($inspection.State.Running -eq $true -and $healthReady -and $logs -match $readinessPattern) {
      return $inspection
    }
    Start-Sleep -Seconds 2
  }
  throw "The $ExpectedTier staging Worker did not reach the project readiness boundary in time."
}

Push-Location $repoRoot
$previousImage = $env:OGC_APP_IMAGE
$originalRuntimeEnvBytes = $null
$runtimeEnvChanged = $false
$launchVerified = $false
try {
  Assert-ExactSourceWorktree $repoRoot

  $revision = (& git rev-parse HEAD).Trim()
  Assert-LastExitCode "Git HEAD could not be resolved."
  if ($revision -notmatch '^[a-f0-9]{40,64}$') { throw "Git HEAD is not a full immutable revision." }

  $runtime = Read-RuntimeEnv $runtimeEnv
  Require-NonblankValues $runtime (@(
    "DATABASE_URL",
    "OGC_DEPLOYMENT_PROFILE",
    "VERCEL_ENV",
    "COMMERCE_MODE"
  ) + $requiredV4Names)
  if ($runtime["OGC_DEPLOYMENT_PROFILE"] -ne "staging" -or
      $runtime["VERCEL_ENV"] -ne "preview" -or
      $runtime["COMMERCE_MODE"] -ne "test") {
    throw "The merged Worker environment is not an exact protected-Staging runtime."
  }
  $originalRuntimeEnvBytes = [System.IO.File]::ReadAllBytes($runtimeEnv)

  Push-Location (Join-Path $repoRoot "apps\web")
  try {
    $preflightOutput = (& node "--env-file=$runtimeEnv" --import tsx src/scripts/report-v4-staging-preflight.ts | Out-String).Trim()
    Assert-LastExitCode "The Report V4 protected-Staging preflight failed."
    $preflight = $preflightOutput | ConvertFrom-Json
    $currentSchemaVersion = [int]$preflight.currentSchemaVersion
    if ($currentSchemaVersion -lt 34) { throw "The Report V4 preflight returned an invalid current schema version." }
  } finally {
    Pop-Location
  }

  $image = "open-geo-console:staging-$revision"
  & docker build --build-arg "OGC_REVISION=$revision" --label "org.opencontainers.image.revision=$revision" --tag $image --file Dockerfile.worker .
  Assert-LastExitCode "The exact-revision staging Worker image build failed."
  $runtimeEnvChanged = $true
  Set-RuntimeDeploymentVersion $runtimeEnv $revision
  [System.IO.File]::WriteAllLines($composeOverride, @(
    "services:",
    "  staging-worker-free:",
    "    environment:",
    "      OGC_WORKER_TIER: free",
    "  staging-worker-deep:",
    "    environment:",
    "      OGC_WORKER_TIER: deep"
  ), [System.Text.UTF8Encoding]::new($false))
  $composeArgs = @("-f", $composeFile, "-f", $composeOverride, "--profile", "workstation")
  $env:OGC_APP_IMAGE = $image
  & docker compose @composeArgs up -d --no-deps --no-build --force-recreate staging-worker-free staging-worker-deep
  Assert-LastExitCode "The staging-only Worker recreation failed."

  $imageInspectionJson = & docker image inspect $image
  Assert-LastExitCode "The exact staging Worker image ID could not be inspected."
  $imageInspection = @($imageInspectionJson | ConvertFrom-Json)[0]
  $expectedImageId = [string]$imageInspection.Id
  $imageRevision = [string]$imageInspection.Config.Labels.'org.opencontainers.image.revision'
  if (-not $expectedImageId -or $imageRevision -ne $revision) {
    throw "The staging Worker image ID or revision label is not exact."
  }

  $serviceTiers = [ordered]@{
    "staging-worker-free" = "free"
    "staging-worker-deep" = "deep"
  }
  foreach ($service in $serviceTiers.Keys) {
    $expectedTier = $serviceTiers[$service]
    $containerId = (& docker compose @composeArgs ps -q $service).Trim()
    Assert-LastExitCode "The staging Worker container identity could not be resolved."
    if (-not $containerId) { throw "An expected staging Worker container is missing." }
    $containerInspection = Wait-WorkerReadiness $containerId $expectedTier
    if ([string]$containerInspection.Image -ne $expectedImageId) { throw "A staging Worker container does not use the exact built image ID." }
    $containerEnvironment = Read-ContainerEnvironment $containerId
    Require-NonblankValues $containerEnvironment $requiredV4Names
    if ($containerEnvironment["OGC_DEPLOYMENT_PROFILE"] -ne "staging" -or
        $containerEnvironment["VERCEL_ENV"] -ne "preview" -or
        $containerEnvironment["COMMERCE_MODE"] -ne "test" -or
        $containerEnvironment["OGC_WORKER_TIER"] -ne $expectedTier -or
        $containerEnvironment["OGC_DEPLOYMENT_VERSION"] -ne $revision) {
      throw "A staging Worker container does not match the exact revision or protected-Staging markers."
    }
  }

  $launchVerified = $true
  Write-Host "Exact-commit Report V4 staging Workers are ready at revision $revision."
  Write-Host "Schema $currentSchemaVersion is forward-only; never roll these Workers back to an older-schema checkout after migration."
} finally {
  if ($runtimeEnvChanged -and -not $launchVerified -and $null -ne $originalRuntimeEnvBytes) {
    [System.IO.File]::WriteAllBytes($runtimeEnv, $originalRuntimeEnvBytes)
    Write-Warning "The original staging.env bytes were restored; any recreated containers were not rolled back and remain unverified."
  }
  Remove-Item -LiteralPath $composeOverride -Force -ErrorAction SilentlyContinue
  if ($null -eq $previousImage) { Remove-Item Env:OGC_APP_IMAGE -ErrorAction SilentlyContinue }
  else { $env:OGC_APP_IMAGE = $previousImage }
  Pop-Location
}
