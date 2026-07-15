Set-StrictMode -Version Latest
$ErrorActionPreference = 'Stop'

function Draw-QuietReaderIcon {
  param(
    [System.Drawing.Graphics]$Graphics,
    [int]$Size
  )

  $Graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
  $Graphics.Clear([System.Drawing.Color]::Transparent)

  $padding = [int][Math]::Round($Size * 0.14)
  $docWidth = $Size - (2 * $padding)
  $docHeight = [int][Math]::Round($docWidth * 1.12)
  $x = $padding
  $y = [int][Math]::Round(($Size - $docHeight) / 2)

  $shadowColor = [System.Drawing.Color]::FromArgb(36, 20, 18, 32)
  $shadowBrush = New-Object System.Drawing.SolidBrush $shadowColor

  $shadowRect = New-Object System.Drawing.Rectangle ($x + 2), ($y + 4), $docWidth, $docHeight
  $Graphics.FillRectangle($shadowBrush, $shadowRect)

  $pageRect = New-Object System.Drawing.Rectangle $x, $y, $docWidth, $docHeight
  $pagePath = Get-RoundedRectanglePath -Bounds $pageRect -Radius ([int][Math]::Max(2, $Size / 16))
  $pageFill = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 251, 249, 255))
  $pageBorder = New-Object System.Drawing.Pen ([System.Drawing.Color]::FromArgb(255, 214, 205, 232))
  $Graphics.FillPath($pageFill, $pagePath)
  $Graphics.DrawPath($pageBorder, $pagePath)

  $accentRect = New-Object System.Drawing.Rectangle $x, $y, $docWidth, ([int][Math]::Max(3, [Math]::Round($Size * 0.07)))
  $accentPath = Get-RoundedTopRectanglePath -Bounds $pageRect -TopHeight $accentRect.Height -Radius ([int][Math]::Max(2, $Size / 16))
  $accentBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 134, 59, 255))
  $Graphics.FillPath($accentBrush, $accentPath)

  $lineBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 198, 188, 214))
  $lineHeight = [int][Math]::Max(2, [Math]::Round($Size * 0.035))
  $lineY = $y + $accentRect.Height + [int][Math]::Round($Size * 0.11)
  $lineGap = [int][Math]::Max(2, [Math]::Round($Size * 0.055))
  $lineX = $x + [int][Math]::Round($docWidth * 0.14)
  $lineWidths = @(
    [int][Math]::Round($docWidth * 0.72),
    [int][Math]::Round($docWidth * 0.62),
    [int][Math]::Round($docWidth * 0.68),
    [int][Math]::Round($docWidth * 0.48)
  )

  foreach ($lineWidth in $lineWidths) {
    $lineRect = New-Object System.Drawing.Rectangle $lineX, $lineY, $lineWidth, $lineHeight
    $Graphics.FillRectangle($lineBrush, $lineRect)
    $lineY += $lineHeight + $lineGap
  }

  $markSize = [int][Math]::Round($Size * 0.22)
  $markX = $x + $docWidth - [int][Math]::Round($markSize * 0.72)
  $markY = $y + $docHeight - [int][Math]::Round($markSize * 0.78)
  $markBrush = New-Object System.Drawing.SolidBrush ([System.Drawing.Color]::FromArgb(255, 126, 20, 255))
  $markRect = New-Object System.Drawing.Rectangle $markX, $markY, $markSize, $markSize
  $Graphics.FillEllipse($markBrush, $markRect)
}

