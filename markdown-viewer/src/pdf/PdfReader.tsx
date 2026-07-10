import {
  type MouseEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import DocAssistant from '../DocAssistant'
import DocComments from '../DocComments'
import type { CommentAnchor } from '../documentComments'
import { useDocumentComments } from '../documentComments'
import { type Theme, THEMES } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  stepPageZoom,
} from '../readerConfig'
import { resolvePdfSelectionAnchor } from './pdfCommentAnchors'
import {
  buildPdfDocumentIndex,
  loadPdfDocument,
  pageNumberFromSectionId,
  type PdfDocumentIndex,
} from './pdfDocument'
import PdfPage from './PdfPage'
import { searchPdfPages } from './pdfSearch'
import { computeFitZoom, findActiveSectionForPage } from './pdfViewUtils'

type PdfReaderProps = {
  fileName: string
  docKey: string
  pdfSource: ArrayBuffer | string
  theme: Theme
  onSelectTheme: (theme: Theme) => void
  onHome: () => void
}

const SettingsIcon = () => (
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
)

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function highlightMatches(text: string, query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  if (!text || tokens.length === 0) {
    return text
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const exactPattern = new RegExp(`^(${tokens.map(escapeRegExp).join('|')})$`, 'i')
  const parts = text.split(pattern)

  return parts.map((part, index) =>
    exactPattern.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  )
}

export default function PdfReader({
  fileName,
  docKey,
  pdfSource,
  theme,
  onSelectTheme,
  onHome,
}: PdfReaderProps) {
  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const docStageRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pdf, setPdf] = useState<Awaited<ReturnType<typeof loadPdfDocument>> | null>(null)
  const [index, setIndex] = useState<PdfDocumentIndex | null>(null)
  const [pageZoom, setPageZoom] = useState(1.1)
  const [tocOpen, setTocOpen] = useState(false)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSectionId, setActiveSectionId] = useState('')

  const commentSource = useMemo(
    () => ({
      format: 'pdf' as const,
      pageTexts: index?.pages.map((page) => page.text) ?? [],
    }),
    [index],
  )

  const {
    comments,
    activeCommentId,
    setActiveCommentId,
    addComment,
    updateComment,
    deleteComment,
  } = useDocumentComments(docKey, commentSource)

  const trimmedSearchQuery = searchQuery.trim()
  const searchResults = useMemo(
    () => (index ? searchPdfPages(index.pages, searchQuery) : []),
    [index, searchQuery],
  )

  const applyFitZoom = useCallback(
    (mode: 'width' | 'height') => {
      if (!index || !docColRef.current) {
        return
      }

      const containerWidth = docColRef.current.clientWidth
      const containerHeight = docStageRef.current?.clientHeight ?? window.innerHeight
      setPageZoom(
        clampPageZoom(
          computeFitZoom(
            index.basePageWidth,
            index.basePageHeight,
            containerWidth,
            containerHeight,
            mode,
          ),
        ),
      )
    },
    [index],
  )

  const stepZoom = useCallback((direction: 'in' | 'out') => {
    setPageZoom((current) => stepPageZoom(current, direction))
  }, [])

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }

    return attachDocumentZoomWheel(root, (direction) => {
      stepZoom(direction)
    })
  }, [index, stepZoom])

  useEffect(() => {
    let cancelled = false
    setLoading(true)
    setLoadError('')

    const load = async () => {
      try {
        const loadedPdf = await loadPdfDocument(pdfSource)
        const builtIndex = await buildPdfDocumentIndex(loadedPdf)
        if (cancelled) {
          return
        }

        setPdf(loadedPdf)
        setIndex(builtIndex)
        setActiveSectionId(builtIndex.sections[0]?.id ?? 'pdf-page-1')
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not load PDF.')
        }
      } finally {
        if (!cancelled) {
          setLoading(false)
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [pdfSource])

  useEffect(() => {
    setTocOpen(false)
    setSearchOpen(false)
    setCommentsOpen(false)
    setAssistantOpen(false)
    setSettingsOpen(false)
    setSearchQuery('')
  }, [docKey, pdfSource])

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    const onPointerDown = (event: Event) => {
      if (settingsRef.current && !settingsRef.current.contains(event.target as Node)) {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    return () => document.removeEventListener('mousedown', onPointerDown)
  }, [settingsOpen])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (applyZoomKeyboardShortcut(event, stepZoom)) {
        return
      }

      if (event.key === '/' && !searchOpen && !assistantOpen && !commentsOpen) {
        const target = event.target
        if (
          target instanceof HTMLElement &&
          (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
        ) {
          return
        }

        event.preventDefault()
        setSearchOpen(true)
        setTocOpen(false)
        setCommentsOpen(false)
        setAssistantOpen(false)
        setSettingsOpen(false)
        window.requestAnimationFrame(() => searchInputRef.current?.focus())
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [assistantOpen, commentsOpen, searchOpen, stepZoom])

  useEffect(() => {
    const root = docColRef.current
    if (!root || !index) {
      return
    }

    const pages = Array.from(root.querySelectorAll<HTMLElement>('.pdf-page[data-pdf-page]'))
    if (pages.length === 0) {
      return
    }

    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((left, right) => right.intersectionRatio - left.intersectionRatio)

        const topEntry = visible[0]
        if (!topEntry?.target) {
          return
        }

        const pageNumber = Number((topEntry.target as HTMLElement).dataset.pdfPage)
        if (!pageNumber) {
          return
        }

        setActiveSectionId(findActiveSectionForPage(index.sections, pageNumber))
      },
      {
        threshold: [0.2, 0.4, 0.6],
        rootMargin: '-18% 0px -58% 0px',
      },
    )

    for (const page of pages) {
      observer.observe(page)
    }

    return () => observer.disconnect()
  }, [index, pageZoom, pdf?.numPages])

  const navigateToSection = useCallback((sectionId: string) => {
    const pageNumber = pageNumberFromSectionId(sectionId)
    const pageElement = document.getElementById(`pdf-page-${pageNumber}`)
    pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
    setActiveSectionId(sectionId)
  }, [])

  const resolveSelectionAnchor = useCallback(
    (selection: Selection, scope: HTMLElement) => {
      if (!index) {
        return null
      }

      return resolvePdfSelectionAnchor(selection, scope, index.pages)
    },
    [index],
  )

  const scrollToAnchor = useCallback(
    (commentId: string, anchor: CommentAnchor) => {
      if (anchor.kind === 'pdf') {
        const pageElement = document.getElementById(`pdf-page-${anchor.page}`)
        pageElement?.scrollIntoView({ behavior: 'smooth', block: 'start' })
      }

      setActiveCommentId(commentId)
    },
    [setActiveCommentId],
  )

  const handleAddComment = useCallback(
    (anchor: CommentAnchor, body: string) => addComment(anchor, body),
    [addComment],
  )

  const focusSearchInput = () => {
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }

  if (loading) {
    return (
      <div className="reader-root">
        <div className="pdf-loading-shell">
          <p>Loading PDF…</p>
        </div>
      </div>
    )
  }

  if (loadError || !pdf || !index) {
    return (
      <div className="reader-root">
        <div className="pdf-loading-shell">
          <h1>Unable to load PDF</h1>
          <p>{loadError || 'Unknown error.'}</p>
          <button type="button" className="ghost-button" onClick={onHome}>
            Back to library
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="reader-root" ref={readerRootRef}>
      <div className="topbar-shell reader-topbar-shell">
        <header className="app-topbar topbar-pill reader-topbar">
          <div className="topbar-lead">
            <button type="button" className="ghost-button home-link" onClick={onHome}>
              <span>Library</span>
            </button>
            <span className="topbar-divider" aria-hidden="true" />
            <p className="doc-name" title={fileName}>
              {fileName}
            </p>
          </div>
          <div className="controls">
            <button
              type="button"
              className="ghost-button toc-toggle"
              aria-expanded={tocOpen}
              onClick={() => {
                setTocOpen((value) => !value)
                setSearchOpen(false)
                setCommentsOpen(false)
                setAssistantOpen(false)
                setSettingsOpen(false)
              }}
            >
              <span>Contents</span>
            </button>
            <button
              type="button"
              className={searchOpen ? 'ghost-button active' : 'ghost-button'}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((value) => !value)
                setTocOpen(false)
                setCommentsOpen(false)
                setAssistantOpen(false)
                setSettingsOpen(false)
              }}
            >
              <span>Search</span>
            </button>
            <button
              type="button"
              className={commentsOpen ? 'ghost-button active' : 'ghost-button'}
              aria-expanded={commentsOpen}
              onClick={() => {
                setCommentsOpen((value) => !value)
                setSearchOpen(false)
                setAssistantOpen(false)
                setSettingsOpen(false)
                setTocOpen(false)
              }}
            >
              <span>Comments</span>
              {comments.length > 0 ? (
                <span className="comment-count-badge">{comments.length}</span>
              ) : null}
            </button>
            <button
              type="button"
              className="ghost-button assistant-toggle"
              aria-expanded={assistantOpen}
              onClick={() => {
                setAssistantOpen((value) => !value)
                setSearchOpen(false)
                setCommentsOpen(false)
                setSettingsOpen(false)
                setTocOpen(false)
              }}
            >
              <span>Ask</span>
            </button>
            <div className="controls-actions" ref={settingsRef}>
              <button
                type="button"
                className={settingsOpen ? 'icon-button active' : 'icon-button'}
                aria-expanded={settingsOpen}
                onClick={() => setSettingsOpen((value) => !value)}
              >
                <SettingsIcon />
              </button>
              {settingsOpen ? (
                <div className="settings-popover" role="dialog" aria-label="Settings">
                  <div className="settings-group">
                    <p className="settings-label">Zoom</p>
                    <div className="zoom-controls">
                      <button
                        type="button"
                        className="seg"
                        onClick={() => stepZoom('out')}
                      >
                        −
                      </button>
                      <span>{Math.round(pageZoom * 100)}%</span>
                      <button
                        type="button"
                        className="seg"
                        onClick={() => stepZoom('in')}
                      >
                        +
                      </button>
                    </div>
                    <div className="pdf-fit-actions">
                      <button type="button" className="seg" onClick={() => applyFitZoom('width')}>
                        Fit width
                      </button>
                      <button type="button" className="seg" onClick={() => applyFitZoom('height')}>
                        Fit height
                      </button>
                      <button type="button" className="seg" onClick={() => setPageZoom(clampPageZoom(1))}>
                        100%
                      </button>
                    </div>
                  </div>
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
          </div>
        </header>
      </div>

      <DocAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        markdown={index.fullText}
        fileName={fileName}
        sections={index.sections}
        onNavigateToSection={navigateToSection}
      />

      <DocComments
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        docColRef={docColRef}
        markdown=""
        toc={index.sections}
        comments={comments}
        activeCommentId={activeCommentId}
        setActiveCommentId={setActiveCommentId}
        onAddComment={handleAddComment}
        onUpdateComment={updateComment}
        onDeleteComment={deleteComment}
        resolveSelectionAnchor={resolveSelectionAnchor}
        scrollToAnchor={scrollToAnchor}
      />

      {searchOpen ? (
        <aside className="search-panel" aria-label="Document search">
          <div className="search-panel-header">
            <h2>Search</h2>
            <button
              type="button"
              className="icon-button"
              aria-label="Close search"
              onClick={() => setSearchOpen(false)}
            >
              Close
            </button>
          </div>
          <div className="search-panel-body">
            <div className="search-panel-input-row">
              <input
                ref={searchInputRef}
                type="search"
                className="search-panel-input"
                value={searchQuery}
                placeholder="Search pages"
                aria-label="Search this document"
                spellCheck={false}
                onChange={(event) => setSearchQuery(event.target.value)}
              />
              {trimmedSearchQuery ? (
                <button
                  type="button"
                  className="search-panel-clear"
                  onClick={() => {
                    setSearchQuery('')
                    focusSearchInput()
                  }}
                >
                  Clear
                </button>
              ) : null}
            </div>

            {trimmedSearchQuery ? (
              <p className="search-panel-hint">
                {searchResults.length === 0
                  ? 'No matching pages.'
                  : `${searchResults.length} matching page${searchResults.length === 1 ? '' : 's'}.`}
              </p>
            ) : (
              <p className="search-panel-hint">Tip: press / to focus search.</p>
            )}

            <div className="search-results" role="list" aria-label="Search results">
              {trimmedSearchQuery
                ? searchResults.map((result) => (
                    <button
                      type="button"
                      key={`${result.page}-${result.score}`}
                      className="search-result"
                      onClick={() => navigateToSection(result.id)}
                    >
                      <span className="search-result-title">
                        {highlightMatches(result.text, trimmedSearchQuery)}
                      </span>
                      <span className="search-result-reason">{result.reason}</span>
                      {result.snippet ? (
                        <span className="search-result-snippet">
                          {highlightMatches(result.snippet, trimmedSearchQuery)}
                        </span>
                      ) : null}
                    </button>
                  ))
                : null}
            </div>
          </div>
        </aside>
      ) : null}

      <div
        className="reader-canvas"
        data-theme={theme}
        data-comment-mode={commentsOpen ? 'true' : undefined}
      >
        <aside className={tocOpen ? 'toc-panel toc-open' : 'toc-panel'} aria-label="Table of contents">
          <h2>Contents</h2>
          <nav>
            {index.sections.map((entry) => (
              <a
                key={entry.id}
                href={`#${entry.id}`}
                className={[
                  'toc-link',
                  `toc-l${entry.level}`,
                  activeSectionId === entry.id ? 'active' : '',
                ]
                  .filter(Boolean)
                  .join(' ')}
                onClick={(event: MouseEvent<HTMLAnchorElement>) => {
                  event.preventDefault()
                  navigateToSection(entry.id)
                }}
              >
                {entry.text}
              </a>
            ))}
          </nav>
        </aside>

        <div className="doc-stage" ref={docStageRef}>
          <div
            className={commentsOpen ? 'doc-col comment-mode pdf-doc-col' : 'doc-col pdf-doc-col'}
            ref={docColRef}
          >
            <section className="pdf-page-stack">
              {index.pages.map((page) => (
                <PdfPage
                  key={`page-${page.pageNumber}`}
                  pdf={pdf}
                  pageNumber={page.pageNumber}
                  scale={pageZoom}
                  searchQuery={trimmedSearchQuery}
                  comments={comments}
                  activeCommentId={activeCommentId}
                  commentsOpen={commentsOpen}
                />
              ))}
            </section>
          </div>
        </div>
      </div>
    </div>
  )
}
