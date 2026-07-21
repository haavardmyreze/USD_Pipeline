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
import { type Theme, type ThemePreference } from '../theme'
import {
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  isEditableKeyboardTarget,
} from '../readerConfig'
import {
  formatCanvasZoomPercent,
  nextCanvasWheelZoom,
} from '../canvas/canvasZoom'
import { useCanvasZoomScrub } from '../canvas/useCanvasZoomScrub'
import {
  clampPan,
  fitCanvasSheetInViewport,
  stepCanvasZoomAtViewportCenter,
  zoomAtPoint,
  type CsvViewportState,
} from '../csv/csvViewport'
import { ReaderTopbar, type TopbarAction } from '../ui/ReaderTopbar'
import { ThemePicker } from '../ui/ThemePicker'
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
  themePaletteGroup,
} from '../ui/paletteGroups'
import type { LibraryDoc } from '../library'
import type { ToneMappingType } from 'hdrify'
import { decodeImageBuffer, type DecodedImage } from './decodeImage'
import { useReaderPageTheme } from '../ui/useReaderPageTheme'
import { imageSheetLayout, imageStrokeUnitScale } from './imageSheetLayout'
import { writeCanvasToClipboard } from '../ui/clipboardImage'
import { compositeImageWithSheetInk } from '../ui/exportInkComposite'

