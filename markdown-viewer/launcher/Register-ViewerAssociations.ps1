# Registers Quiet Reader as the Windows "Open with" handler for supported file types.
# Safe to run without admin — writes to HKCU:\Software\Classes only.

[CmdletBinding()]
param(
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\config.ps1"

$launcherBat = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'Open-InViewer.bat'))
$launcherCommand = "`"$launcherBat`" `"%1`""
$progId = 'QuietReader.Document'

function Register-Extension {
  param([string]$Extension)

  $extensionKey = "HKCU:\Software\Classes\$Extension"
  $openCommandKey = "HKCU:\Software\Classes\$progId\shell\open\command"

  New-Item -Path $extensionKey -Force | Out-Null
  Set-ItemProperty -Path $extensionKey -Name '(default)' -Value $progId

  New-Item -Path "HKCU:\Software\Classes\$progId" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name '(default)' -Value $Script:AssociationLabel

  New-Item -Path $openCommandKey -Force | Out-Null
  Set-ItemProperty -Path $openCommandKey -Name '(default)' -Value $launcherCommand

  $openWithKey = "HKCU:\Software\Classes\$Extension\OpenWithProgids"
  New-Item -Path $openWithKey -Force | Out-Null
  New-ItemProperty -Path $openWithKey -Name $progId -PropertyType String -Force | Out-Null
}

function Unregister-Extension {
  param([string]$Extension)

  $extensionKey = "HKCU:\Software\Classes\$Extension"
  if (Test-Path $extensionKey) {
    Remove-ItemProperty -Path $extensionKey -Name '(default)' -ErrorAction SilentlyContinue
    Remove-ItemProperty -Path "$extensionKey\OpenWithProgids" -Name $progId -ErrorAction SilentlyContinue
  }
}

if (-not (Test-Path -LiteralPath $launcherBat)) {
  throw "Launcher not found: $launcherBat"
}

if ($Unregister) {
  foreach ($extension in $Script:SupportedExtensions) {
    Unregister-Extension -Extension $extension
  }

  if (Test-Path "HKCU:\Software\Classes\$progId") {
    Remove-Item -Path "HKCU:\Software\Classes\$progId" -Recurse -Force
  }

  Write-Host 'Quiet Reader file associations removed from HKCU.'
  exit 0
}

foreach ($extension in $Script:SupportedExtensions) {
  Register-Extension -Extension $extension
}

Write-Host "Registered Quiet Reader for: $($Script:SupportedExtensions -join ', ')"
Write-Host "Launcher: $launcherBat"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Right-click a supported file in Explorer'
Write-Host '  2. Choose Open with -> Quiet Reader'
Write-Host '  3. Optional: Choose "Always" to make it the default'
