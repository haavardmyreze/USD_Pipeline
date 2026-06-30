# Quiet Reader

A calm, typography-focused Markdown viewer with table of contents, page mode, and themes.

## Run locally

```bash
npm install
npm run dev
```

## Document library

Add Markdown files to the `library/` folder in this project:

```
markdown-viewer/library/
  welcome.md
  your-guide.md
  guides/naming-conventions.md
```

Every `.md` file is picked up automatically and listed in the **Library** menu — no configuration or file picker needed. Titles come from the document's first `#` heading.

Subfolders are supported. Files named `README.md` or starting with `_` are ignored.

You can still use **Load Markdown** to open a one-off file from disk.

### Deep links

Open a library document directly:

```
http://localhost:5173/?doc=welcome
http://localhost:5173/?doc=guides/naming-conventions
```

The last opened library document is remembered in the browser.
