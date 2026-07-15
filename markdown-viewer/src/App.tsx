import { type ChangeEvent, useEffect, useState } from 'react'
import './App.css'
import { adapterForFileName, adapterForFormat } from './documents/adapter'
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
import { libraryDocs, type LibraryDoc } from './library'
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
  const [state, setState] = useState<AppState>(() => stateFromLocation())
  const { theme, themePreference, setThemePreference } = useTheme()

  // Resolve external documents (?src=…) into an open document.
  useEffect(() => {
    if (state.view !== 'external') {
      return
    }

    const src = state.src
    const controller = new AbortController()

    loadExternalDocument(src, controller.signal)
      .then((doc) => {
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
  }, [state])

  // Browser back/forward: re-derive state from the location.
  useEffect(() => {
    const onPopState = () => setState(stateFromLocation())
    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  /** Navigate to a state, updating history and scroll in one place. */
  const navigate = (next: AppState) => {
    withViewTransition(() => {
      setState(next)
    })
    window.scrollTo({ top: 0, behavior: 'auto' })
    window.history.pushState(null, '', urlForState(next))

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

  const onImportFile = async (file: File) => {
    const adapter = adapterForFileName(file.name)
    const { source, fingerprint } = await adapter.readFile(file)
    openImported({ source, fileName: file.name, libraryId: '', fingerprint })
  }

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

    openImported({
      source: { format: 'markdown', content },
      fileName: 'clipboard.md',
      libraryId: '',
      fingerprint: content,
    })
  }

  if (state.view === 'home') {
    return (
      <Home
        docs={libraryDocs}
        activeDocId={lastOpenedId()}
        theme={theme}
        themePreference={themePreference}
        onSelectTheme={setThemePreference}
        onOpen={openLibraryDoc}
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

export default App
