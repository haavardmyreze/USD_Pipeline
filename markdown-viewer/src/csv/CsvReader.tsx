import {
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
  useCallback,
  useEffect,
  useLayoutEffect,
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
  isZoomWheelEvent,
} from '../readerConfig'
import { AskIcon, CommentsIcon, SearchIcon } from '../ui/icons'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { SearchPanel } from '../ui/SearchPanel'
import { ThemePicker } from '../ui/ThemePicker'
import { usePanels } from '../ui/usePanels'
import { useReaderPageTheme } from '../ui/useReaderPageTheme'
import { CommandPalette } from '../ui/CommandPalette'
import { InkAnnotation } from '../ui/InkAnnotation'
import { LaserPointer } from '../ui/LaserPointer'
import {
  createDrawPaletteAction,
  createDrawTopbarAction,
  createLaserPaletteAction,
  createLaserTopbarAction,
  useCsvInkBinding,
  usePanZoomInkNavigation,
  useReaderDrawMode,
} from '../ui/useReaderInk'
import {
  actionsPaletteGroup,
  libraryPaletteGroup,
  sectionsPaletteGroup,
  themePaletteGroup,
} from '../ui/paletteGroups'
import type { LibraryDoc } from '../library'
import { resolveCsvSelectionAnchor } from './csvCommentAnchors'
import { buildCsvDocumentIndex, rowSectionFromId } from './csvDocument'
import { getCsvCellHighlight } from './csvHighlights'
import { cellMatchesQuery, searchCsv } from './csvSearch'
import {
  loadCsvWrapTextPreference,
  saveCsvWrapTextPreference,
  shouldWrapCsvCell,
} from './csvViewConfig'
import {
  centerPanOnElement,
  clampPan,
  fitSheetInViewport,
  stepZoomAtViewportCenter,
  type CsvViewportState,
  wheelZoomDelta,
  zoomAtPoint,
} from './csvViewport'

