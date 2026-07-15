import {
  type ChangeEvent,
  type ClipboardEvent,
  useCallback,
  useRef,
  useState,
} from 'react'
import { importAcceptString } from './documents/adapter'
import { type LibraryDoc } from './library'
import { type Theme, type ThemePreference } from './theme'
import { ClipboardIcon, PlusIcon, SettingsIcon } from './ui/icons'
import { CommandPalette } from './ui/CommandPalette'
import { libraryPaletteGroup, themePaletteGroup } from './ui/paletteGroups'
import { loadReadingPosition } from './readingPosition'
import { ThemePicker } from './ui/ThemePicker'
import { useDismissablePopover } from './ui/usePopover'

type HomeProps = {
  docs: LibraryDoc[]
  activeDocId: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
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
  preference,
  onSelect,
}: {
  preference: ThemePreference
  onSelect: (preference: ThemePreference) => void
}) {
  const [open, setOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement | null>(null)
  const close = useCallback(() => setOpen(false), [])

  useDismissablePopover(menuRef, open, close)

  return (
    <div className="home-theme" ref={menuRef}>
      <button
        type="button"
        className={open ? 'icon-button active' : 'icon-button'}
        aria-label="Settings"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
      >
        <SettingsIcon />
      </button>

      {open ? (
        <div className="settings-popover home-theme-popover" role="dialog" aria-label="Settings">
          <ThemePicker preference={preference} onSelect={onSelect} />
        </div>
      ) : null}
    </div>
  )
}

function Home({
  docs,
  activeDocId,
  theme,
  themePreference,
  onSelectTheme,
  onOpen,
  onImport,
  onImportFile,
  onImportFromClipboard,
}: HomeProps) {
  const pasteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)

  // Library docs use their id as docKey, so the resume lookup is direct.
  const resume = activeDocId ? loadReadingPosition(activeDocId) : null
  const resumeLabel =
    resume && resume.progress > 0.02
      ? `Resume · ${Math.round(resume.progress * 100)}%`
      : 'Last opened'

  const paletteGroups = [
    libraryPaletteGroup(onOpen),
    themePaletteGroup(themePreference, onSelectTheme),
  ]

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
    <main className="home-shell" data-theme={theme}>
      <CommandPalette groups={paletteGroups} />
      <div className="topbar-shell home-topbar-shell">
        <div className="home-topbar-row">
          <div className="home-brand">
            <p className="eyebrow">Markdown Viewer</p>
            <h1>Library</h1>
          </div>
          <header className="app-topbar topbar-pill home-header">
            <div className="home-actions">
              <ThemeMenu preference={themePreference} onSelect={onSelectTheme} />
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
                <span className="doc-card-badge">{resumeLabel}</span>
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
              <PlusIcon />
            </div>
            <div className="doc-card-body">
              <span className="doc-card-title">Import from disk</span>
              <span className="doc-card-excerpt">
                {importDragOver
                  ? 'Drop your file here'
                  : 'Open a Markdown, PDF, or CSV file, or drag one here.'}
              </span>
            </div>
            <input type="file" accept={importAcceptString()} onChange={onImport} />
          </label>

          <label
            className="doc-card doc-card-import doc-card-paste"
            onClick={() => pasteInputRef.current?.focus()}
          >
            <div className="doc-card-import-icon" aria-hidden="true">
              <ClipboardIcon />
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