function Get-RoundedRectanglePath {
  param(
    [System.Drawing.Rectangle]$Bounds,
    [int]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($Bounds.X, $Bounds.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Y, $diameter, $diameter, 270, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Bottom - $diameter, $diameter, $diameter, 0, 90)
  $path.AddArc($Bounds.X, $Bounds.Bottom - $diameter, $diameter, $diameter, 90, 90)
  $path.CloseFigure()
  return $path
}

function Get-RoundedTopRectanglePath {
  param(
    [System.Drawing.Rectangle]$Bounds,
    [int]$TopHeight,
    [int]$Radius
  )

  $path = New-Object System.Drawing.Drawing2D.GraphicsPath
  $diameter = $Radius * 2
  $path.AddArc($Bounds.X, $Bounds.Y, $diameter, $diameter, 180, 90)
  $path.AddArc($Bounds.Right - $diameter, $Bounds.Y, $diameter, $diameter, 270, 90)
  $path.AddLine($Bounds.Right, $Bounds.Y + $TopHeight, $Bounds.X, $Bounds.Y + $TopHeight)
  $path.CloseFigure()
  return $path
}

function Save-QuietReaderIcon {
  param(
    [string]$OutputPath,
    [int[]]$Sizes = @(16, 32, 48, 256)
  )

  Add-Type -AssemblyName System.Drawing

  $images = New-Object System.Collections.Generic.List[System.Drawing.Bitmap]
  try {
    foreach ($size in $Sizes) {
      $bitmap = New-Object System.Drawing.Bitmap $size, $size, ([System.Drawing.Imaging.PixelFormat]::Format32bppArgb)
      $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
      try {
        Draw-QuietReaderIcon -Graphics $graphics -Size $size
      } finally {
        $graphics.Dispose()
      }
      [void]$images.Add($bitmap)
    }

    Save-BitmapListAsIcon -Images $images -OutputPath $OutputPath
  } finally {
    foreach ($image in $images) {
      $image.Dispose()
    }
  }
}

function Save-BitmapListAsIcon {
  param(
    [System.Collections.Generic.List[System.Drawing.Bitmap]]$Images,
    [string]$OutputPath
  )

  $stream = [System.IO.File]::Open($OutputPath, [System.IO.FileMode]::Create)
  try {
    $writer = New-Object System.IO.BinaryWriter $stream
    $writer.Write([uint16]0)
    $writer.Write([uint16]1)
    $writer.Write([uint16]$Images.Count)

    $offset = 6 + (16 * $Images.Count)
    $imageData = New-Object System.Collections.Generic.List[byte[]]

    foreach ($image in $Images) {
      $pngStream = New-Object System.IO.MemoryStream
      try {
        $image.Save($pngStream, [System.Drawing.Imaging.ImageFormat]::Png)
        [void]$imageData.Add($pngStream.ToArray())
      } finally {
        $pngStream.Dispose()
      }
    }

    for ($index = 0; $index -lt $Images.Count; $index += 1) {
      $image = $Images[$index]
      $writer.Write([byte][Math]::Min(255, $image.Width))
      $writer.Write([byte][Math]::Min(255, $image.Height))
      $writer.Write([byte]0)
      $writer.Write([byte]0)
      $writer.Write([uint16]1)
      $writer.Write([uint16]32)
      $writer.Write([uint32]$imageData[$index].Length)
      $writer.Write([uint32]$offset)
      $offset += $imageData[$index].Length
    }

    foreach ($data in $imageData) {
      $writer.Write($data)
    }
  } finally {
    $stream.Dispose()
  }
}

function Ensure-LauncherIcon {
  param(
    [string]$OutputPath = (Join-Path $PSScriptRoot 'quiet-reader.ico')
  )

  $sourceSvg = Join-Path (Split-Path $PSScriptRoot -Parent) 'public\favicon.svg'
  $outputDirectory = Split-Path $OutputPath -Parent
  if (-not (Test-Path -LiteralPath $outputDirectory)) {
    New-Item -ItemType Directory -Path $outputDirectory | Out-Null
  }

  if (Get-Command magick -ErrorAction SilentlyContinue) {
    if (Test-Path -LiteralPath $sourceSvg) {
      & magick $sourceSvg -background none -define icon:auto-resize=256,128,64,48,32,16 $OutputPath
      return (Resolve-Path -LiteralPath $OutputPath).Path
    }
  }

  Save-QuietReaderIcon -OutputPath $OutputPath
  return (Resolve-Path -LiteralPath $OutputPath).Path
}

if ($MyInvocation.InvocationName -ne '.') {
  $iconPath = Ensure-LauncherIcon
  Write-Host "Wrote launcher icon: $iconPath"
}
