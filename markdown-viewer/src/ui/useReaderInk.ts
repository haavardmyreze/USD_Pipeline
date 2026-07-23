import { createElement, useCallback, useEffect, useMemo, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import {
  wheelZoomDelta,
  zoomAtPoint,
  type CsvViewportState,
} from '../csv/csvViewport'
import { clampPageZoom } from '../readerConfig'
import {
  nextCanvasWheelZoom,
} from '../canvas/canvasZoom'
import { DrawIcon, LaserIcon } from './icons'
import type { TopbarAction } from './ReaderTopbar'
import {
  codeInkLayerKey,
  csvInkLayerKey,
  markdownInkLayerKey,
  panZoomInkContentOffset,
  pdfInkLayerKey,
  scrollDocumentInkViewport,
  type InkViewport,
} from './inkAnchors'
import { usePresentationMode } from './usePresentationMode'

export type InkViewportNavigation = {
  panBy: (deltaX: number, deltaY: number) => void
  handleWheel: (event: WheelEvent) => void
}

export type InkBinding = {
  getLayerKey: () => string
  getInkViewport: () => InkViewport
  /** Current content zoom (page scale or pan/zoom sheet scale). */
  contentZoom: number
  /** Store stroke points in sheet space so ink survives zoom changes. */
  useSheetCoordinates?: boolean
  /** Scales ink width for normalized image display (sheet / native). */
  strokeUnitScale?: number
  /** Middle-mouse pan and wheel navigation while drawing on a pan/zoom canvas. */
  navigation?: InkViewportNavigation
  /** Bump when the viewport moves without a window scroll (e.g. CSV pan). */
  viewportVersion?: number
}

export type PanZoomInkNavigationOptions = {
  /** Use exponential canvas zoom (image viewer) instead of linear page zoom. */
  canvasZoom?: boolean
}

export function usePanZoomInkNavigation(
  viewportRef: RefObject<HTMLElement | null>,
  setViewport: Dispatch<SetStateAction<CsvViewportState>>,
  clampViewportPan: (next: CsvViewportState) => CsvViewportState,
  options?: PanZoomInkNavigationOptions,
): InkViewportNavigation {
  const canvasZoom = options?.canvasZoom ?? false
  const panBy = useCallback(
    (deltaX: number, deltaY: number) => {
      setViewport((current) =>
        clampViewportPan({
          ...current,
          panX: current.panX + deltaX,
          panY: current.panY + deltaY,
        }),
      )
    },
    [clampViewportPan, setViewport],
  )

  const handleWheel = useCallback(
    (event: WheelEvent) => {
      event.preventDefault()

      if (event.ctrlKey || event.metaKey) {
        const viewportElement = viewportRef.current
        if (!viewportElement) {
          return
        }

        const delta = wheelZoomDelta(event.deltaY)
        setViewport((current) => {
          const nextZoom = canvasZoom
            ? nextCanvasWheelZoom(current.zoom, event.deltaY)
            : clampPageZoom(current.zoom + delta)
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
        return
      }

      setViewport((current) =>
        clampViewportPan({
          ...current,
          panX: current.panX - event.deltaX,
          panY: current.panY - event.deltaY,
        }),
      )
    },
    [canvasZoom, clampViewportPan, setViewport, viewportRef],
  )

  return useMemo(() => ({ panBy, handleWheel }), [panBy, handleWheel])
}

export function useReaderDrawMode(onActivate?: () => void) {
  const {
    drawMode,
    laserMode,
    toggleDrawMode,
    toggleLaserMode,
    exitPresentationMode,
    setDrawMode,
  } = usePresentationMode(onActivate)
  const drawModeRef = useRef(drawMode)
  const laserModeRef = useRef(laserMode)

  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  useEffect(() => {
    laserModeRef.current = laserMode
  }, [laserMode])

  return {
    drawMode,
    laserMode,
    toggleDrawMode,
    toggleLaserMode,
    exitDrawMode: exitPresentationMode,
    exitPresentationMode,
    setDrawMode,
    drawModeRef,
    laserModeRef,
  }
}

export function useScrollDocumentInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  getLayerKey: () => string,
  contentZoom: number,
): InkBinding {
  const getInkViewport = useCallback(
    (): InkViewport => scrollDocumentInkViewport(docColRef),
    [docColRef],
  )

  return {
    getLayerKey,
    getInkViewport,
    contentZoom,
    useSheetCoordinates: true,
    viewportVersion: window.scrollY + contentZoom,
  }
}

export function useMarkdownInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  contentZoom: number,
): InkBinding {
  const getLayerKey = useCallback(() => markdownInkLayerKey(), [])
  return useScrollDocumentInkBinding(docColRef, getLayerKey, contentZoom)
}

export function useCodeInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  contentZoom: number,
): InkBinding {
  const getLayerKey = useCallback(() => codeInkLayerKey(), [])
  return useScrollDocumentInkBinding(docColRef, getLayerKey, contentZoom)
}

export function usePdfInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  contentZoom: number,
): InkBinding {
  const getLayerKey = useCallback(() => pdfInkLayerKey(docColRef), [docColRef])
  return useScrollDocumentInkBinding(docColRef, getLayerKey, contentZoom)
}

export function useCsvInkBinding(
  viewportRef: RefObject<HTMLElement | null>,
  panX: number,
  panY: number,
  zoom: number,
  navigation?: InkViewportNavigation,
  strokeUnitScale = 1,
): InkBinding {
  const panRef = useRef({ panX, panY })
  panRef.current = { panX, panY }

  const getInkViewport = useCallback((): InkViewport => {
    const offset = panZoomInkContentOffset(viewportRef.current, 0)
    return {
      anchorX: panRef.current.panX,
      anchorY: panRef.current.panY,
      ...offset,
    }
  }, [viewportRef])

  const getLayerKey = useCallback(
    () => csvInkLayerKey(panRef.current.panX, panRef.current.panY),
    [],
  )

  return {
    getLayerKey,
    getInkViewport,
    contentZoom: zoom,
    useSheetCoordinates: true,
    navigation,
    strokeUnitScale,
    viewportVersion: panX + panY + zoom,
  }
}

export function createDrawTopbarAction(
  drawMode: boolean,
  toggleDrawMode: () => void,
): TopbarAction {
  return {
    id: 'draw',
    label: 'Draw',
    icon: createElement(DrawIcon),
    active: drawMode,
    onToggle: toggleDrawMode,
  }
}

export function createLaserTopbarAction(
  laserMode: boolean,
  toggleLaserMode: () => void,
): TopbarAction {
  return {
    id: 'laser',
    label: 'Laser',
    icon: createElement(LaserIcon),
    active: laserMode,
    onToggle: toggleLaserMode,
  }
}

export function createDrawPaletteAction(toggleDrawMode: () => void) {
  return {
    id: 'draw',
    title: 'Toggle draw mode (D)',
    keywords: 'annotate ink pen marker presentation draw d',
    action: toggleDrawMode,
  }
}

export function createLaserPaletteAction(toggleLaserMode: () => void) {
  return {
    id: 'laser',
    title: 'Toggle laser pointer (L)',
    keywords: 'present pointer highlight laser l',
    action: toggleLaserMode,
  }
}
