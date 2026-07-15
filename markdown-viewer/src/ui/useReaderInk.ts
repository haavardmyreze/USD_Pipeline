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
import { DrawIcon } from './icons'
import type { TopbarAction } from './ReaderTopbar'
import {
  csvInkLayerKey,
  markdownInkLayerKey,
  panZoomInkContentOffset,
  pdfInkLayerKey,
  scrollInkViewport,
  type InkViewport,
} from './inkAnchors'
import { useDrawMode } from './useDrawMode'

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
  const { drawMode, toggleDrawMode, exitDrawMode, setDrawMode } = useDrawMode(onActivate)
  const drawModeRef = useRef(drawMode)

  useEffect(() => {
    drawModeRef.current = drawMode
  }, [drawMode])

  return { drawMode, toggleDrawMode, exitDrawMode, setDrawMode, drawModeRef }
}

export function useScrollInkBinding(
  getLayerKey: () => string,
  contentZoom: number,
): InkBinding {
  const getInkViewport = useCallback((): InkViewport => scrollInkViewport(), [])

  return {
    getLayerKey,
    getInkViewport,
    contentZoom,
  }
}

export function useMarkdownInkBinding(contentZoom: number): InkBinding {
  const getLayerKey = useCallback(() => markdownInkLayerKey(), [])
  return useScrollInkBinding(getLayerKey, contentZoom)
}

export function usePdfInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  contentZoom: number,
): InkBinding {
  const getLayerKey = useCallback(() => pdfInkLayerKey(docColRef), [docColRef])
  return useScrollInkBinding(getLayerKey, contentZoom)
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
    const offset = panZoomInkContentOffset(viewportRef.current)
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

export function createDrawPaletteAction(toggleDrawMode: () => void) {
  return {
    id: 'draw',
    title: 'Toggle draw mode',
    keywords: 'annotate ink pen marker presentation',
    action: toggleDrawMode,
  }
}
