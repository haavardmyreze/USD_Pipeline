# Registers Quiet Reader as the Windows "Open with" handler for supported file types.
# Safe to run without admin — writes to HKCU:\Software\Classes only.

[CmdletBinding()]
param(
  [switch]$Unregister
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\config.ps1"
. "$PSScriptRoot\Ensure-LauncherIcon.ps1"

$launcherBat = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot 'Open-InViewer.bat'))
$launcherCommand = "`"$launcherBat`" `"%1`""
$progId = 'QuietReader.Document'
$appName = 'Open-InViewer.bat'
$iconPath = Ensure-LauncherIcon -OutputPath (Join-Path $PSScriptRoot $Script:LauncherIconFile)
$iconRef = "`"$iconPath`",0"

function Set-RegistryDefaultIcon {
  param([string]$KeyPath)

  New-Item -Path $KeyPath -Force | Out-Null
  Set-ItemProperty -Path $KeyPath -Name '(default)' -Value $iconRef
}

function Register-Extension {
  param([string]$Extension)

  $extensionKey = "HKCU:\Software\Classes\$Extension"
  $openCommandKey = "HKCU:\Software\Classes\$progId\shell\open\command"
  $openWithListKey = "HKCU:\Software\Classes\$Extension\OpenWithList"
  $openWithProgidsKey = "HKCU:\Software\Classes\$Extension\OpenWithProgids"

  New-Item -Path $openCommandKey -Force | Out-Null
  Set-ItemProperty -Path $openCommandKey -Name '(default)' -Value $launcherCommand

  New-Item -Path "HKCU:\Software\Classes\$progId" -Force | Out-Null
  Set-ItemProperty -Path "HKCU:\Software\Classes\$progId" -Name '(default)' -Value $Script:AssociationLabel
  Set-RegistryDefaultIcon -KeyPath "HKCU:\Software\Classes\$progId\DefaultIcon"

  New-Item -Path $openWithListKey -Force | Out-Null
  New-ItemProperty -Path $openWithListKey -Name $appName -PropertyType String -Force | Out-Null

  New-Item -Path $openWithProgidsKey -Force | Out-Null
  New-ItemProperty -Path $openWithProgidsKey -Name $progId -PropertyType String -Force | Out-Null

  # Do not overwrite the user's current default ProgId here. Windows 10/11 stores
  # defaults in UserChoice with a hash, so only OpenWith registration is reliable.
  if (Test-Path $extensionKey) {
    Remove-ItemProperty -Path $extensionKey -Name '(default)' -ErrorAction SilentlyContinue
  }
}

function Register-Application {
  $appKey = "HKCU:\Software\Classes\Applications\$appName"
  $commandKey = "$appKey\shell\open\command"

  New-Item -Path $appKey -Force | Out-Null
  Set-ItemProperty -Path $appKey -Name 'FriendlyAppName' -Value $Script:AssociationLabel
  Set-RegistryDefaultIcon -KeyPath "$appKey\DefaultIcon"

  New-Item -Path $commandKey -Force | Out-Null
  Set-ItemProperty -Path $commandKey -Name '(default)' -Value $launcherCommand
}

function Unregister-Extension {
  param([string]$Extension)

  $openWithListKey = "HKCU:\Software\Classes\$Extension\OpenWithList"
  $openWithProgidsKey = "HKCU:\Software\Classes\$Extension\OpenWithProgids"

  if (Test-Path $openWithListKey) {
    Remove-ItemProperty -Path $openWithListKey -Name $appName -ErrorAction SilentlyContinue
  }

  if (Test-Path $openWithProgidsKey) {
    Remove-ItemProperty -Path $openWithProgidsKey -Name $progId -ErrorAction SilentlyContinue
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

  if (Test-Path "HKCU:\Software\Classes\Applications\$appName") {
    Remove-Item -Path "HKCU:\Software\Classes\Applications\$appName" -Recurse -Force
  }

  Write-Host 'Quiet Reader file associations removed from HKCU.'
  exit 0
}

Register-Application

foreach ($extension in $Script:SupportedExtensions) {
  Register-Extension -Extension $extension
}

Write-Host "Registered Quiet Reader for: $($Script:SupportedExtensions -join ', ')"
Write-Host "Launcher: $launcherBat"
Write-Host "Icon:     $iconPath"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Right-click a supported file in Explorer'
Write-Host '  2. Choose Open with -> Quiet Reader'
Write-Host '  3. Click "Always" if you want it as the default app'
Write-Host ''
Write-Host 'If icons look stale, restart Explorer or sign out and back in.'
Write-Host ''
Write-Host 'If Quiet Reader is missing from the list, choose "Choose another app"'
Write-Host 'and browse to:'
Write-Host "  $launcherBat"
Write-Host ''
Write-Host 'To verify manually:'
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\Test-Launcher.ps1`""
