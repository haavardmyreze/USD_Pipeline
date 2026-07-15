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

function Get-FreeTcpPort {
  $listener = New-Object System.Net.Sockets.TcpListener([Net.IPAddress]::Loopback, 0)
  $listener.Start()
  try {
    return ($listener.LocalEndpoint).Port
  } finally {
    $listener.Stop()
  }
}

function Start-LocalFileServer {
  param(
    [string]$FilePath,
    [string]$MimeType,
    [string]$FileName
  )

  $port = Get-FreeTcpPort
  $serverMinutes = $Script:LocalServerMinutes

  $null = Start-Job -Name "QuietReaderFileServer-$port" -ScriptBlock {
    param($FilePath, $MimeType, $Port, $ServerMinutes)

    $listener = New-Object System.Net.HttpListener
    [void]$listener.Prefixes.Add("http://127.0.0.1:$Port/")
    $listener.Start()

    $deadline = (Get-Date).AddMinutes($ServerMinutes)
    $fileBytes = [IO.File]::ReadAllBytes($FilePath)

    while ($listener.IsListening -and (Get-Date) -lt $deadline) {
      $context = $listener.GetContext()
      try {
        $response = $context.Response
        $response.Headers.Add('Access-Control-Allow-Origin', '*')
        $response.Headers.Add('Access-Control-Allow-Private-Network', 'true')
        $response.Headers.Add('Access-Control-Allow-Methods', 'GET, OPTIONS')
        $response.Headers.Add('Access-Control-Allow-Headers', '*')

        if ($context.Request.HttpMethod -eq 'OPTIONS') {
          $response.StatusCode = 204
          $response.Close()
          continue
        }

        $response.StatusCode = 200
        $response.ContentType = $MimeType
        $response.ContentLength64 = $fileBytes.Length
        $response.OutputStream.Write($fileBytes, 0, $fileBytes.Length)
        $response.Close()
      } catch {
        try {
          $context.Response.Close()
        } catch {
          # ignore close errors
        }
      }
    }

    $listener.Stop()
  } -ArgumentList $FilePath, $MimeType, $port, $serverMinutes

  Start-Sleep -Milliseconds 300

  return "http://127.0.0.1:$port/$([uri]::EscapeDataString($FileName))"
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

function New-ViewerUrlFromData {
  param(
    [string]$DataUrl,
    [string]$FileName
  )

  $encodedSrc = [uri]::EscapeDataString($DataUrl)
  $encodedName = [uri]::EscapeDataString($FileName)
  return "$($Script:ViewerOrigin)/?src=$encodedSrc&name=$encodedName"
}

function New-ViewerUrlFromRemoteSrc {
  param(
    [string]$Src,
    [string]$FileName
  )

  $encodedSrc = [uri]::EscapeDataString($Src)
  $encodedName = [uri]::EscapeDataString($FileName)
  return "$($Script:ViewerOrigin)/?src=$encodedSrc&name=$encodedName"
}

function Open-ViewerUrl {
  param(
    [string]$ViewerUrl,
    [string]$FileName
  )

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
  $viewerUrl = $null

  if ($fileInfo.Length -gt $Script:MaxDataUrlFileBytes) {
    $localSrc = Start-LocalFileServer -FilePath $resolved -MimeType $mimeType -FileName $fileInfo.Name
    $viewerUrl = New-ViewerUrlFromRemoteSrc -Src $localSrc -FileName $fileInfo.Name
    Write-LauncherLog "Using local file server for $($fileInfo.Name) ($($fileInfo.Length) bytes)"
    Write-LauncherLog "Local source: $localSrc"
  } else {
    try {
      $dataUrl = New-DataUrl -Path $resolved -MimeType $mimeType
      $viewerUrl = New-ViewerUrlFromData -DataUrl $dataUrl -FileName $fileInfo.Name
      Write-LauncherLog "Using inline data URL for $($fileInfo.Name) ($($dataUrl.Length) chars)"
    } catch {
      Write-LauncherLog "Inline data URL failed; falling back to local file server. $($_.Exception.Message)"
      $localSrc = Start-LocalFileServer -FilePath $resolved -MimeType $mimeType -FileName $fileInfo.Name
      $viewerUrl = New-ViewerUrlFromRemoteSrc -Src $localSrc -FileName $fileInfo.Name
      Write-LauncherLog "Local source: $localSrc"
    }
  }

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
