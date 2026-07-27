param(
  [ValidateRange(1, 8)]
  [int]$DeepProcesses = 2,
  [string]$TaskName = "Open GEO Console Commercial Batch"
)

$ErrorActionPreference = "Stop"
$runner = (Resolve-Path (Join-Path $PSScriptRoot "run-commercial-batch.ps1")).Path
$powerShell = (Get-Command powershell.exe).Source
$argument = "-NoProfile -ExecutionPolicy Bypass -File `"$runner`" -DeepProcesses $DeepProcesses"
$action = New-ScheduledTaskAction -Execute $powerShell -Argument $argument
$triggers = @(
  New-ScheduledTaskTrigger -Daily -At "10:00",
  New-ScheduledTaskTrigger -Daily -At "20:00"
)
$settings = New-ScheduledTaskSettingsSet `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 10)

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $triggers `
  -Settings $settings `
  -Description "Drains Open GEO Console free and paid report queues at 10:00 and 20:00 local time." `
  -Force | Out-Null

Write-Host "Scheduled task '$TaskName' installed for 10:00 and 20:00 local time."
