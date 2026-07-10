import { type ChangeEvent, useEffect, useMemo, useState } from 'react'
import './App.css'
import { detectFormatFromFileName, detectFormatFromSrc } from './documents/detectFormat'
import type { DocumentFormat } from './documents/types'
import Home from './Home'
import PdfReader from './pdf/PdfReader'
import CsvReader from './csv/CsvReader'
import Reader from './Reader'
import { hashArrayBuffer, makeDocumentKey } from './documentKey'
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

function resolveInitialState() {
  const src = getSrcFromUrl()
  if (src) {
    return {
      view: 'reader' as ViewMode,
      format: detectFormatFromSrc(src),
      content: '',
      fileName: parseFileNameFromSrc(src),
      libraryId: '',
      externalSrc: src,
      pdfSource: null as ArrayBuffer | string | null,
      csvContent: '',
      fingerprint: '',
    }
  }

  const fromUrl = getDocIdFromUrl()
  if (fromUrl) {
    const doc = getLibraryDoc(fromUrl)
    const content = getLibraryContent(fromUrl)
    if (doc && content) {
      return {
        view: 'reader' as ViewMode,
        format: 'markdown' as DocumentFormat,
        content,
        fileName: doc.fileName,
        libraryId: doc.id,
        externalSrc: '',
        pdfSource: null as ArrayBuffer | string | null,
        csvContent: '',
        fingerprint: content,
      }
    }
  }

  return {
    view: 'home' as ViewMode,
    format: 'markdown' as DocumentFormat,
    content: '',
    fileName: '',
    libraryId: lastOpenedId(),
    externalSrc: '',
    pdfSource: null as ArrayBuffer | string | null,
    csvContent: '',
    fingerprint: '',
  }
}

