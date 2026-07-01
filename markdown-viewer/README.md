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

## Ask about this document (Ollama)

Open a document and click **Ask** in the reader toolbar to chat with a **local** LLM about the current file. The app sends only the most relevant sections (by heading), not the entire document.

### Setup

1. Install [Ollama](https://ollama.com/) and start it: `ollama serve`
2. Pull a model, e.g. `ollama pull llama3.2`
3. If the browser cannot connect, allow cross-origin access and restart Ollama:

   ```bash
   # Windows (PowerShell)
   $env:OLLAMA_ORIGINS="*"
   ollama serve
   ```

4. In the assistant panel, expand **Ollama connection** to set the server URL (default `http://127.0.0.1:11434`) and model name.

Answers are grounded in retrieved document excerpts only. This requires Ollama running on your machine — it does not work without a local server.

**Context mode:** If the document is under ~36k characters, the **full document** is sent once per chat session and reused for follow-up questions. Longer documents use **relevant sections** (loaded once per session). The app auto-selects an installed model from `ollama list` if the saved model name is missing.
