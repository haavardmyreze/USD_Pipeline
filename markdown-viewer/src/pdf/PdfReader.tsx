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
import { type Theme, type ThemePreference } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  isEditableKeyboardTarget,
  stepPageZoom,
} from '../readerConfig'
import { AskIcon, CommentsIcon, ContentsIcon, SearchIcon } from '../ui/icons'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { SearchPanel } from '../ui/SearchPanel'
import { ThemePicker } from '../ui/ThemePicker'
import { usePanels } from '../ui/usePanels'
import { CommandPalette } from '../ui/CommandPalette'
import { InkAnnotation } from '../ui/InkAnnotation'
import { LaserPointer } from '../ui/LaserPointer'
import { SelectionMenu } from '../ui/SelectionMenu'
import { TocRail } from '../ui/TocRail'
import {
  createDrawPaletteAction,
  createDrawTopbarAction,
  createLaserPaletteAction,
  createLaserTopbarAction,
  usePdfInkBinding,
  useReaderDrawMode,
} from '../ui/useReaderInk'
import {
  actionsPaletteGroup,
  libraryPaletteGroup,
  sectionsPaletteGroup,
  themePaletteGroup,
} from '../ui/paletteGroups'
import {
  currentScrollProgress,
  loadReadingPosition,
  saveReadingPosition,
} from '../readingPosition'
import type { LibraryDoc } from '../library'
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
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