function App() {
  const initial = useMemo(() => resolveInitialState(), [])
  const [view, setView] = useState<ViewMode>(initial.view)
  const [documentFormat, setDocumentFormat] = useState<DocumentFormat>(initial.format)
  const [markdown, setMarkdown] = useState(initial.content)
  const [fileName, setFileName] = useState(initial.fileName)
  const [activeLibraryId, setActiveLibraryId] = useState(initial.libraryId)
  const [externalSrc, setExternalSrc] = useState(initial.externalSrc)
  const [pdfSource, setPdfSource] = useState<ArrayBuffer | string | null>(initial.pdfSource)
  const [csvContent, setCsvContent] = useState(initial.csvContent ?? '')
  const [contentFingerprint, setContentFingerprint] = useState(initial.fingerprint)
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      return resolveTheme(localStorage.getItem('mdv-theme'))
    } catch {
      return resolveTheme(null)
    }
  })

  const docKey = useMemo(
    () => makeDocumentKey(activeLibraryId, fileName, contentFingerprint),
    [activeLibraryId, fileName, contentFingerprint],
  )

  useEffect(() => {
    if (!externalSrc) {
      return
    }

    const controller = new AbortController()
    let cancelled = false
    const format = detectFormatFromSrc(externalSrc)
    setDocumentFormat(format)
    setMarkdown('')
    setPdfSource(null)
    setCsvContent('')
    setContentFingerprint('')
    setView('reader')
    setActiveLibraryId('')

    const loadExternalDocument = async () => {
      try {
        if (format === 'pdf') {
          const response = await fetch(externalSrc, {
            signal: controller.signal,
          })
          if (!response.ok) {
            throw new Error(`Could not load PDF (${response.status})`)
          }

          const data = await response.arrayBuffer()
          if (!cancelled) {
            setPdfSource(data)
            setContentFingerprint(hashArrayBuffer(data))
          }
          return
        }

        const response = await fetch(externalSrc, {
          signal: controller.signal,
          headers: {
            Accept: 'text/csv,text/plain,text/markdown;q=0.9,*/*;q=0.8',
          },
        })
        if (!response.ok) {
          throw new Error(`Could not load document (${response.status})`)
        }
        const content = await response.text()
        if (!cancelled) {
          if (format === 'csv') {
            setCsvContent(content)
          } else {
            setMarkdown(content)
          }
          setContentFingerprint(content)
        }
      } catch (error) {
        if (cancelled || (error instanceof DOMException && error.name === 'AbortError')) {
          return
        }

        if (format === 'pdf') {
          setPdfSource(null)
          setContentFingerprint('')
        } else if (format === 'csv') {
          setCsvContent('')
          setContentFingerprint('')
        } else {
          setMarkdown(
            `# Unable to load document\n\nSource: \`${externalSrc}\`\n\n${error instanceof Error ? error.message : 'Unknown error.'}`,
          )
          setContentFingerprint(externalSrc)
        }
      }
    }

    void loadExternalDocument()
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

  useEffect(() => {
    const onPopState = () => {
      const src = getSrcFromUrl()
      if (src) {
        setExternalSrc(src)
        setFileName(parseFileNameFromSrc(src))
        setActiveLibraryId('')
        setDocumentFormat(detectFormatFromSrc(src))
        setPdfSource(null)
        setMarkdown('')
        setCsvContent('')
        setContentFingerprint('')
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
          setDocumentFormat('markdown')
          setPdfSource(null)
          setCsvContent('')
          setContentFingerprint(content)
          setView('reader')
          return
        }
      }

      setExternalSrc('')
      setDocumentFormat('markdown')
      setPdfSource(null)
      setCsvContent('')
      setContentFingerprint('')
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
    setDocumentFormat('markdown')
    setPdfSource(null)
    setCsvContent('')
    setContentFingerprint(content)
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
    setDocumentFormat('markdown')
    setPdfSource(null)
    setCsvContent('')
    setContentFingerprint('')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const openImportedMarkdown = (content: string, importedFileName: string) => {
    setMarkdown(content)
    setFileName(importedFileName)
    setActiveLibraryId('')
    setExternalSrc('')
    setDocumentFormat('markdown')
    setPdfSource(null)
    setCsvContent('')
    setContentFingerprint(content)
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const openImportedPdf = (data: ArrayBuffer, importedFileName: string) => {
    setMarkdown('')
    setCsvContent('')
    setFileName(importedFileName)
    setActiveLibraryId('')
    setExternalSrc('')
    setDocumentFormat('pdf')
    setPdfSource(data)
    setContentFingerprint(hashArrayBuffer(data))
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const openImportedCsv = (content: string, importedFileName: string) => {
    setMarkdown('')
    setFileName(importedFileName)
    setActiveLibraryId('')
    setExternalSrc('')
    setDocumentFormat('csv')
    setPdfSource(null)
    setCsvContent(content)
    setContentFingerprint(content)
    setView('reader')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.searchParams.delete('src')
    url.hash = ''
    window.history.pushState(null, '', url)
  }

  const onImportFile = async (file: File) => {
    const format = detectFormatFromFileName(file.name)
    if (format === 'pdf') {
      openImportedPdf(await file.arrayBuffer(), file.name)
      return
    }

    if (format === 'csv') {
      openImportedCsv(await file.text(), file.name)
      return
    }

    openImportedMarkdown(await file.text(), file.name)
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

    openImportedMarkdown(content, 'clipboard.md')
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
        onImportFile={onImportFile}
        onImportFromClipboard={onImportFromClipboard}
      />
    )
  }

  if (documentFormat === 'pdf' && pdfSource) {
    return (
      <PdfReader
        fileName={fileName}
        docKey={docKey}
        pdfSource={pdfSource}
        theme={theme}
        onSelectTheme={setTheme}
        onHome={goHome}
      />
    )
  }

  if (documentFormat === 'csv' && csvContent) {
    return (
      <CsvReader
        fileName={fileName}
        docKey={docKey}
        csvContent={csvContent}
        theme={theme}
        onSelectTheme={setTheme}
        onHome={goHome}
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
