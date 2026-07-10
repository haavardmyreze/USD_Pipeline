import { type ChangeEvent, type ClipboardEvent, useEffect, useRef, useState } from 'react'
import { type LibraryDoc } from './library'
import { type Theme, THEMES } from './theme'

type HomeProps = {
  docs: LibraryDoc[]
  activeDocId: string
  theme: Theme
  onSelectTheme: (theme: Theme) => void
  onOpen: (doc: LibraryDoc) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onImportFile: (file: File) => void | Promise<void>
  onImportFromClipboard: (content: string) => void
}

function PagePreview({ doc }: { doc: LibraryDoc }) {
  return (
    <div className="doc-card-preview" aria-hidden="true">
      <div className="doc-card-page">
        <span className="doc-card-page-title">{doc.title}</span>
        <span className="doc-card-page-rule" />
        <span className="doc-card-page-line" />
        <span className="doc-card-page-line" />
        <span className="doc-card-page-line short" />
        <span className="doc-card-page-line" />
        <span className="doc-card-page-line short" />
      </div>
    </div>
  )
}

function ThemeMenu({
  theme,
  onSelectTheme,
}: {
  theme: Theme
  onSelectTheme: (theme: Theme) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    if (!open) {
      return
    }
    const onPointerDown = (event: Event) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) {
        setOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="home-theme" ref={menuRef}>
      <button
        type="button"
        className={open ? 'icon-button active' : 'icon-button'}
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.8"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <circle cx="12" cy="12" r="3" />
          <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
        </svg>
      </button>

      {open ? (
        <div className="settings-popover home-theme-popover" role="dialog" aria-label="Settings">
          <div className="settings-group">
            <p className="settings-label">Theme</p>
            <div className="theme-grid">
              {THEMES.map((option) => (
                <button
                  type="button"
                  key={option.id}
                  className={theme === option.id ? 'theme-chip active' : 'theme-chip'}
                  onClick={() => onSelectTheme(option.id)}
                >
                  <span className="theme-swatch" data-theme={option.id} />
                  {option.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  )
}

function Home({
  docs,
  activeDocId,
  theme,
  onSelectTheme,
  onOpen,
  onImport,
  onImportFile,
  onImportFromClipboard,
}: HomeProps) {
  const pasteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)

  const handleClipboardPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    setClipboardError(null)

    const content = event.clipboardData.getData('text/plain')
    if (!content.trim()) {
      setClipboardError('Clipboard is empty.')
      return
    }

    try {
      onImportFromClipboard(content)
    } catch (error) {
      setClipboardError(
        error instanceof Error ? error.message : 'Could not open pasted content.',
      )
    } finally {
      if (pasteInputRef.current) {
        pasteInputRef.current.value = ''
      }
    }
  }

  return (
    <main className="home-shell">
      <div className="topbar-shell home-topbar-shell">
        <div className="home-topbar-row">
          <div className="home-brand">
            <p className="eyebrow">Markdown Viewer</p>
            <h1>Library</h1>
          </div>
          <header className="app-topbar topbar-pill home-header">
            <div className="home-actions">
              <ThemeMenu theme={theme} onSelectTheme={onSelectTheme} />
            </div>
          </header>
        </div>
      </div>

      <section className="home-body">
        <div className="home-section-head">
          <h2>Documents</h2>
          <span className="home-count">
            {docs.length} {docs.length === 1 ? 'document' : 'documents'}
          </span>
        </div>

        <div className="doc-grid">
          {docs.map((doc) => (
            <button
              type="button"
              key={doc.id}
              className={
                activeDocId === doc.id ? 'doc-card doc-card-active' : 'doc-card'
              }
              onClick={() => onOpen(doc)}
            >
              <PagePreview doc={doc} />
              <div className="doc-card-body">
                <span className="doc-card-title">{doc.title}</span>
                {doc.excerpt ? (
                  <span className="doc-card-excerpt">{doc.excerpt}</span>
                ) : null}
                <div className="doc-card-meta">
                  <span>{doc.readingMinutes} min read</span>
                  <span className="doc-card-dot" aria-hidden="true">
                    ·
                  </span>
                  <span>{doc.headingCount} sections</span>
                  {doc.folder ? (
                    <>
                      <span className="doc-card-dot" aria-hidden="true">
                        ·
                      </span>
                      <span className="doc-card-folder">{doc.folder}</span>
                    </>
                  ) : null}
                </div>
              </div>
              {activeDocId === doc.id ? (
                <span className="doc-card-badge">Last opened</span>
              ) : null}
            </button>
          ))}

          <label
            className={
              importDragOver
                ? 'doc-card doc-card-import doc-card-import-drag'
                : 'doc-card doc-card-import'
            }
            onDragEnter={(event) => {
              event.preventDefault()
              setImportDragOver(true)
            }}
            onDragOver={(event) => {
              event.preventDefault()
              event.dataTransfer.dropEffect = 'copy'
              setImportDragOver(true)
            }}
            onDragLeave={(event) => {
              if (event.currentTarget.contains(event.relatedTarget as Node)) {
                return
              }
              setImportDragOver(false)
            }}
            onDrop={(event) => {
              event.preventDefault()
              setImportDragOver(false)
              const file = event.dataTransfer.files?.[0]
              if (file) {
                void onImportFile(file)
              }
            }}
          >
            <div className="doc-card-import-icon" aria-hidden="true">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M12 5v14" />
                <path d="M5 12h14" />
              </svg>
            </div>
            <div className="doc-card-body">
              <span className="doc-card-title">Import from disk</span>
              <span className="doc-card-excerpt">
                {importDragOver
                  ? 'Drop your file here'
                  : 'Open a Markdown, PDF, or CSV file, or drag one here.'}
              </span>
            </div>
            <input
              type="file"
              accept=".md,.markdown,.pdf,.csv,text/markdown,text/plain,text/csv,application/pdf"
              onChange={onImport}
            />
          </label>

          <label
            className="doc-card doc-card-import doc-card-paste"
            onClick={() => pasteInputRef.current?.focus()}
          >
            <div className="doc-card-import-icon" aria-hidden="true">
              <svg
                width="26"
                height="26"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="8" y="2" width="8" height="4" rx="1" />
                <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
              </svg>
            </div>
            <div className="doc-card-body">
              <span className="doc-card-title">Paste from clipboard</span>
              <textarea
                ref={pasteInputRef}
                className="doc-card-paste-input"
                rows={2}
                placeholder="Click here, then press Ctrl+V (or ⌘V)"
                aria-label="Paste markdown from clipboard"
                onPaste={handleClipboardPaste}
                onChange={() => setClipboardError(null)}
              />
              {clipboardError ? (
                <span className="doc-card-error" role="alert">
                  {clipboardError}
                </span>
              ) : null}
            </div>
          </label>
        </div>

        {docs.length === 0 ? (
          <p className="home-empty">
            No library documents yet. Add <code>.md</code> files to{' '}
            <code>markdown-viewer/library/</code>, import one from disk, or paste
            from clipboard.
          </p>
        ) : null}
      </section>
    </main>
  )
}

export default Home