type ImageReaderProps = {
  fileName: string
  docKey: string
  imageData: ArrayBuffer
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

function canStartPan(event: ReactPointerEvent<HTMLDivElement>) {
  return event.button === 1
}

export default function ImageReader({
  fileName,
  docKey,
  imageData,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: ImageReaderProps) {
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const viewportRef = useRef<HTMLDivElement | null>(null)
  const sheetRef = useRef<HTMLDivElement | null>(null)
  const displayCanvasRef = useRef<HTMLCanvasElement | null>(null)
  const panSessionRef = useRef<{ x: number; y: number; panX: number; panY: number } | null>(null)

  const [decoded, setDecoded] = useState<DecodedImage | null>(null)
  const [loadError, setLoadError] = useState('')
  const [isPanning, setIsPanning] = useState(false)
  const [exposure, setExposure] = useState(0)
  const [toneMapping, setToneMapping] = useState<ToneMappingType>('aces')
  const [viewport, setViewport] = useState<CsvViewportState>({
    panX: 0,
    panY: 0,
    zoom: 1,
  })

  const sheetLayout = useMemo(
    () =>
      decoded
        ? imageSheetLayout(decoded.width, decoded.height)
        : imageSheetLayout(1, 1),
    [decoded],
  )
  const strokeUnitScale = imageStrokeUnitScale(sheetLayout)

  useReaderPageTheme(theme)
  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode()

  const isHdr = decoded?.kind === 'exr' || decoded?.kind === 'hdr'

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

  const inkNavigation = usePanZoomInkNavigation(viewportRef, setViewport, clampViewportPan, {
    canvasZoom: true,
  })
  const inkBinding = useCsvInkBinding(
    viewportRef,
    viewport.panX,
    viewport.panY,
    viewport.zoom,
    inkNavigation,
    strokeUnitScale,
  )

  useCanvasZoomScrub(viewportRef, setViewport, clampViewportPan, Boolean(decoded))

  const fitImage = useCallback(() => {
    const sheet = sheetRef.current
    const viewportElement = viewportRef.current
    if (!sheet || !viewportElement) {
      return
    }

    setViewport(
      fitCanvasSheetInViewport(
        sheet.offsetWidth,
        sheet.offsetHeight,
        viewportElement.clientWidth,
        viewportElement.clientHeight,
        40,
        1,
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
      stepCanvasZoomAtViewportCenter(current, direction, viewportElement.getBoundingClientRect()),
    )
  }, [])

  const copyImageWithInk = useCallback(async () => {
    if (!decoded) {
      return
    }

    const composite = compositeImageWithSheetInk(
      decoded.canvas,
      docKey,
      sheetLayout,
      strokeUnitScale,
    )
    await writeCanvasToClipboard(composite)
  }, [decoded, docKey, sheetLayout, strokeUnitScale])

  useEffect(() => {
    if (!drawMode || !decoded) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if ((!event.ctrlKey && !event.metaKey) || event.key.toLowerCase() !== 'c') {
        return
      }

      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      event.preventDefault()
      void copyImageWithInk()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [copyImageWithInk, decoded, drawMode])

  useEffect(() => {
    let cancelled = false

    const load = async () => {
      setLoadError('')
      setDecoded(null)

      try {
        const image = await decodeImageBuffer(imageData, fileName, {
          exposure,
          toneMapping,
        })
        if (!cancelled) {
          setDecoded(image)
        }
      } catch (error) {
        if (!cancelled) {
          setLoadError(error instanceof Error ? error.message : 'Could not decode image.')
        }
      }
    }

    void load()

    return () => {
      cancelled = true
    }
  }, [imageData, fileName, exposure, toneMapping])

  useLayoutEffect(() => {
    if (!decoded) {
      return
    }

    const canvas = displayCanvasRef.current
    if (!canvas) {
      return
    }

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    const layout = sheetLayout
    canvas.width = decoded.width
    canvas.height = decoded.height
    canvas.style.width = `${layout.sheetWidth}px`
    canvas.style.height = `${layout.sheetHeight}px`
    context.clearRect(0, 0, decoded.width, decoded.height)
    context.drawImage(decoded.canvas, 0, 0, decoded.width, decoded.height)

    const frame = window.requestAnimationFrame(() => {
      fitImage()
    })

    return () => window.cancelAnimationFrame(frame)
  }, [decoded, fitImage, sheetLayout])

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

        setViewport((current) => {
          const nextZoom = nextCanvasWheelZoom(current.zoom, event.deltaY)
          return clampViewportPan(
            zoomAtPoint(
              current.panX,
              current.panY,
              current.zoom,
              nextZoom,
              event.clientX,
              event.clientY,
              viewportElement.getBoundingClientRect(),
            ),
          )
        })
      },
      { shouldHandle: () => !drawModeRef.current },
    )
  }, [drawModeRef])

  const handleViewportWheel = useCallback(
    (event: WheelEvent) => {
      if (event.ctrlKey || event.metaKey) {
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
    },
    [clampViewportPan],
  )

  useEffect(() => {
    const viewportElement = viewportRef.current
    if (!viewportElement) {
      return
    }

    viewportElement.addEventListener('wheel', handleViewportWheel, { passive: false })
    return () => viewportElement.removeEventListener('wheel', handleViewportWheel)
  }, [handleViewportWheel, decoded])

  const handleViewportPointerDown = useCallback((event: ReactPointerEvent<HTMLDivElement>) => {
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
  }, [drawModeRef])

  const handleViewportPointerMove = useCallback(
    (event: ReactPointerEvent<HTMLDivElement>) => {
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
    },
    [clampViewportPan],
  )

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
    const onKeyDown = (event: KeyboardEvent) => {
      if (applyZoomKeyboardShortcut(event, stepZoom)) {
        return
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [stepZoom])

  const sheetStyle = {
    transform: `translate(${viewport.panX}px, ${viewport.panY}px) scale(${viewport.zoom})`,
  } as CSSProperties

  const viewportClassName = ['csv-viewport', isPanning ? 'csv-viewport-panning' : '']
    .filter(Boolean)
    .join(' ')

  const topbarActions: TopbarAction[] = [
    createDrawTopbarAction(drawMode, toggleDrawMode),
    createLaserTopbarAction(laserMode, toggleLaserMode),
  ]

  const settingsContent = (
    <>
      <div className="settings-group">
        <div className="settings-label-row">
          <p className="settings-label">Zoom</p>
          <span className="scale-value" aria-live="polite">
            {formatCanvasZoomPercent(viewport.zoom)}
          </span>
        </div>
        <div className="scale-control">
          <button type="button" className="scale-step" aria-label="Zoom out" onClick={() => stepZoom('out')}>
            −
          </button>
          <div className="segmented settings-inline-seg">
            <button type="button" className="seg" onClick={fitImage}>
              Fit
            </button>
            <button type="button" className="seg" onClick={resetZoomTo100}>
              100%
            </button>
          </div>
          <button type="button" className="scale-step" aria-label="Zoom in" onClick={() => stepZoom('in')}>
            +
          </button>
        </div>
      </div>

      {isHdr ? (
        <>
          <div className="settings-group">
            <div className="settings-label-row">
              <p className="settings-label">Exposure</p>
              <span className="scale-value" aria-live="polite">
                {exposure.toFixed(2)}
              </span>
            </div>
            <input
              type="range"
              className="scale-slider"
              min={-4}
              max={4}
              step={0.05}
              value={exposure}
              aria-label="Exposure"
              onChange={(event) => setExposure(Number(event.target.value))}
            />
          </div>
          <div className="settings-group">
            <p className="settings-label">Tone mapping</p>
            <div className="segmented">
              {(['aces', 'neutral', 'reinhard', 'agx'] as ToneMappingType[]).map((option) => (
                <button
                  key={option}
                  type="button"
                  className={toneMapping === option ? 'seg active' : 'seg'}
                  onClick={() => setToneMapping(option)}
                >
                  {option.toUpperCase()}
                </button>
              ))}
            </div>
          </div>
        </>
      ) : null}

      <ThemePicker preference={themePreference} onSelect={onSelectTheme} />
    </>
  )

  const paletteGroups = [
    actionsPaletteGroup([
      createDrawPaletteAction(toggleDrawMode),
      createLaserPaletteAction(toggleLaserMode),
      ...(drawMode
        ? [
            {
              id: 'copy-image',
              title: 'Copy image with drawings',
              keywords: 'copy clipboard export annotate ink draw',
              action: () => {
                void copyImageWithInk()
              },
            },
          ]
        : []),
      {
        id: 'fit',
        title: 'Zoom: Fit image',
        keywords: 'zoom scale',
        action: fitImage,
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
      <CommandPalette groups={paletteGroups} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />

      <div className="reader-canvas reader-canvas-image" data-theme={theme}>
        <div className="doc-stage csv-stage">
          <div className="doc-col csv-doc-col">
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
              {loadError ? (
                <article className="paper-scroll image-paper image-paper-message">
                  <h1>Unable to display image</h1>
                  <p>{loadError}</p>
                </article>
              ) : !decoded ? (
                <div className="image-loading-shell">
                  <p>Loading {fileName}…</p>
                </div>
              ) : (
                <div className="csv-sheet-layer" ref={sheetRef} style={sheetStyle}>
                  <article className="image-paper">
                    <p className="image-meta-bar">
                      <span>
                        {decoded.width} × {decoded.height}
                      </span>
                      <span aria-hidden="true"> · </span>
                      <span>{decoded.kind === 'standard' ? 'Image' : decoded.kind.toUpperCase()}</span>
                    </p>
                    <canvas ref={displayCanvasRef} className="image-display-canvas" aria-label={fileName} />
                  </article>
                </div>
              )}
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
