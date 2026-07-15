# Windows launcher

Open local documents in the hosted Quiet Reader using a small PowerShell launcher and Windows file associations.

## Setup

1. Edit `config.ps1` if your viewer URL is not `https://usd-pipeline-k7aa.vercel.app`.
2. Register file associations (per-user, no admin required):

```powershell
cd markdown-viewer/launcher
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1
```

3. In Explorer, right-click a supported file → **Open with** → **Quiet Reader** → **Always**.

Supported extensions: `.md`, `.markdown`, `.pdf`, `.csv`, `.png`, `.jpg`, `.jpeg`, `.webp`, `.gif`, `.bmp`, `.tif`, `.tiff`, `.exr`, `.hdr`.

## Manual test

```powershell
powershell -ExecutionPolicy Bypass -File .\Open-InViewer.ps1 "C:\path\to\note.md"
```

Or double-click `Open-InViewer.bat` after passing a file path.

## How it works

Browsers cannot read `C:\...` paths from a remote Vercel app. The launcher:

1. Reads the local file
2. Encodes it as a `data:` URL
3. Opens `https://usd-pipeline-k7aa.vercel.app/?src=...&name=...` in your default browser

Large files use a temporary local HTML redirect page to avoid Windows command-line length limits.

Very large files (> 24 MB) are rejected with a message to drag the file into an already-open viewer tab instead.

## Remove associations

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1 -Unregister
```