export default function PdfReader({
  fileName,
  docKey,
  pdfSource,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: PdfReaderProps) {
  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const docStageRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const positionReadyRef = useRef(false)
  const [loading, setLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [pdf, setPdf] = useState<Awaited<ReturnType<typeof loadPdfDocument>> | null>(null)
  const [index, setIndex] = useState<PdfDocumentIndex | null>(null)
  const [pageZoom, setPageZoom] = useState(1.1)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSectionId, setActiveSectionId] = useState('')
  const [externalDraft, setExternalDraft] = useState<{
    anchor: CommentAnchor
    tick: number
  } | null>(null)
  const [assistantPrefill, setAssistantPrefill] = useState<{
    text: string
    tick: number
  } | null>(null)

  const panels = usePanels()
  const { closeAll: closeAllPanels, open: openPanel } = panels
  const tocOpen = panels.isOpen('toc')
  const searchOpen = panels.isOpen('search')
  const commentsOpen = panels.isOpen('comments')
  const assistantOpen = panels.isOpen('assistant')
  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode(closeAllPanels)
  const inkBinding = usePdfInkBinding(docColRef, pageZoom)

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

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }

    return attachDocumentZoomWheel(root, (direction) => {
      if (drawModeRef.current) {
        return
      }
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
    closeAllPanels()
    setSearchQuery('')
  }, [docKey, pdfSource, closeAllPanels])

  // Restore the last reading position once the document index is ready.
  useEffect(() => {
    if (!index) {
      return
    }

    positionReadyRef.current = false
    const saved = window.location.hash ? null : loadReadingPosition(docKey)
    if (saved?.anchorId) {
      const pageNumber = pageNumberFromSectionId(saved.anchorId)
      window.requestAnimationFrame(() => {
        window.requestAnimationFrame(() => {
          document
            .getElementById(`pdf-page-${pageNumber}`)
            ?.scrollIntoView({ behavior: 'auto', block: 'start' })
          setActiveSectionId(saved.anchorId)
        })
      })
    }

    const timer = window.setTimeout(() => {
      positionReadyRef.current = true
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [index, docKey])

  // Remember the current page/section per document.
  useEffect(() => {
    if (!positionReadyRef.current || !activeSectionId) {
      return
    }
    saveReadingPosition(docKey, {
      anchorId: activeSectionId,
      progress: currentScrollProgress(),
      updatedAt: Date.now(),
    })
  }, [activeSectionId, docKey])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawModeRef.current && applyZoomKeyboardShortcut(event, stepZoom)) {
        return
      }

      if (event.key === '/' && !isEditableKeyboardTarget(event.target)) {
        event.preventDefault()
        openPanel('search')
        focusSearchInput()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [focusSearchInput, openPanel, stepZoom])

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
        if (drawModeRef.current) {
          return
        }

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

  // Selection menu: resolve the anchor before comment mode re-renders the
  // page layer and clears the selection.
  const commentOnSelection = useCallback(() => {
    const scope = docColRef.current
    const selection = window.getSelection()
    if (
      !scope ||
      !selection ||
      selection.isCollapsed ||
      selection.rangeCount === 0 ||
      !index
    ) {
      return
    }

    const anchor = resolvePdfSelectionAnchor(selection, scope, index.pages)
    if (!anchor) {
      return
    }

    setExternalDraft({ anchor, tick: Date.now() })
    openPanel('comments')
  }, [index, openPanel])

  const askAboutSelection = useCallback(
    (text: string) => {
      const quoted = text.length > 600 ? `${text.slice(0, 600)}…` : text
      setAssistantPrefill({
        text: `Regarding this passage:\n\n"${quoted}"\n\n`,
        tick: Date.now(),
      })
      openPanel('assistant')
    },
    [openPanel],
  )

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

  const topbarActions: TopbarAction[] = [
    {
      id: 'toc',
      label: 'Contents',
      icon: <ContentsIcon />,
      active: tocOpen,
      onToggle: () => panels.toggle('toc'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: <SearchIcon />,
      active: searchOpen || Boolean(trimmedSearchQuery),
      onToggle: () => {
        panels.toggle('search')
        if (!searchOpen) {
          focusSearchInput()
        }
      },
    },
    {
      id: 'comments',
      label: 'Comments',
      icon: <CommentsIcon />,
      active: commentsOpen,
      badge: comments.length || undefined,
      onToggle: () => panels.toggle('comments'),
    },
    {
      id: 'assistant',
      label: 'Ask',
      icon: <AskIcon />,
      active: assistantOpen,
      onToggle: () => panels.toggle('assistant'),
    },
    createDrawTopbarAction(drawMode, toggleDrawMode),
    createLaserTopbarAction(laserMode, toggleLaserMode),
  ]

  const settingsContent = (
    <>
      <div className="settings-group">
        <p className="settings-label">Zoom</p>
        <div className="zoom-controls">
          <button type="button" className="seg" onClick={() => stepZoom('out')}>
            −
          </button>
          <span>{Math.round(pageZoom * 100)}%</span>
          <button type="button" className="seg" onClick={() => stepZoom('in')}>
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
      <ThemePicker preference={themePreference} onSelect={onSelectTheme} />
    </>
  )

  const paletteGroups = [
    sectionsPaletteGroup(index.sections, navigateToSection),
    actionsPaletteGroup([
      {
        id: 'search',
        title: 'Search pages',
        keywords: 'find text',
        action: () => {
          openPanel('search')
          focusSearchInput()
        },
      },
      {
        id: 'comments',
        title: 'Toggle comments',
        keywords: 'notes annotate',
        action: () => panels.toggle('comments'),
      },
      {
        id: 'ask',
        title: 'Ask about this document',
        keywords: 'ai assistant chat',
        action: () => panels.toggle('assistant'),
      },
      createDrawPaletteAction(toggleDrawMode),
      createLaserPaletteAction(toggleLaserMode),
      {
        id: 'fit-width',
        title: 'Zoom: Fit width',
        keywords: 'zoom scale',
        action: () => applyFitZoom('width'),
      },
      {
        id: 'fit-height',
        title: 'Zoom: Fit height',
        keywords: 'zoom scale',
        action: () => applyFitZoom('height'),
      },
      {
        id: 'library',
        title: 'Back to library',
        keywords: 'home close',
        action: onHome,
      },
    ]),
    libraryPaletteGroup(onOpenLibrary, fileName),
    themePaletteGroup(themePreference, onSelectTheme),
  ]

  return (
    <div
      className="reader-root"
      ref={readerRootRef}
      data-draw-mode={drawMode ? 'true' : undefined}
      data-laser-mode={laserMode ? 'true' : undefined}
    >
      <CommandPalette groups={paletteGroups} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />
      <SelectionMenu
        scopeRef={docColRef}
        disabled={commentsOpen || drawMode}
        actions={[
          { id: 'comment', label: 'Comment', onRun: () => commentOnSelection() },
          { id: 'ask', label: 'Ask', onRun: askAboutSelection },
          {
            id: 'copy',
            label: 'Copy',
            onRun: (text) => {
              void navigator.clipboard?.writeText(text)
            },
          },
        ]}
      />
      <TocRail
        sections={index.sections}
        activeId={activeSectionId}
        hidden={tocOpen || commentsOpen || drawMode}
        onNavigate={navigateToSection}
      />
      <ReaderTopbar
        fileName={fileName}
        onHome={onHome}
        actions={topbarActions}
        settings={settingsContent}
      />

      <DocAssistant
        open={assistantOpen}
        onClose={() => panels.close('assistant')}
        markdown={index.fullText}
        fileName={fileName}
        sections={index.sections}
        onNavigateToSection={navigateToSection}
        prefill={assistantPrefill}
      />

      <DocComments
        open={commentsOpen}
        onClose={() => panels.close('comments')}
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
        externalDraft={externalDraft}
      />

      <SearchPanel
        open={searchOpen}
        onClose={() => panels.close('search')}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        inputRef={searchInputRef}
        placeholder="Search pages"
        resultNoun="page"
        results={searchResults}
        onSelect={(result) => navigateToSection(result.id)}
      />

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
