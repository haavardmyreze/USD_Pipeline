import {
  type CSSProperties,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { highlightCodeAuto } from '../markdown/codeHighlight'
import { type Theme, type ThemePreference } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  clampPageZoom,
  clampTypeScale,
  loadReaderPreferences,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  saveReaderPreferences,
  stepPageZoom,
  TYPE_SCALE_MAX,
  TYPE_SCALE_MIN,
} from '../readerConfig'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { ThemePicker } from '../ui/ThemePicker'
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

  const docColRef = useRef<HTMLDivElement | null>(null)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const codeRef = useRef<HTMLPreElement | null>(null)

  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode(() => {})
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

  const highlighted = useMemo(
    () => highlightCodeAuto(displayContent, language),
    [displayContent, language],
  )

  const lineCount = useMemo(() => displayContent.split(/\r?\n/).length, [displayContent])
  const lineNumbers = useMemo(
    () => Array.from({ length: lineCount }, (_, index) => index + 1),
    [lineCount],
  )

  const pageZoomPercent = Math.round(pageZoom * 100)
  const canvasStyle = {
    '--page-scale': pageZoom,
    '--type-scale': typeScale,
    '--code-pad-x': 'clamp(1rem, 2vw, 1.5rem)',
    '--code-pad-y': 'clamp(0.85rem, 2vw, 1.25rem)',
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
      applyZoomKeyboardShortcut(event, stepZoom)
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stepZoom])

  const copySource = useCallback(() => {
    void navigator.clipboard?.writeText(displayContent)
    setCopied(true)
    window.setTimeout(() => setCopied(false), 1500)
  }, [displayContent])

  const topbarActions: TopbarAction[] = [
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
      <CommandPalette groups={paletteGroups} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />
      <SelectionMenu
        scopeRef={docColRef}
        disabled={drawMode}
        actions={[
          {
            id: 'copy',
            label: 'Copy',
            onRun: (text) => {
              void navigator.clipboard?.writeText(text)
            },
          },
        ]}
      />
      <ReaderTopbar
        fileName={fileName}
        onHome={onHome}
        actions={topbarActions}
        settings={settingsContent}
      />

      <div className="reader-canvas reader-canvas-code" data-theme={theme} style={canvasStyle}>
        <div className="doc-stage">
          <div className="doc-col code-doc-col" ref={docColRef}>
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
                  <div className="code-gutter" aria-hidden="true">
                    {lineNumbers.map((lineNumber) => (
                      <span key={lineNumber} className="code-gutter-line">
                        {lineNumber}
                      </span>
                    ))}
                  </div>
                  <pre className="code-panel" ref={codeRef}>
                    <code
                      className={`language-${highlighted.language}`}
                      // highlight.js output over text we already have — not user HTML.
                      dangerouslySetInnerHTML={{ __html: highlighted.html }}
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
