import { createElement, useCallback, useEffect, useRef } from 'react'
import type { RefObject } from 'react'
import { DrawIcon } from './icons'
import type { TopbarAction } from './ReaderTopbar'
import {
  csvInkLayerKey,
  markdownInkLayerKey,
  pdfInkLayerKey,
  scrollInkViewport,
  type InkViewport,
} from './inkAnchors'
import { useDrawMode } from './useDrawMode'

export type InkBinding = {
  getLayerKey: () => string
  getInkViewport: () => InkViewport
  zoomKey: number
  /** Bump when the viewport moves without a window scroll (e.g. CSV pan). */
  viewportVersion?: number
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
  zoomKey: number,
): InkBinding {
  const getInkViewport = useCallback((): InkViewport => scrollInkViewport(), [])

  return {
    getLayerKey,
    getInkViewport,
    zoomKey,
  }
}

export function useMarkdownInkBinding(zoomKey: number): InkBinding {
  const getLayerKey = useCallback(() => markdownInkLayerKey(), [])
  return useScrollInkBinding(getLayerKey, zoomKey)
}

export function usePdfInkBinding(
  docColRef: RefObject<HTMLElement | null>,
  zoomKey: number,
): InkBinding {
  const getLayerKey = useCallback(() => pdfInkLayerKey(docColRef), [docColRef])
  return useScrollInkBinding(getLayerKey, zoomKey)
}

export function useCsvInkBinding(panX: number, panY: number, zoom: number): InkBinding {
  const panRef = useRef({ panX, panY })
  panRef.current = { panX, panY }

  const getInkViewport = useCallback(
    (): InkViewport => ({
      anchorX: panRef.current.panX,
      anchorY: panRef.current.panY,
    }),
    [],
  )

  const getLayerKey = useCallback(
    () => csvInkLayerKey(panRef.current.panX, panRef.current.panY),
    [],
  )

  return {
    getLayerKey,
    getInkViewport,
    zoomKey: zoom,
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
