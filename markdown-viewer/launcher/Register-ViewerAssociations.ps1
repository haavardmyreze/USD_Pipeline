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

$launcherVbs = [IO.Path]::GetFullPath((Join-Path $PSScriptRoot $Script:LauncherScript))
$wscriptExe = Join-Path $env:SystemRoot 'System32\wscript.exe'
$launcherCommand = "`"$wscriptExe`" //Nologo `"$launcherVbs`" `"%1`""
$progId = 'QuietReader.Document'
$appName = $Script:LauncherAppName
$legacyAppNames = @('Open-InViewer.vbs')
$iconPath = Ensure-LauncherIcon -OutputPath (Join-Path $PSScriptRoot $Script:LauncherIconFile)
$iconRef = "`"$iconPath`",0"
$registeredAppsKey = 'HKCU:\Software\RegisteredApplications'

function Set-RegistryDefaultIcon {
  param([string]$KeyPath)

  New-Item -Path $KeyPath -Force | Out-Null
  Set-ItemProperty -Path $KeyPath -Name '(default)' -Value $iconRef
}

function Remove-LegacyOpenWithEntries {
  param([string]$Extension)

  $openWithListKey = "HKCU:\Software\Classes\$Extension\OpenWithList"
  if (-not (Test-Path $openWithListKey)) {
    return
  }

  foreach ($legacyName in $legacyAppNames) {
    Remove-ItemProperty -Path $openWithListKey -Name $legacyName -ErrorAction SilentlyContinue
  }
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
  Remove-LegacyOpenWithEntries -Extension $Extension

  New-Item -Path $openWithProgidsKey -Force | Out-Null
  New-ItemProperty -Path $openWithProgidsKey -Name $progId -PropertyType String -Force | Out-Null

  if (Test-Path $extensionKey) {
    Remove-ItemProperty -Path $extensionKey -Name '(default)' -ErrorAction SilentlyContinue
  }
}

function Register-Application {
  $appKey = "HKCU:\Software\Classes\Applications\$appName"
  $commandKey = "$appKey\shell\open\command"

  New-Item -Path $appKey -Force | Out-Null
  Set-ItemProperty -Path $appKey -Name 'FriendlyAppName' -Value $Script:AssociationLabel
  Set-ItemProperty -Path $appKey -Name 'ApplicationCompany' -Value $Script:AssociationLabel
  Set-RegistryDefaultIcon -KeyPath "$appKey\DefaultIcon"

  foreach ($extension in $Script:SupportedExtensions) {
    $supportedTypeKey = "$appKey\SupportedTypes\$extension"
    New-Item -Path $supportedTypeKey -Force | Out-Null
  }

  New-Item -Path $commandKey -Force | Out-Null
  Set-ItemProperty -Path $commandKey -Name '(default)' -Value $launcherCommand

  New-Item -Path $registeredAppsKey -Force | Out-Null
  New-ItemProperty -Path $registeredAppsKey -Name 'QuietReader' -Value "Applications\$appName" -PropertyType String -Force | Out-Null
}

function Unregister-Extension {
  param([string]$Extension)

  $openWithListKey = "HKCU:\Software\Classes\$Extension\OpenWithList"
  $openWithProgidsKey = "HKCU:\Software\Classes\$Extension\OpenWithProgids"

  if (Test-Path $openWithListKey) {
    Remove-ItemProperty -Path $openWithListKey -Name $appName -ErrorAction SilentlyContinue
    foreach ($legacyName in $legacyAppNames) {
      Remove-ItemProperty -Path $openWithListKey -Name $legacyName -ErrorAction SilentlyContinue
    }
  }

  if (Test-Path $openWithProgidsKey) {
    Remove-ItemProperty -Path $openWithProgidsKey -Name $progId -ErrorAction SilentlyContinue
  }
}

function Remove-LegacyApplications {
  foreach ($legacyName in $legacyAppNames) {
    $legacyKey = "HKCU:\Software\Classes\Applications\$legacyName"
    if (Test-Path $legacyKey) {
      Remove-Item -Path $legacyKey -Recurse -Force
    }
  }
}

if (-not (Test-Path -LiteralPath $launcherVbs)) {
  throw "Launcher not found: $launcherVbs"
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

  Remove-ItemProperty -Path $registeredAppsKey -Name 'QuietReader' -ErrorAction SilentlyContinue
  Remove-LegacyApplications

  Write-Host 'Quiet Reader file associations removed from HKCU.'
  exit 0
}

Register-Application
Remove-LegacyApplications

foreach ($extension in $Script:SupportedExtensions) {
  Register-Extension -Extension $extension
}

Write-Host "Registered Quiet Reader for: $($Script:SupportedExtensions -join ', ')"
Write-Host "Open with app: $appName"
Write-Host "Hidden launcher: $launcherVbs"
Write-Host "Icon: $iconPath"
Write-Host ''
Write-Host 'Next steps:'
Write-Host '  1. Right-click a supported file in Explorer'
Write-Host '  2. Choose Open with -> Quiet Reader'
Write-Host '  3. Click "Always" if you want it as the default app'
Write-Host ''
Write-Host 'If Quiet Reader is missing from the list, choose "Choose another app"'
Write-Host 'and browse to either:'
Write-Host "  $(Join-Path $PSScriptRoot $appName)"
Write-Host "  $launcherVbs"
Write-Host ''
Write-Host 'If icons look stale, restart Explorer or sign out and back in.'
Write-Host ''
Write-Host 'To verify manually:'
Write-Host "  powershell -ExecutionPolicy Bypass -File `"$PSScriptRoot\Test-Launcher.ps1`""
