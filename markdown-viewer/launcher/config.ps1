# Quiet Reader launcher configuration.
# Edit ViewerOrigin if you deploy to a different host.

$Script:ViewerOrigin = 'https://usd-pipeline-k7aa.vercel.app'

# Files larger than this use a temporary local redirect page instead of a
# direct browser launch (avoids Windows command-line length limits).
$Script:MaxDirectLaunchBytes = 512kb

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
