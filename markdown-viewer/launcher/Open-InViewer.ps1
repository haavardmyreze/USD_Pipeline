param(
  [Parameter(ValueFromRemainingArguments = $true)]
  [string[]]$FilePaths
)

Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

. "$PSScriptRoot\config.ps1"

function Write-LauncherError {
  param([string]$Message)
  Write-Error $Message
  if ([Environment]::UserInteractive) {
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
    [int]$FileSize
  )

  if ($FileSize -le $Script:MaxDirectLaunchBytes) {
    Start-Process $ViewerUrl
    return
  }

  $redirectPath = [IO.Path]::Combine(
    [IO.Path]::GetTempPath(),
    ('quiet-reader-open-{0}.html' -f [guid]::NewGuid().ToString('N'))
  )

  $html = @"
<!doctype html>
<meta charset="utf-8">
<title>Opening in Quiet Reader…</title>
<p style="font: 14px/1.5 Segoe UI, sans-serif; color: #444; padding: 24px;">
  Opening in Quiet Reader…
</p>
<script>
location.replace($(ConvertTo-JavaScriptString $ViewerUrl));
</script>
"@

  [IO.File]::WriteAllText($redirectPath, $html, [Text.UTF8Encoding]::new($false))
  Start-Process $redirectPath
}

function Open-DocumentInViewer {
  param([string]$Path)

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
  Open-ViewerUrl -ViewerUrl $viewerUrl -FileSize $fileInfo.Length
}

Add-Type -AssemblyName System.Windows.Forms

if (-not $FilePaths -or $FilePaths.Count -eq 0) {
  Start-Process $Script:ViewerOrigin
  exit 0
}

foreach ($path in $FilePaths) {
  if ([string]::IsNullOrWhiteSpace($path)) {
    continue
  }
  Open-DocumentInViewer -Path $path.Trim('"')
}
