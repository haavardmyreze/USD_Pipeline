import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import Home from './Home'
import Reader from './Reader'
import { makeDocumentKey } from './documentKey'
import {
  getDocIdFromUrl,
  getLibraryContent,
  getLibraryDoc,
  libraryDocs,
  type LibraryDoc,
} from './library'
import { resolveTheme, type Theme } from './theme'

type ViewMode = 'home' | 'reader'

function lastOpenedId() {
  try {
    return localStorage.getItem('mdv-library-doc') ?? ''
  } catch {
    return ''
  }
}

function getSrcFromUrl() {
  return new URLSearchParams(window.location.search).get('src')
}

function parseFileNameFromSrc(src: string) {
  try {
    const url = new URL(src)
    const base = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    return base || 'document.md'
  } catch {
    return 'document.md'
  }
}

// The home hub is the default surface. A valid `?doc=` deep link opens the
// reader directly so shared/bookmarked links land on the document.
function resolveInitialState() {
  const src = getSrcFromUrl()
  if (src) {
    return {
      view: 'reader' as ViewMode,
      content: '',
      fileName: parseFileNameFromSrc(src),
      libraryId: '',
      externalSrc: src,
    }
  }

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
        externalSrc: '',
      }
    }
  }

  return {
    view: 'home' as ViewMode,
    content: '',
    fileName: '',
    libraryId: lastOpenedId(),
    externalSrc: '',
  }
}

function App() {
  const initial = useMemo(() => resolveInitialState(), [])
  const [view, setView] = useState<ViewMode>(initial.view)
  const [markdown, setMarkdown] = useState(initial.content)
  const [fileName, setFileName] = useState(initial.fileName)
  const [activeLibraryId, setActiveLibraryId] = useState(initial.libraryId)
  const [externalSrc, setExternalSrc] = useState(initial.externalSrc)
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return resolveTheme(localStorage.getItem('mdv-theme'))
    } catch {
      return resolveTheme(null)
    }
  })

  const docKey = useMemo(
    () => makeDocumentKey(activeLibraryId, fileName, markdown),
    [activeLibraryId, fileName, markdown],
  )

  useEffect(() => {
    if (!externalSrc) {
      return
    }

    const controller = new AbortController()
    let cancelled = false
    setMarkdown('')
    setView('reader')
    setActiveLibraryId('')

    const loadExternalMarkdown = async () => {
      try {
        const response = await fetch(externalSrc, {
          signal: controller.signal,
          headers: {
            Accept: 'text/markdown,text/plain;q=0.9,*/*;q=0.8',
          },
        })
        if (!response.ok) {
          throw new Error(`Could not load markdown (${response.status})`)
        }
        const content = await response.text()
        if (!cancelled) {
          setMarkdown(content)
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }
        setMarkdown(`# Unable to load document\n\nSource: \`${externalSrc}\`\n\n${error instanceof Error ? error.message : 'Unknown error.'}`)
      }
    }

    void loadExternalMarkdown()
    return () => {
      cancelled = true
      controller.abort()
    }
  }, [externalSrc])

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
      const src = getSrcFromUrl()
      if (src) {
        setExternalSrc(src)
        setFileName(parseFileNameFromSrc(src))
        setActiveLibraryId('')
        setView('reader')
        return
      }

      const docId = getDocIdFromUrl()
      if (docId) {
        const doc = getLibraryDoc(docId)
        const content = getLibraryContent(docId)
        if (doc && content) {
          setMarkdown(content)
          setFileName(doc.fileName)
          setActiveLibraryId(doc.id)
          setExternalSrc('')
          setView('reader')
          return
        }
      }
      setExternalSrc('')
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
    setExternalSrc('')
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.set('doc', doc.id)
    url.searchParams.delete('src')
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
    setExternalSrc('')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const openImportedContent = (content: string, importedFileName: string) => {
    setMarkdown(content)
    setFileName(importedFileName)
    setActiveLibraryId('')
    setExternalSrc('')
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const content = await file.text()
    openImportedContent(content, file.name)
    event.target.value = ''
  }

  const onImportFromClipboard = (content: string) => {
    if (!content.trim()) {
      throw new Error('Clipboard is empty.')
    }

    openImportedContent(content, 'clipboard.md')
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
        onImportFromClipboard={onImportFromClipboard}
      />
    )
  }

  return (
    <Reader
      markdown={markdown}
      fileName={fileName}
      docKey={docKey}
      theme={theme}
      onSelectTheme={setTheme}
      onHome={goHome}
    />
  )
}

export default App
