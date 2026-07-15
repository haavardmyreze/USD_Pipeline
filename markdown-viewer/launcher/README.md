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
powershell -ExecutionPolicy Bypass -File .\Test-Launcher.ps1
```

This opens `library/welcome.md` and prints diagnostics. If something fails, check:

```
%TEMP%\quiet-reader-launcher.log
```

## Troubleshooting

- **Quiet Reader is not in the Open with list:** run `Register-ViewerAssociations.ps1` again, then use **Open with → Choose another app → Browse** and select `Open-InViewer.bat`.
- **A blank tab flashes and nothing opens:** open the log file above and re-run `Test-Launcher.ps1`.
- **The browser opens but the document is empty:** wait for Vercel to finish deploying the latest `main` branch, then try again.
- **Very large files:** drag the file into an already-open Quiet Reader tab instead.

## How it works

Browsers cannot read `C:\...` paths from a remote Vercel app. The launcher:

1. Reads the local file
2. Encodes it as a `data:` URL
3. Opens a temporary local HTML page that redirects to `https://usd-pipeline-k7aa.vercel.app/?src=...&name=...`

Very large files (> 24 MB) are rejected with a message to drag the file into an already-open viewer tab instead.

## Remove associations

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1 -Unregister
```
