import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { type Theme, type ThemePreference } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  clampTypeScale,
  isEditableKeyboardTarget,
  loadReaderPreferences,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  saveReaderPreferences,
  stepPageZoom,
  TYPE_SCALE_MAX,
  TYPE_SCALE_MIN,
} from '../readerConfig'
import DocAssistant from '../DocAssistant'
import DocComments from '../DocComments'
import type { CommentAnchor } from '../documentComments'
import { useDocumentComments } from '../documentComments'
import { AskIcon, CommentsIcon, SearchIcon } from '../ui/icons'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { SearchPanel } from '../ui/SearchPanel'
import { ThemePicker } from '../ui/ThemePicker'
import { usePanels } from '../ui/usePanels'
import { CommandPalette } from '../ui/CommandPalette'
import { InkAnnotation } from '../ui/InkAnnotation'
import { LaserPointer } from '../ui/LaserPointer'
import { SelectionMenu } from '../ui/SelectionMenu'
import {
  createDrawPaletteAction,
  createDrawTopbarAction,
  createLaserPaletteAction,
  createLaserTopbarAction,
  useCodeInkBinding,
  useReaderDrawMode,
} from '../ui/useReaderInk'
import { actionsPaletteGroup, libraryPaletteGroup, themePaletteGroup } from '../ui/paletteGroups'
import { useReaderPageTheme } from '../ui/useReaderPageTheme'
import type { LibraryDoc } from '../library'
import { normalizePastedText } from '../text/normalizeLineBreaks'
import { detectCodeLanguage, formatLanguageLabel } from './detectLanguage'
import { prepareCodeView } from './codeView'
import { resolveCodeSelectionAnchor, getCodeLineHighlights } from './codeCommentAnchors'
import { searchCode } from './codeSearch'

