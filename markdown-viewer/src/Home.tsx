import {
  type ChangeEvent,
  type ClipboardEvent,
  useCallback,
  useMemo,
  useRef,
  useState,
} from 'react'
import { importAcceptString } from './documents/adapter'
import {
  buildHomeDocuments,
  homeDocumentActive,
  homeDocumentDocKey,
  homeDocumentExcerpt,
  homeDocumentFormat,
  homeDocumentLibraryDoc,
  homeDocumentTitle,
} from './homeDocuments'
import { getLibraryDoc, type LibraryDoc } from './library'
import { formatRecentFormatLabel, formatRecentOpenedAgo, type RecentDocument } from './recentDocuments'
import { type Theme, type ThemePreference } from './theme'
import { DocumentFormatPreview } from './ui/DocumentFormatPreview'
import { readClipboardImageFile } from './ui/clipboardImage'
import { ClipboardIcon, PlusIcon, SettingsIcon } from './ui/icons'
import { CommandPalette } from './ui/CommandPalette'
import { libraryPaletteGroup, themePaletteGroup } from './ui/paletteGroups'
import { loadReadingPosition } from './readingPosition'
import { ThemePicker } from './ui/ThemePicker'
import { useDismissablePopover } from './ui/usePopover'

type HomeProps = {
  docs: LibraryDoc[]
  recentDocs: RecentDocument[]
  activeDocId: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onOpen: (doc: LibraryDoc) => void
  onOpenRecent: (entry: RecentDocument) => void
  onImport: (event: ChangeEvent<HTMLInputElement>) => void
  onImportFile: (file: File) => void | Promise<void>
  onImportFromClipboard: (content: string) => void
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
  recentDocs,
  activeDocId,
  theme,
  themePreference,
  onSelectTheme,
  onOpen,
  onOpenRecent,
  onImport,
  onImportFile,
  onImportFromClipboard,
}: HomeProps) {
  const pasteInputRef = useRef<HTMLTextAreaElement | null>(null)
  const [clipboardError, setClipboardError] = useState<string | null>(null)
  const [importDragOver, setImportDragOver] = useState(false)

  const homeDocuments = useMemo(
    () => buildHomeDocuments(recentDocs, docs),
    [recentDocs, docs],
  )

  const paletteGroups = [
    libraryPaletteGroup(onOpen),
    themePaletteGroup(themePreference, onSelectTheme),
  ]

  const handleClipboardPaste = (event: ClipboardEvent<HTMLTextAreaElement>) => {
    event.preventDefault()
    setClipboardError(null)

    const imageFile = readClipboardImageFile(event.clipboardData)
    if (imageFile) {
      void Promise.resolve(onImportFile(imageFile)).catch((error: unknown) => {
        setClipboardError(
          error instanceof Error ? error.message : 'Could not open pasted image.',
        )
      })
      if (pasteInputRef.current) {
        pasteInputRef.current.value = ''
      }
      return
    }

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
            {homeDocuments.length}{' '}
            {homeDocuments.length === 1 ? 'document' : 'documents'}
          </span>
        </div>

        <div className="doc-grid">
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
                placeholder="Click here, then press Ctrl+V (or ⌘V) to paste text, code, or an image"
                aria-label="Paste markdown, code, or an image from clipboard"
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
                  : 'Open a file from disk, or drag one anywhere on screen.'}
              </span>
            </div>
            <input type="file" accept={importAcceptString()} onChange={onImport} />
          </label>

          {homeDocuments.map((item) => {
            const libraryDoc = homeDocumentLibraryDoc(item, getLibraryDoc)
            const title = homeDocumentTitle(item, getLibraryDoc)
            const excerpt = homeDocumentExcerpt(item, getLibraryDoc)
            const format = homeDocumentFormat(item)
            const docKey = homeDocumentDocKey(item)
            const isActive = homeDocumentActive(item, activeDocId)
            const resume = loadReadingPosition(docKey)
            const resumeLabel =
              resume && resume.progress > 0.02
                ? `Resume · ${Math.round(resume.progress * 100)}%`
                : isActive
                  ? 'Last opened'
                  : null

            return (
              <button
                key={item.key}
                type="button"
                className={isActive ? 'doc-card doc-card-active' : 'doc-card'}
                onClick={() => {
                  if (item.source === 'recent') {
                    void onOpenRecent(item.entry)
                    return
                  }

                  onOpen(item.doc)
                }}
              >
                <DocumentFormatPreview format={format} title={title} />
                <div className="doc-card-body">
                  <span className="doc-card-title">{title}</span>
                  {excerpt ? (
                    <span className="doc-card-excerpt">{excerpt}</span>
                  ) : null}
                  <div className="doc-card-meta">
                    <span>{formatRecentFormatLabel(format)}</span>
                    {item.source === 'recent' ? (
                      <>
                        <span className="doc-card-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{formatRecentOpenedAgo(item.entry.openedAt)}</span>
                      </>
                    ) : (
                      <>
                        <span className="doc-card-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{item.doc.readingMinutes} min read</span>
                        <span className="doc-card-dot" aria-hidden="true">
                          ·
                        </span>
                        <span>{item.doc.headingCount} sections</span>
                      </>
                    )}
                    {libraryDoc?.folder ? (
                      <>
                        <span className="doc-card-dot" aria-hidden="true">
                          ·
                        </span>
                        <span className="doc-card-folder">{libraryDoc.folder}</span>
                      </>
                    ) : null}
                  </div>
                </div>
                {resumeLabel ? (
                  <span className="doc-card-badge">{resumeLabel}</span>
                ) : null}
              </button>
            )
          })}
        </div>

        {homeDocuments.length === 0 ? (
          <p className="home-empty">
            No library documents yet. Add <code>.md</code> files to{' '}
            <code>markdown-viewer/library/</code>, import one from disk, or paste
            text or an image from clipboard.
          </p>
        ) : null}
      </section>
    </main>
  )
}

export default Home
