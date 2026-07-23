import { type ChangeEvent, useCallback, useEffect, useState } from 'react'
import './App.css'
import { adapterForFileName, adapterForFormat } from './documents/adapter'
import { detectClipboardPaste } from './code/detectClipboardPaste'
import {
  documentKeyFor,
  externalErrorDocument,
  libraryDocumentState,
  loadExternalDocument,
  parseFileNameFromSrc,
  stateFromLocation,
  urlForState,
  type AppState,
  type OpenDocument,
} from './documentState'
import Home from './Home'
import { getLibraryDoc, libraryDocs, type LibraryDoc } from './library'
import {
  loadRecentDocuments,
  rememberRecentDocument,
  recentDocumentNeedsCache,
  type RecentDocument,
} from './recentDocuments'
import { loadCachedRecentDocument } from './recentDocumentCache'
import { clearHashImportFromUrl, parseHashImport } from './hashImport'
import { GlobalFileDropOverlay } from './ui/GlobalFileDropOverlay'
import { useTheme } from './ui/useTheme'
import { withViewTransition } from './ui/viewTransition'

const LAST_LIBRARY_DOC_KEY = 'mdv-library-doc'

function lastOpenedId() {
  try {
    return localStorage.getItem(LAST_LIBRARY_DOC_KEY) ?? ''
  } catch {
    return ''
  }
}

function rememberLibraryDoc(id: string) {
  try {
    localStorage.setItem(LAST_LIBRARY_DOC_KEY, id)
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}

function App() {
  const [state, setState] = useState<AppState>(() => {
    const hashDoc = parseHashImport(window.location.hash)
    if (hashDoc) {
      return { view: 'reader', doc: hashDoc }
    }

    return stateFromLocation()
  })
  const [recentDocs, setRecentDocs] = useState<RecentDocument[]>(() => loadRecentDocuments())
  const { theme, themePreference, setThemePreference } = useTheme()

  const refreshRecents = useCallback(() => {
    setRecentDocs(loadRecentDocuments())
  }, [])

  useEffect(() => {
    if (state.view !== 'reader' || !window.location.hash.startsWith('#import=')) {
      return
    }

    clearHashImportFromUrl()
    rememberRecentDocument(state.doc)
    refreshRecents()
  }, [state, refreshRecents])

  // Resolve external documents (?src=…) into an open document.
  useEffect(() => {
    if (state.view !== 'external') {
      return
    }

    const src = state.src
    const controller = new AbortController()

    loadExternalDocument(src, controller.signal, { fileName: state.fileName })
      .then((doc) => {
        rememberRecentDocument(doc, { externalSrc: src })
        refreshRecents()
        setState({ view: 'reader', doc })
      })
      .catch((error: unknown) => {
        if (error instanceof DOMException && error.name === 'AbortError') {
          return
        }
        const message = error instanceof Error ? error.message : 'Unknown error.'
        setState({ view: 'reader', doc: externalErrorDocument(src, message) })
      })

    return () => controller.abort()
  }, [state, refreshRecents])

  // Browser back/forward: re-derive state from the location.
  useEffect(() => {
    const onPopState = () => setState(stateFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  useEffect(() => {
    if (state.view === 'home') {
      refreshRecents()
      void Promise.all(
        loadRecentDocuments()
          .filter(recentDocumentNeedsCache)
          .map((entry) => loadCachedRecentDocument(entry.docKey)),
      )
    }
  }, [state.view, refreshRecents])

  /** Navigate to a state, updating history and scroll in one place. */
  const navigate = (next: AppState) => {
    withViewTransition(() => {
      setState(next)
    })
    window.scrollTo({ top: 0, behavior: 'auto' })
    window.history.pushState(null, '', urlForState(next))

    if (next.view === 'reader') {
      rememberRecentDocument(next.doc)
      refreshRecents()
    }

    if (next.view === 'reader' && next.doc.libraryId) {
      rememberLibraryDoc(next.doc.libraryId)
    }
  }

  const openLibraryDoc = (doc: LibraryDoc) => {
    const next = libraryDocumentState(doc.id)
    if (next) {
      navigate(next)
    }
  }

  const goHome = () => navigate({ view: 'home' })

  const openImported = (doc: OpenDocument) => {
    navigate({ view: 'reader', doc })
  }

  const onImportFile = useCallback(async (file: File) => {
    const adapter = adapterForFileName(file.name)
    const { source, fingerprint } = await adapter.readFile(file)
    openImported({ source, fileName: file.name, libraryId: '', fingerprint })
  }, [])

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    await onImportFile(file)
    event.target.value = ''
  }

  const onImportFromClipboard = (content: string) => {
    if (!content.trim()) {
      throw new Error('Clipboard is empty.')
    }

    const detected = detectClipboardPaste(content)

    if (detected.format === 'code') {
      openImported({
        source: {
          format: 'code',
          content: detected.content,
          language: detected.language,
        },
        fileName: detected.fileName,
        libraryId: '',
        fingerprint: detected.content,
      })
      return
    }

    openImported({
      source: { format: 'markdown', content: detected.content },
      fileName: detected.fileName,
      libraryId: '',
      fingerprint: detected.content,
    })
  }

  const openRecentDocument = async (entry: RecentDocument) => {
    const kind = entry.kind ?? (entry.libraryId ? 'library' : entry.externalSrc ? 'external' : 'import')

    if (kind === 'library' && entry.libraryId) {
      const doc = getLibraryDoc(entry.libraryId)
      if (doc) {
        openLibraryDoc(doc)
      }
      return
    }

    if (kind === 'external' && entry.externalSrc) {
      navigate({
        view: 'external',
        src: entry.externalSrc,
        fileName: entry.fileName,
      })
      return
    }

    const cached = await loadCachedRecentDocument(entry.docKey)
    if (cached) {
      openImported(cached)
    }
  }

  const renderContent = () => {
    if (state.view === 'home') {
      return (
        <Home
          docs={libraryDocs}
          recentDocs={recentDocs}
          activeDocId={lastOpenedId()}
          theme={theme}
          themePreference={themePreference}
          onSelectTheme={setThemePreference}
          onOpen={openLibraryDoc}
          onOpenRecent={openRecentDocument}
          onImport={onFileUpload}
          onImportFile={onImportFile}
          onImportFromClipboard={onImportFromClipboard}
        />
      )
    }

    if (state.view === 'external') {
      return (
        <div className="reader-root">
          <div className="pdf-loading-shell">
            <p>Loading {parseFileNameFromSrc(state.src)}…</p>
          </div>
        </div>
      )
    }

    const doc = state.doc
    const adapter = adapterForFormat(doc.source.format)
    const ReaderComponent = adapter.Reader

    return (
      <ReaderComponent
        source={doc.source}
        fileName={doc.fileName}
        docKey={documentKeyFor(doc)}
        theme={theme}
        themePreference={themePreference}
        onSelectTheme={setThemePreference}
        onHome={goHome}
        onOpenLibrary={openLibraryDoc}
      />
    )
  }

  return (
    <>
      <GlobalFileDropOverlay onImportFile={onImportFile} />
      {renderContent()}
    </>
  )
}

export default App