type CodeReaderProps = {
  fileName: string
  docKey: string
  content: string
  language?: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

export default function CodeReader({
  fileName,
  docKey,
  content,
  language: languageHint,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: CodeReaderProps) {
  const [pageZoom, setPageZoom] = useState(() => loadReaderPreferences().pageZoom)
  const [typeScale, setTypeScale] = useState(() => loadReaderPreferences().typeScale)
  const [copied, setCopied] = useState(false)
  const [searchQuery, setSearchQuery] = useState('')
  const [activeSearchLine, setActiveSearchLine] = useState<number | null>(null)
  const [assistantPrefill, setAssistantPrefill] = useState<{
    text: string
    tick: number
  } | null>(null)

  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const codeRef = useRef<HTMLPreElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)

  const panels = usePanels()
  const { closeAll: closeAllPanels, open: openPanel } = panels
  const searchOpen = panels.isOpen('search')
  const commentsOpen = panels.isOpen('comments')
  const assistantOpen = panels.isOpen('assistant')

  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode(closeAllPanels)
  const inkBinding = useCodeInkBinding(docColRef, pageZoom)

  useReaderPageTheme(theme)

  const displayContent = useMemo(() => {
    if (!fileName.startsWith('clipboard.')) {
      return content
    }
    return normalizePastedText(content, 'code')
  }, [content, fileName])

  const language = useMemo(
    () => languageHint ?? detectCodeLanguage(fileName, displayContent),
    [displayContent, fileName, languageHint],
  )

  const codeView = useMemo(
    () => prepareCodeView(displayContent, language),
    [displayContent, language],
  )

  const gutterDigits = Math.max(2, String(Math.max(codeView.lineCount, 1)).length)

  const lines = useMemo(() => displayContent.split('\n'), [displayContent])

  const commentSource = useMemo(
    () => ({ format: 'code' as const, lines }),
    [lines],
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
    () => searchCode(displayContent, searchQuery),
    [displayContent, searchQuery],
  )

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

  const askQuery = useCallback(
    (text: string) => {
      setAssistantPrefill({ text, tick: Date.now() })
      openPanel('assistant')
    },
    [openPanel],
  )

  const scrollToLine = useCallback((line: number) => {
    const root = codeRef.current
    const element = root?.querySelector<HTMLElement>(`.code-line[data-line="${line}"]`)
    if (!element) {
      return
    }

    element.scrollIntoView({ behavior: 'smooth', block: 'center' })
    element.classList.remove('code-line-flash')
    // Force reflow so the animation restarts on repeat jumps.
    void element.offsetWidth
    element.classList.add('code-line-flash')
    window.setTimeout(() => element.classList.remove('code-line-flash'), 1200)
  }, [])

  const resolveSelectionAnchor = useCallback(
    (selection: Selection, scope: HTMLElement) =>
      resolveCodeSelectionAnchor(selection, scope, lines),
    [lines],
  )

  const scrollToAnchor = useCallback(
    (commentId: string, anchor: CommentAnchor) => {
      if (anchor.kind === 'code') {
        scrollToLine(anchor.line)
      }
      setActiveCommentId(commentId)
    },
    [scrollToLine, setActiveCommentId],
  )

  const handleAddComment = useCallback(
    (anchor: CommentAnchor, body: string) => addComment(anchor, body),
    [addComment],
  )

  // Apply comment highlight classes to line elements after render — cheap DOM
  // toggles, so comments never trigger re-highlighting of the code.
  useEffect(() => {
    const root = codeRef.current
    if (!root) {
      return
    }

    root.querySelectorAll<HTMLElement>('.code-comment-hit').forEach((element) => {
      element.classList.remove('code-comment-hit', 'code-comment-active')
      element.removeAttribute('data-comment-id')
    })

    for (const [line, highlight] of getCodeLineHighlights(comments, activeCommentId)) {
      const element = root.querySelector<HTMLElement>(`.code-line[data-line="${line}"]`)
      if (!element) {
        continue
      }
      element.classList.add('code-comment-hit')
      if (highlight.className.includes('code-comment-active')) {
        element.classList.add('code-comment-active')
      }
      element.setAttribute('data-comment-id', highlight.commentId)
    }
  }, [codeView.html, comments, activeCommentId])

  // Tag search-hit lines (and the active result) via DOM classes.
  useEffect(() => {
    const root = codeRef.current
    if (!root) {
      return
    }

    root.querySelectorAll<HTMLElement>('.code-line-hit, .code-line-active').forEach((element) => {
      element.classList.remove('code-line-hit', 'code-line-active')
    })

    if (!searchOpen || !trimmedSearchQuery) {
      return
    }

    for (const result of searchResults) {
      const element = root.querySelector<HTMLElement>(`.code-line[data-line="${result.line}"]`)
      element?.classList.add('code-line-hit')
    }

    if (activeSearchLine !== null) {
      const element = root.querySelector<HTMLElement>(
        `.code-line[data-line="${activeSearchLine}"]`,
      )
      element?.classList.add('code-line-active')
    }
  }, [codeView.html, searchOpen, trimmedSearchQuery, searchResults, activeSearchLine])

  // Reset transient state when the document changes.
  useEffect(() => {
    closeAllPanels()
    setSearchQuery('')
    setActiveSearchLine(null)
  }, [displayContent, docKey, closeAllPanels])

  const pageZoomPercent = Math.round(pageZoom * 100)
  const canvasStyle = {
    '--page-scale': pageZoom,
    '--type-scale': typeScale,
    '--code-pad-x': 'clamp(1rem, 2vw, 1.5rem)',
    '--code-pad-y': 'clamp(0.85rem, 2vw, 1.25rem)',
    '--code-gutter-digits': gutterDigits,
  } as CSSProperties

  const stepZoom = useCallback((direction: 'in' | 'out') => {
    setPageZoom((current) => stepPageZoom(current, direction))
  }, [])

  const changePageZoom = useCallback((value: number) => {
    setPageZoom(clampPageZoom(value))
  }, [])

  const changeTypeScale = useCallback((value: number) => {
    setTypeScale(clampTypeScale(value))
  }, [])

  useEffect(() => {
    saveReaderPreferences({
      ...loadReaderPreferences(),
      pageZoom,
      typeScale,
    })
  }, [pageZoom, typeScale])

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
  }, [drawModeRef, stepZoom])

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

  const copySource = useCallback(() => {
    void navigator.clipboard?.writeText(displayContent)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [displayContent])

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
          <p className="settings-label">Scale</p>
          <span className="scale-value" aria-live="polite">
            {pageZoomPercent}%
          </span>
        </div>
        <div className="scale-control">
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom out"
            onClick={() => stepZoom('out')}
            disabled={pageZoom <= PAGE_ZOOM_MIN}
          >
            −
          </button>
          <input
            type="range"
            className="scale-slider"
            min={PAGE_ZOOM_MIN * 100}
            max={PAGE_ZOOM_MAX * 100}
            step={1}
            value={pageZoomPercent}
            aria-label="Page scale"
            onChange={(event) => changePageZoom(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom in"
            onClick={() => stepZoom('in')}
            disabled={pageZoom >= PAGE_ZOOM_MAX}
          >
            +
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-label-row">
          <p className="settings-label">Text size</p>
          <span className="scale-value" aria-live="polite">
            {Math.round(typeScale * 100)}%
          </span>
        </div>
        <div className="scale-control">
          <button
            type="button"
            className="scale-step"
            aria-label="Smaller text"
            onClick={() => changeTypeScale(typeScale - 0.05)}
            disabled={typeScale <= TYPE_SCALE_MIN}
          >
            −
          </button>
          <input
            type="range"
            className="scale-slider"
            min={TYPE_SCALE_MIN * 100}
            max={TYPE_SCALE_MAX * 100}
            step={5}
            value={Math.round(typeScale * 100)}
            aria-label="Text size"
            onChange={(event) => changeTypeScale(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            className="scale-step"
            aria-label="Larger text"
            onClick={() => changeTypeScale(typeScale + 0.05)}
            disabled={typeScale >= TYPE_SCALE_MAX}
          >
            +
          </button>
        </div>
      </div>

      <ThemePicker preference={themePreference} onSelect={onSelectTheme} />
    </>
  )

  const paletteGroups = [
    actionsPaletteGroup([
      {
        id: 'search',
        title: 'Search code',
        keywords: 'find text line',
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
        title: 'Ask about this code',
        keywords: 'ai assistant chat',
        action: () => panels.toggle('assistant'),
      },
      createDrawPaletteAction(toggleDrawMode),
      createLaserPaletteAction(toggleLaserMode),
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
      <CommandPalette groups={paletteGroups} onAskQuery={askQuery} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />
      <SelectionMenu
        scopeRef={docColRef}
        disabled={drawMode || laserMode || commentsOpen}
        actions={[
          {
            id: 'copy',
            label: 'Copy',
            onRun: (text) => {
              void navigator.clipboard?.writeText(text)
            },
          },
          {
            id: 'ask',
            label: 'Ask',
            onRun: (text) => askQuery(text),
          },
        ]}
      />

      <DocAssistant
        open={assistantOpen}
        onClose={() => panels.close('assistant')}
        markdown={displayContent}
        fileName={fileName}
        sections={[]}
        onNavigateToSection={() => {}}
        prefill={assistantPrefill}
      />

      <DocComments
        open={commentsOpen}
        onClose={() => panels.close('comments')}
        docColRef={docColRef}
        markdown=""
        toc={[]}
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
        placeholder="Search code"
        resultNoun="line"
        results={searchResults.map((result) => ({
          id: result.id,
          text: `Line ${result.lineNumber}`,
          snippet: result.snippet,
        }))}
        activeResultId={activeSearchLine !== null ? `code-line-${activeSearchLine}` : undefined}
        onSelect={(item) => {
          const result = searchResults.find((candidate) => candidate.id === item.id)
          if (result) {
            setActiveSearchLine(result.line)
            scrollToLine(result.line)
          }
        }}
      />

      <ReaderTopbar
        fileName={fileName}
        onHome={onHome}
        actions={topbarActions}
        settings={settingsContent}
      />

      <div
        className="reader-canvas reader-canvas-code"
        data-theme={theme}
        data-comment-mode={commentsOpen && !drawMode ? 'true' : undefined}
        style={canvasStyle}
      >
        <div className="doc-stage">
          <div
            className={
              commentsOpen && !drawMode
                ? 'doc-col code-doc-col comment-mode'
                : 'doc-col code-doc-col'
            }
            ref={docColRef}
          >
            <article className="paper-scroll code-scroll">
              <div className="code-view">
                <div className="code-view-header">
                  <span className="code-language-badge">{formatLanguageLabel(language)}</span>
                  <button
                    type="button"
                    className="code-copy code-copy-inline"
                    aria-label="Copy code"
                    onClick={copySource}
                  >
                    {copied ? 'Copied' : 'Copy'}
                  </button>
                </div>
                <div className="code-panel-wrap">
                  <pre className="code-panel" ref={codeRef}>
                    <code
                      className={`language-${codeView.language}`}
                      data-plain={codeView.highlighted ? undefined : 'true'}
                      // highlight.js output over text we already have — not user HTML.
                      dangerouslySetInnerHTML={{ __html: codeView.html }}
                    />
                  </pre>
                </div>
              </div>
            </article>
          </div>
        </div>
      </div>
    </div>
  )
}
