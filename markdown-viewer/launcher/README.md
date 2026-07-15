# Windows launcher

Open local documents in the hosted Quiet Reader using a small PowerShell launcher and Windows file associations.

## Setup

1. Edit `config.ps1` if your viewer URL is not `https://usd-pipeline-k7aa.vercel.app`.
2. Register file associations (per-user, no admin required):

```powershell
cd markdown-viewer/launcher
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1
```

This also installs `quiet-reader.ico` for the **Quiet Reader** app and associated file types.

3. In Explorer, right-click a supported file → **Open with** → **Quiet Reader** → **Always**.

File associations register as **Quiet Reader** (`Open-InViewer.bat` in the Open with list) but launch the hidden `Open-InViewer.vbs` handler, so no command prompt appears.

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
- **A command prompt flashes:** re-run `Register-ViewerAssociations.ps1` and pick **Quiet Reader** again as the default. The registered handler should invoke the hidden `.vbs` launcher, not the batch file directly.
- **A blank tab flashes and nothing opens:** open the log file above and re-run `Test-Launcher.ps1`.
- **The browser opens but the document is empty:** wait for Vercel to finish deploying the latest `main` branch, then try again. Large files rely on a temporary localhost server — keep the launcher window/job alive for a few seconds after opening.
- **Icons still look blank or generic:** re-run `Register-ViewerAssociations.ps1`, then restart Explorer (Task Manager → Windows Explorer → Restart) or sign out and back in.
- **Very large files:** drag the file into an already-open Quiet Reader tab instead.

## How it works

Browsers cannot read `C:\...` paths from a remote Vercel app. The launcher:

1. Reads the local file
2. For small files (under ~20 KB), embeds the content as a `data:` URL in the viewer link
3. For larger files, starts a temporary localhost server and opens `?src=http://127.0.0.1:...&name=...`
4. Opens a temporary local HTML page that redirects your browser to Quiet Reader

Very large files (> 24 MB) are rejected with a message to drag the file into an already-open viewer tab instead.

## Remove associations

```powershell
powershell -ExecutionPolicy Bypass -File .\Register-ViewerAssociations.ps1 -Unregister
```
