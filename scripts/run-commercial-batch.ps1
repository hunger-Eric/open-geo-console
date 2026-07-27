param(
  [ValidateRange(1, 8)]
  [int]$DeepProcesses = 2,
  [switch]$SkipFree
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
if (-not (Test-Path -LiteralPath (Join-Path $repoRoot "package.json"))) {
  throw "Open GEO Console repository root could not be resolved."
}

$logDirectory = Join-Path $repoRoot ".data\batch-logs"
New-Item -ItemType Directory -Force -Path $logDirectory | Out-Null
$stamp = Get-Date -Format "yyyyMMdd-HHmmss"
$processes = @()

function Start-BatchLane {
  param([string]$Lane, [int]$Index)
  $stdout = Join-Path $logDirectory "$stamp-$Lane-$Index.out.log"
  $stderr = Join-Path $logDirectory "$stamp-$Lane-$Index.err.log"
  return Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", "worker:$Lane") `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru
}

if (-not $SkipFree) {
  $processes += Start-BatchLane -Lane "free" -Index 1
}
for ($index = 1; $index -le $DeepProcesses; $index++) {
  $processes += Start-BatchLane -Lane "deep" -Index $index
}

$processes | Wait-Process
$failed = @($processes | Where-Object { $_.ExitCode -ne 0 })

function Invoke-PostBatchOperation {
  param([string]$ScriptName)
  $safeName = $ScriptName.Replace(":", "-")
  $stdout = Join-Path $logDirectory "$stamp-$safeName.out.log"
  $stderr = Join-Path $logDirectory "$stamp-$safeName.err.log"
  $process = Start-Process -FilePath "npm.cmd" `
    -ArgumentList @("run", $ScriptName) `
    -WorkingDirectory $repoRoot `
    -WindowStyle Hidden `
    -RedirectStandardOutput $stdout `
    -RedirectStandardError $stderr `
    -PassThru `
    -Wait
  return $process.ExitCode
}

# Reconciliation, the 24-hour watchdog, refunds and email must run even when a
# report lane failed, otherwise a Worker problem could also suppress refunds.
$queueExit = Invoke-PostBatchOperation -ScriptName "queue:reconcile"
$commerceExit = Invoke-PostBatchOperation -ScriptName "commerce:all"

if ($failed.Count -gt 0 -or $queueExit -ne 0 -or $commerceExit -ne 0) {
  throw "The commercial batch or a required post-batch operation failed. Inspect $logDirectory."
}

Write-Host "Commercial batch completed successfully. Logs: $logDirectory"
