import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import Home from './Home'
import Reader from './Reader'
import {
  getDocIdFromUrl,
  getLibraryContent,
  getLibraryDoc,
  libraryDocs,
  type LibraryDoc,
} from './library'
import { DEFAULT_THEME, isTheme, type Theme } from './theme'

type ViewMode = 'home' | 'reader'

function lastOpenedId() {
  try {
    return localStorage.getItem('mdv-library-doc') ?? ''
  } catch {
    return ''
  }
}

// The home hub is the default surface. A valid `?doc=` deep link opens the
// reader directly so shared/bookmarked links land on the document.
function resolveInitialState() {
  const fromUrl = getDocIdFromUrl()
  if (fromUrl) {
    const doc = getLibraryDoc(fromUrl)
    const content = getLibraryContent(fromUrl)
    if (doc && content) {
      return {
        view: 'reader' as ViewMode,
        content,
        fileName: doc.fileName,
        libraryId: doc.id,
      }
    }
  }

  return {
    view: 'home' as ViewMode,
    content: '',
    fileName: '',
    libraryId: lastOpenedId(),
  }
}

function App() {
  const initial = useMemo(() => resolveInitialState(), [])
  const [view, setView] = useState<ViewMode>(initial.view)
  const [markdown, setMarkdown] = useState(initial.content)
  const [fileName, setFileName] = useState(initial.fileName)
  const [activeLibraryId, setActiveLibraryId] = useState(initial.libraryId)
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('mdv-theme')
      return isTheme(stored) ? stored : DEFAULT_THEME
    } catch {
      return DEFAULT_THEME
    }
  })

  useEffect(() => {
    try {
      localStorage.setItem('mdv-theme', theme)
    } catch {
      // ignore persistence errors (e.g. private mode)
    }
  }, [theme])

  // Keep the view in sync with browser back/forward navigation.
  useEffect(() => {
    const onPopState = () => {
      const docId = getDocIdFromUrl()
      if (docId) {
        const doc = getLibraryDoc(docId)
        const content = getLibraryContent(docId)
        if (doc && content) {
          setMarkdown(content)
          setFileName(doc.fileName)
          setActiveLibraryId(doc.id)
          setView('reader')
          return
        }
      }
      setView('home')
    }

    window.addEventListener('popstate', onPopState)
    return () => window.removeEventListener('popstate', onPopState)
  }, [])

  const openDoc = (doc: LibraryDoc) => {
    const content = getLibraryContent(doc.id)
    if (!content) {
      return
    }

    setMarkdown(content)
    setFileName(doc.fileName)
    setActiveLibraryId(doc.id)
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.set('doc', doc.id)
    url.hash = ''
    window.history.pushState(null, '', url)

    try {
      localStorage.setItem('mdv-library-doc', doc.id)
    } catch {
      // ignore persistence errors (e.g. private mode)
    }
  }

  const goHome = () => {
    setView('home')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const content = await file.text()
    setMarkdown(content)
    setFileName(file.name)
    setActiveLibraryId('')
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.hash = ''
    window.history.pushState(null, '', url)

    event.target.value = ''
  }

  if (view === 'home') {
    return (
      <Home
        docs={libraryDocs}
        activeDocId={activeLibraryId}
        theme={theme}
        onSelectTheme={setTheme}
        onOpen={openDoc}
        onImport={onFileUpload}
      />
    )
  }

  return (
    <Reader
      markdown={markdown}
      fileName={fileName}
      theme={theme}
      onSelectTheme={setTheme}
      onHome={goHome}
    />
  )
}

export default App
