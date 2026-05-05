# USD Pipeline Toolkit - Step 2: Houdini HIP Saver

This folder contains the Houdini save enforcement tool for studio HIP naming and location rules.

## Files

- `tools/hip_saver.py`: Full save logic, dialogs, validation, and Ctrl+S handler.
- `houdini/toolbar/studio_pipeline.shelf`: Shelf file with the `Studio Save` tool.

## What artists get

- A `Studio Save` shelf button for first save.
- A Ctrl+S override that routes through the studio save flow only for managed HIP files.
- Live validation and filename/path previews before every save.

## One-time installation (artist-friendly)

### 1) Install shelf tool

1. Copy `studio_pipeline.shelf` into your Houdini shelf folder (for your Houdini version).
2. In Houdini, open **Shelves** -> **Shelf Sets** / **Manage Shelves**.
3. Load `studio_pipeline.shelf` if needed.
4. Confirm that the **Studio Save** tool appears.

### 2) Install Ctrl+S override

1. In Houdini, open **Edit** -> **Hotkeys**.
2. Find the action currently bound to Ctrl+S (save file).
3. Create a Python command hotkey that runs:

```python
import runpy
runpy.run_path(r"V:/Projects_Havard/USD_RND/USD_Pipeline/hip_saver/tools/hip_saver.py")["run_from_ctrl_s"]()
```

4. Bind this command to Ctrl+S in your chosen key context.
5. Remove or remap the old Ctrl+S binding so only this command triggers on Ctrl+S.

## How it works

- `Studio Save` (shelf button) always opens the full new-file dialog.
- First save creates an empty `.studiomanaged` file beside the HIP file.
- Ctrl+S checks for `.studiomanaged`:
  - If present: opens Studio Save dialog (prefilled from current HIP).
  - If absent: runs regular Houdini save.

## Important behavior

- The tool only reads `pipeline.json` and never writes to it.
- If `pipeline.json` cannot be found or validated for a managed save, saving is blocked with an error.
- Descriptor and artist values are validated live and save actions stay disabled until valid.
