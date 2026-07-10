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
import { type Theme, THEMES } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  isZoomWheelEvent,
} from '../readerConfig'
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

function canStartPan(event: ReactPointerEvent<HTMLDivElement>) {
  return event.button === 1
}

export default function CsvReader({
  fileName,
  docKey,
  csvContent,
  theme,
  onSelectTheme,
  onHome,
}: CsvReaderProps) {
  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const panSessionRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)
  const [searchOpen, setSearchOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [wrapText, setWrapText] = useState(() => loadCsvWrapTextPreference())
  const [searchQuery, setSearchQuery] = useState('')
  const [activeCellId, setActiveCellId] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [viewport, setViewport] = useState<CsvViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  })

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
    setViewport((current) => ({
      ...current,
      panX: current.panX - event.deltaX,
      panY: current.panY - event.deltaY,
    }))
  }, [])

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }

    return attachDocumentZoomWheel(root, (_direction, event) => {
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
    })
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
      if (!canStartPan(event)) {
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

    setViewport((current) => ({
      ...current,
      panX: session.panX + (event.clientX - session.x),
      panY: session.panY + (event.clientY - session.y),
    }))
  }, [])

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
    setSearchOpen(false)
    setCommentsOpen(false)
    setAssistantOpen(false)
    setSettingsOpen(false)
    setSearchQuery('')
    setActiveCellId('')
    setIsPanning(false)
    panSessionRef.current = null
  }, [csvContent, docKey])

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
        setCommentsOpen(false)
        setAssistantOpen(false)
        setSettingsOpen(false)
        focusSearchInput()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [assistantOpen, commentsOpen, focusSearchInput, searchOpen, stepZoom])

  const hasData = index.headers.length > 0
  const sheetStyle = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  } as CSSProperties
  const viewportClassName = ['csv-viewport', isPanning ? 'csv-viewport-panning' : '']
    .filter(Boolean)
    .join(' ')

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
              className={searchOpen ? 'ghost-button active' : 'ghost-button'}
              aria-expanded={searchOpen}
              onClick={() => {
                setSearchOpen((value) => !value)
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
                placeholder="Search cells"
                aria-label="Search this spreadsheet"
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
                  ? 'No matching cells.'
                  : `${searchResults.length} matching cell${searchResults.length === 1 ? '' : 's'}.`}
              </p>
            ) : (
              <p className="search-panel-hint">Tip: press / to focus search.</p>
            )}

            <div className="search-results" role="list" aria-label="Search results">
              {trimmedSearchQuery
                ? searchResults.map((result) => (
                    <button
                      type="button"
                      key={result.id}
                      className={
                        activeCellId === result.id ? 'search-result active' : 'search-result'
                      }
                      onClick={() => scrollToCell(result.row, result.col)}
                    >
                      <span className="search-result-title">
                        Row {result.row + 1} ·{' '}
                        {highlightMatches(result.columnName, trimmedSearchQuery)}
                      </span>
                      <span className="search-result-snippet">
                        {highlightMatches(result.snippet, trimmedSearchQuery)}
                      </span>
                    </button>
                  ))
                : null}
            </div>
          </div>
        </aside>
      ) : null}

      <div
        className="reader-canvas reader-canvas-csv"
        data-theme={theme}
        data-comment-mode={commentsOpen ? 'true' : undefined}
      >
        <div className="doc-stage csv-stage">
          <div
            className={commentsOpen ? 'doc-col comment-mode csv-doc-col' : 'doc-col csv-doc-col'}
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
    </div>
  )
}
