Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\config.ps1"

$samplePath = Join-Path (Split-Path $PSScriptRoot -Parent) 'library\welcome.md'
$launcherVbs = Join-Path $PSScriptRoot 'Open-InViewer.vbs'
$logPath = Join-Path $env:TEMP 'quiet-reader-launcher.log'

Write-Host 'Quiet Reader launcher diagnostics'
Write-Host '================================='
Write-Host "Viewer URL: $($Script:ViewerOrigin)"
Write-Host "Launcher:   $launcherVbs"
Write-Host "Sample doc: $samplePath"
Write-Host "Log file:   $logPath"
Write-Host ''

if (-not (Test-Path -LiteralPath $launcherVbs)) {
  throw "Launcher script not found: $launcherVbs"
}

if (-not (Test-Path -LiteralPath $samplePath)) {
  throw "Sample markdown file not found: $samplePath"
}

$appKey = 'HKCU:\Software\Classes\Applications\Open-InViewer.bat'
if (Test-Path $appKey) {
  Write-Host 'Application registration: OK'
} else {
  Write-Host 'Application registration: MISSING'
  Write-Host 'Run Register-ViewerAssociations.ps1 first.'
}

Write-Host ''
Write-Host 'Launching sample document...'
& $launcherVbs $samplePath

Start-Sleep -Seconds 2

if (Test-Path -LiteralPath $logPath) {
  Write-Host ''
  Write-Host 'Recent log entries:'
  Get-Content -Path $logPath -Tail 8 | ForEach-Object { Write-Host "  $_" }
} else {
  Write-Host 'No log file was created yet.'
}

Write-Host ''
Write-Host 'Expected result: your browser opens Quiet Reader with welcome.md.'
