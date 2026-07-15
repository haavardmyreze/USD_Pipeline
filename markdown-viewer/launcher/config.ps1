# Quiet Reader launcher configuration.
# Edit ViewerOrigin if you deploy to a different host.

$Script:ViewerOrigin = 'https://usd-pipeline-k7aa.vercel.app'

# Files larger than this are served from a temporary localhost URL instead of
# being embedded in the browser URL (.NET URI encoding tops out around 65 KB).
$Script:MaxDataUrlFileBytes = 20kb

# Files larger than this are rejected with a helpful error.
$Script:MaxSupportedBytes = 24mb

$Script:SupportedExtensions = @(
  '.md',
  '.markdown',
  '.pdf',
  '.csv',
  '.png',
  '.jpg',
  '.jpeg',
  '.webp',
  '.gif',
  '.bmp',
  '.tif',
  '.tiff',
  '.exr',
  '.hdr'
)

$Script:MimeTypes = @{
  '.md' = 'text/markdown'
  '.markdown' = 'text/markdown'
  '.csv' = 'text/csv'
  '.pdf' = 'application/pdf'
  '.png' = 'image/png'
  '.jpg' = 'image/jpeg'
  '.jpeg' = 'image/jpeg'
  '.webp' = 'image/webp'
  '.gif' = 'image/gif'
  '.bmp' = 'image/bmp'
  '.tif' = 'image/tiff'
  '.tiff' = 'image/tiff'
  '.exr' = 'application/octet-stream'
  '.hdr' = 'application/octet-stream'
}

$Script:AssociationLabel = 'Quiet Reader'

# How long the temporary localhost server stays available for large files.
$Script:LocalServerMinutes = 15

$Script:LauncherIconFile = 'quiet-reader.ico'
$Script:LauncherScript = 'Open-InViewer.vbs'
# Windows shows this name in Open with; the command still launches the hidden .vbs handler.
$Script:LauncherAppName = 'Open-InViewer.bat'
