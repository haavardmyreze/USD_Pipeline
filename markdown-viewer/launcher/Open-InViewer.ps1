param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$FilePaths
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\config.ps1"

$Script:LogPath = Join-Path $env:TEMP 'quiet-reader-launcher.log'

function Write-LauncherLog {
  param([string]$Message)
  $line = '{0} {1}' -f (Get-Date -Format 'yyyy-MM-dd HH:mm:ss'), $Message
  Add-Content -Path $Script:LogPath -Value $line -Encoding UTF8
}

function Write-LauncherError {
  param([string]$Message)
  Write-LauncherLog "ERROR: $Message"
  Write-Error $Message
  if ([Environment]::UserInteractive) {
    Add-Type -AssemblyName System.Windows.Forms
    [void][System.Windows.Forms.MessageBox]::Show(
      $Message,
      'Quiet Reader',
      [System.Windows.Forms.MessageBoxButtons]::OK,
      [System.Windows.Forms.MessageBoxIcon]::Warning
    )
  }
}

function Get-LauncherExtension {
  param([string]$Path)
  [IO.Path]::GetExtension($Path).ToLowerInvariant()
}

function Test-SupportedExtension {
  param([string]$Path)
  $extension = Get-LauncherExtension $Path
  return $Script:SupportedExtensions -contains $extension
}

function Get-LauncherMimeType {
  param([string]$Path)
  $extension = Get-LauncherExtension $Path
  if ($Script:MimeTypes.ContainsKey($extension)) {
    return $Script:MimeTypes[$extension]
  }
  return 'application/octet-stream'
}

function Test-TextLauncherFile {
  param([string]$Path)
  $extension = Get-LauncherExtension $Path
  return $extension -in '.md', '.markdown', '.csv'
}

function ConvertTo-JavaScriptString {
  param([string]$Value)
  return (
    '"' +
    ($Value -replace '\\', '\\\\' -replace '"', '\"' -replace "`r", '' -replace "`n", '\n') +
    '"'
  )
}

function New-DataUrl {
  param(
    [string]$Path,
    [string]$MimeType
  )

  if (Test-TextLauncherFile $Path) {
    $text = [IO.File]::ReadAllText($Path, [Text.UTF8Encoding]::new($false))
    return "data:$MimeType;charset=utf-8,$([uri]::EscapeDataString($text))"
  }

  $bytes = [IO.File]::ReadAllBytes($Path)
  $base64 = [Convert]::ToBase64String($bytes)
  return "data:$MimeType;base64,$base64"
}

function New-ViewerUrl {
  param(
    [string]$DataUrl,
    [string]$FileName
  )

  $encodedSrc = [uri]::EscapeDataString($DataUrl)
  $encodedName = [uri]::EscapeDataString($FileName)
  return "$($Script:ViewerOrigin)/?src=$encodedSrc&name=$encodedName"
}

function Open-ViewerUrl {
  param(
    [string]$ViewerUrl,
    [string]$FileName
  )

  # Always route through a local redirect page. This avoids Windows command-line
  # length limits and makes Start-Process behavior consistent across browsers.
  $redirectPath = [IO.Path]::Combine(
    [IO.Path]::GetTempPath(),
    ('quiet-reader-open-{0}.html' -f [guid]::NewGuid().ToString('N'))
  )

  $html = @"
<!doctype html>
<meta charset="utf-8">
<title>Opening $(($FileName -replace '&','&amp;' -replace '<','&lt;' -replace '>','&gt;'))…</title>
<p style="font: 14px/1.5 Segoe UI, sans-serif; color: #444; padding: 24px;">
  Opening in Quiet Reader…
</p>
<script>
location.replace($(ConvertTo-JavaScriptString $ViewerUrl));
</script>
"@

  [IO.File]::WriteAllText($redirectPath, $html, [Text.UTF8Encoding]::new($false))
  Write-LauncherLog "Opening redirect: $redirectPath"
  Write-LauncherLog "Target URL length: $($ViewerUrl.Length)"
  Start-Process -FilePath $redirectPath
}

function Open-DocumentInViewer {
  param([string]$Path)

  Write-LauncherLog "Open request: $Path"

  if (-not (Test-Path -LiteralPath $Path -PathType Leaf)) {
    Write-LauncherError "File not found: $Path"
    return
  }

  $resolved = (Resolve-Path -LiteralPath $Path).Path
  if (-not (Test-SupportedExtension $resolved)) {
    Write-LauncherError "Unsupported file type: $(Get-LauncherExtension $resolved)"
    return
  }

  $fileInfo = Get-Item -LiteralPath $resolved
  if ($fileInfo.Length -gt $Script:MaxSupportedBytes) {
    Write-LauncherError (
      "File is too large to open in the browser viewer ($([Math]::Round($fileInfo.Length / 1mb, 1)) MB). " +
      "Try opening Quiet Reader and dragging the file in instead."
    )
    return
  }

  $mimeType = Get-LauncherMimeType $resolved
  $dataUrl = New-DataUrl -Path $resolved -MimeType $mimeType
  $viewerUrl = New-ViewerUrl -DataUrl $dataUrl -FileName $fileInfo.Name
  Open-ViewerUrl -ViewerUrl $viewerUrl -FileName $fileInfo.Name
  Write-LauncherLog "Launch complete for $($fileInfo.Name)"
}

try {
  if (-not $FilePaths -or $FilePaths.Count -eq 0) {
    Write-LauncherLog 'No file path provided; opening viewer home page.'
    Start-Process $Script:ViewerOrigin
    exit 0
  }

  foreach ($path in $FilePaths) {
    if ([string]::IsNullOrWhiteSpace($path)) {
      continue
    }
    Open-DocumentInViewer -Path $path.Trim('"')
  }
} catch {
  Write-LauncherError $_.Exception.Message
  exit 1
}