type CsvReaderProps = {
  fileName: string
  docKey: string
  csvContent: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

function canStartPan(event: ReactPointerEvent<HTMLDivElement>) {
  return event.button === 1
}

export default function CsvReader({
  fileName,
  docKey,
  csvContent,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: CsvReaderProps) {
  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const panSessionRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [wrapText, setWrapText] = useState(() => loadCsvWrapTextPreference())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCellId, setActiveCellId] = useState('')
  const [assistantPrefill, setAssistantPrefill] = useState<{
    text: string
    tick: number
  } | null>(null)
  const [isPanning, setIsPanning] = useState(false)
  const [viewport, setViewport] = useState<CsvViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  })

  const panels = usePanels()
  const { closeAll: closeAllPanels, open: openPanel } = panels
  const searchOpen = panels.isOpen('search')
  const commentsOpen = panels.isOpen('comments')
  const assistantOpen = panels.isOpen('assistant')
  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode(closeAllPanels)

  useReaderPageTheme(theme)

  const index = useMemo(() => buildCsvDocumentIndex(csvContent), [csvContent])

  const commentSource = useMemo(
    () => ({
      format: 'csv' as const,
      rows: index.rows,
    }),
    [index.rows],
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
    () => searchCsv(index, searchQuery),
    [index, searchQuery],
  )

  const fitSheet = useCallback(() => {
    const sheet = sheetRef.current
    const viewportElement = viewportRef.current
    if (!sheet || !viewportElement) {
      return
    }

    setViewport(
      fitSheetInViewport(
        sheet.offsetWidth,
        sheet.offsetHeight,
        viewportElement.clientWidth,
        viewportElement.clientHeight,
      ),
    )
  }, [])

  const resetZoomTo100 = useCallback(() => {
    const sheet = sheetRef.current
    const viewportElement = viewportRef.current
    if (!sheet || !viewportElement) {
      setViewport((current) => ({ ...current, zoom: 1 }))
      return
    }

    setViewport({
      zoom: 1,
      panX: (viewportElement.clientWidth - sheet.offsetWidth) / 2,
      panY: (viewportElement.clientHeight - sheet.offsetHeight) / 2,
    })
  }, [])

  const stepZoom = useCallback((direction: 'in' | 'out') => {
    const viewportElement = viewportRef.current
    if (!viewportElement) {
      return
    }

    setViewport((current) =>
      stepZoomAtViewportCenter(current, direction, viewportElement.getBoundingClientRect()),
    )
  }, [])

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => searchInputRef.current?.focus())
  }, [])

  const askQuery = useCallback(
    (text: string) => {
      setAssistantPrefill({ text, tick: Date.now() })
      openPanel('assistant')
    },
    [openPanel],
  )

  const clampViewportPan = useCallback((next: CsvViewportState): CsvViewportState => {
    const sheet = sheetRef.current
    const viewportElement = viewportRef.current
    if (!sheet || !viewportElement) {
      return next
    }

    return {
      ...next,
      ...clampPan(
        next.panX,
        next.panY,
        next.zoom,
        sheet.offsetWidth,
        sheet.offsetHeight,
        viewportElement.clientWidth,
        viewportElement.clientHeight,
      ),
    }
  }, [])

  const inkNavigation = usePanZoomInkNavigation(viewportRef, setViewport, clampViewportPan)
  const inkBinding = useCsvInkBinding(
    viewportRef,
    viewport.panX,
    viewport.panY,
    viewport.zoom,
    inkNavigation,
  )

  const focusElementInViewport = useCallback((element: HTMLElement | null) => {
    const sheet = sheetRef.current
    const viewportElement = viewportRef.current
    if (!element || !sheet || !viewportElement) {
      return
    }

    setViewport((current) => ({
      ...current,
      ...centerPanOnElement(element, sheet, viewportElement, current.zoom),
    }))
  }, [])

  const scrollToCell = useCallback(
    (row: number, col: number) => {
      const cell = document.getElementById(`csv-cell-${row}-${col}`)
      focusElementInViewport(cell)
      setActiveCellId(`csv-cell-${row}-${col}`)
    },
    [focusElementInViewport],
  )

  const navigateToSection = useCallback(
    (sectionId: string) => {
      const section = rowSectionFromId(sectionId)
      if (section) {
        const rowElement = document.getElementById(`csv-row-${section.startRow}`)
        focusElementInViewport(rowElement)
      }

    },
    [focusElementInViewport],
  )

  const resolveSelectionAnchor = useCallback(
    (selection: Selection, scope: HTMLElement) =>
      resolveCsvSelectionAnchor(selection, scope, index),
    [index],
  )

  const scrollToAnchor = useCallback(
    (commentId: string, anchor: CommentAnchor) => {
      if (anchor.kind === 'csv') {
        scrollToCell(anchor.row, anchor.col)
      }

      setActiveCommentId(commentId)
    },
    [scrollToCell, setActiveCommentId],
  )

  const handleAddComment = useCallback(
    (anchor: CommentAnchor, body: string) => addComment(anchor, body),
    [addComment],
  )

  const handleViewportWheel = useCallback((event: WheelEvent) => {
    if (isZoomWheelEvent(event)) {
      return
    }

    event.preventDefault()
    setViewport((current) =>
      clampViewportPan({
        ...current,
        panX: current.panX - event.deltaX,
        panY: current.panY - event.deltaY,
      }),
    )
  }, [clampViewportPan])

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }

    return attachDocumentZoomWheel(
      root,
      (_direction, event) => {
        const viewportElement = viewportRef.current
        if (!viewportElement) {
          return
        }

        const delta = wheelZoomDelta(event.deltaY)
        setViewport((current) => {
          const nextZoom = clampPageZoom(current.zoom + delta)
          return zoomAtPoint(
            current.panX,
            current.panY,
            current.zoom,
            nextZoom,
            event.clientX,
            event.clientY,
            viewportElement.getBoundingClientRect(),
          )
        })
      },
      { shouldHandle: () => !drawModeRef.current },
    )
  }, [])

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) {
      return
    }

    viewportElement.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => viewportElement.removeEventListener('wheel', handleViewportWheel)
  }, [handleViewportWheel, index.headers.length])

  const handleViewportPointerDown = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
      if (drawModeRef.current || !canStartPan(event)) {
        return
      }

      event.preventDefault()
      viewportRef.current?.setPointerCapture(event.pointerId)
      setViewport((current) => {
        panSessionRef.current = {
          x: event.clientX,
          y: event.clientY,
          panX: current.panX,
          panY: current.panY,
        }
        return current
      })
      setIsPanning(true)
    },
    [],
  )

  const handleViewportPointerMove = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    const session = panSessionRef.current
    if (!session) {
      return
    }

    setViewport((current) =>
      clampViewportPan({
        ...current,
        panX: session.panX + (event.clientX - session.x),
        panY: session.panY + (event.clientY - session.y),
      }),
    )
  }, [clampViewportPan])

  const endPan = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
    if (!panSessionRef.current) {
      return
    }

    if (viewportRef.current?.hasPointerCapture(event.pointerId)) {
      viewportRef.current.releasePointerCapture(event.pointerId)
    }

    panSessionRef.current = null
    setIsPanning(false)
  }, [])

  useEffect(() => {
    closeAllPanels()
    setSearchQuery('')
    setActiveCellId('')
    setIsPanning(false)
    panSessionRef.current = null
  }, [csvContent, docKey, closeAllPanels])

  useLayoutEffect(() => {
    if (!index.headers.length) {
      return
    }

    const frame = window.requestAnimationFrame(() => {
      fitSheet()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [csvContent, fitSheet, index.headers.length, wrapText])

  useEffect(() => {
    saveCsvWrapTextPreference(wrapText)
  }, [wrapText])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (applyZoomKeyboardShortcut(event, stepZoom)) {
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

  const hasData = index.headers.length > 0
  const sheetStyle = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  } as CSSProperties
  const viewportClassName = ['csv-viewport', isPanning ? 'csv-viewport-panning' : '']
    .filter(Boolean)
    .join(' ')

  const topbarActions: TopbarAction[] = [
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
        <div className="settings-label-row">
          <p className="settings-label">Zoom</p>
          <span className="scale-value" aria-live="polite">
            {Math.round(viewport.zoom * 100)}%
          </span>
        </div>
        <div className="scale-control">
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom out"
            onClick={() => stepZoom('out')}
          >
            −
          </button>
          <div className="segmented settings-inline-seg">
            <button type="button" className="seg" onClick={fitSheet}>
              Fit
            </button>
            <button type="button" className="seg" onClick={resetZoomTo100}>
              100%
            </button>
          </div>
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom in"
            onClick={() => stepZoom('in')}
          >
            +
          </button>
        </div>
      </div>
      <div className="settings-group">
        <p className="settings-label">Text</p>
        <div className="segmented">
          <button
            type="button"
            className={wrapText ? 'seg' : 'seg active'}
            onClick={() => setWrapText(false)}
          >
            Single line
          </button>
          <button
            type="button"
            className={wrapText ? 'seg active' : 'seg'}
            onClick={() => setWrapText(true)}
          >
            Wrap long
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
        title: 'Search cells',
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
        title: 'Ask about this spreadsheet',
        keywords: 'ai assistant chat',
        action: () => panels.toggle('assistant'),
      },
      createDrawPaletteAction(toggleDrawMode),
      createLaserPaletteAction(toggleLaserMode),
      {
        id: 'fit',
        title: 'Zoom: Fit sheet',
        keywords: 'zoom scale',
        action: fitSheet,
      },
      {
        id: 'zoom-100',
        title: 'Zoom: 100%',
        keywords: 'zoom scale reset',
        action: resetZoomTo100,
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
      className="reader-root reader-root-pan"
      ref={readerRootRef}
      data-theme={theme}
      data-draw-mode={drawMode ? 'true' : undefined}
      data-laser-mode={laserMode ? 'true' : undefined}
    >
      <CommandPalette groups={paletteGroups} onAskQuery={askQuery} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />

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
      />

      <SearchPanel
        open={searchOpen}
        onClose={() => panels.close('search')}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        inputRef={searchInputRef}
        placeholder="Search cells"
        resultNoun="cell"
        results={searchResults.map((result) => ({
          id: result.id,
          text: `Row ${result.row + 1} · ${result.columnName}`,
          snippet: result.snippet,
        }))}
        activeResultId={activeCellId}
        onSelect={(item) => {
          const result = searchResults.find((candidate) => candidate.id === item.id)
          if (result) {
            scrollToCell(result.row, result.col)
          }
        }}
      />

      <div
        className="reader-canvas reader-canvas-csv"
        data-theme={theme}
        data-comment-mode={commentsOpen && !drawMode ? 'true' : undefined}
      >
        <div className="doc-stage csv-stage">
          <div
            className={
              commentsOpen && !drawMode
                ? 'doc-col comment-mode csv-doc-col'
                : 'doc-col csv-doc-col'
            }
            ref={docColRef}
          >
            <div
              ref={viewportRef}
              className={viewportClassName}
              onPointerDown={handleViewportPointerDown}
              onPointerMove={handleViewportPointerMove}
              onPointerUp={endPan}
              onPointerCancel={endPan}
              onContextMenu={(event) => {
                if (event.button === 1) {
                  event.preventDefault()
                }
              }}
            >
              <div className="csv-sheet-layer" ref={sheetRef} style={sheetStyle}>
                {!hasData ? (
                  <article className="paper-scroll csv-paper">
                    <h1>Empty spreadsheet</h1>
                    <p>This CSV file has no rows to display.</p>
                    {index.errors.length > 0 ? (
                      <ul>
                        {index.errors.map((error, errorIndex) => (
                          <li key={`${error.row}-${errorIndex}`}>
                            Row {error.row + 1}: {error.message}
                          </li>
                        ))}
                      </ul>
                    ) : null}
                  </article>
                ) : (
                  <article className="paper-scroll csv-paper">
                    <p className="csv-meta-bar">
                      <span>
                        {index.rowCount} row{index.rowCount === 1 ? '' : 's'}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>
                        {index.colCount} column{index.colCount === 1 ? '' : 's'}
                      </span>
                    </p>
                    <table className={wrapText ? 'csv-table csv-table-wrap' : 'csv-table'}>
                      <thead>
                        <tr>
                          <th className="csv-row-number-header" scope="col">
                            #
                          </th>
                          {index.headers.map((header, col) => (
                            <th
                              key={`header-${col}`}
                              scope="col"
                              className={
                                shouldWrapCsvCell(header, wrapText) ? 'csv-cell-wrap' : undefined
                              }
                            >
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {index.rows.map((row, rowIndex) => (
                          <tr key={`row-${rowIndex}`} id={`csv-row-${rowIndex}`}>
                            <th className="csv-row-number" scope="row">
                              {rowIndex + 1}
                            </th>
                            {row.map((value, colIndex) => {
                              const cellId = `csv-cell-${rowIndex}-${colIndex}`
                              const isHit =
                                trimmedSearchQuery.length > 0 &&
                                cellMatchesQuery(value, trimmedSearchQuery)
                              const isActive = activeCellId === cellId
                              const { className: commentClass, commentId } = getCsvCellHighlight(
                                rowIndex,
                                colIndex,
                                comments,
                                activeCommentId,
                              )

                              return (
                                <td
                                  key={cellId}
                                  id={cellId}
                                  data-csv-row={rowIndex}
                                  data-csv-col={colIndex}
                                  data-comment-id={commentId || undefined}
                                  className={[
                                    isHit ? 'csv-cell-hit' : '',
                                    isActive ? 'csv-cell-active' : '',
                                    commentClass,
                                    shouldWrapCsvCell(value, wrapText) ? 'csv-cell-wrap' : '',
                                  ]
                                    .filter(Boolean)
                                    .join(' ')}
                                >
                                  {value || '\u00a0'}
                                </td>
                              )
                            })}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                    {index.errors.length > 0 ? (
                      <div className="csv-parse-warnings" role="status">
                        <p>Parsed with {index.errors.length} warning(s):</p>
                        <ul>
                          {index.errors.slice(0, 5).map((error, errorIndex) => (
                            <li key={`${error.row}-${errorIndex}`}>
                              Row {error.row + 1}: {error.message}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : null}
                  </article>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <ReaderTopbar
        fileName={fileName}
        onHome={onHome}
        actions={topbarActions}
        settings={settingsContent}
      />
    </div>
  )
}
