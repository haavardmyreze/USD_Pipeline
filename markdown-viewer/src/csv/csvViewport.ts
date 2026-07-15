import { clampPageZoom, stepPageZoom } from '../readerConfig'
import { clampCanvasZoom, stepCanvasZoom } from '../canvas/canvasZoom'

export type CsvViewportState = {
  panX: number
  panY: number
  zoom: number
}

export function getOffsetWithinAncestor(element: HTMLElement, ancestor: HTMLElement) {
  let x = 0
  let y = 0
  let current: HTMLElement | null = element

  while (current && current !== ancestor) {
    x += current.offsetLeft
    y += current.offsetTop
    current = current.offsetParent as HTMLElement | null
    if (current && !ancestor.contains(current)) {
      break
    }
  }

  return { x, y }
}

export function zoomAtPoint(
  panX: number,
  panY: number,
  zoom: number,
  nextZoom: number,
  clientX: number,
  clientY: number,
  viewportRect: DOMRect,
) {
  const pointX = clientX - viewportRect.left
  const pointY = clientY - viewportRect.top
  const scale = nextZoom / zoom

  return {
    panX: pointX - scale * (pointX - panX),
    panY: pointY - scale * (pointY - panY),
    zoom: nextZoom,
  }
}

export function centerPanOnElement(
  element: HTMLElement,
  sheet: HTMLElement,
  viewport: HTMLElement,
  zoom: number,
) {
  const offset = getOffsetWithinAncestor(element, sheet)
  const viewportWidth = viewport.clientWidth
  const viewportHeight = viewport.clientHeight

  return {
    panX: viewportWidth / 2 - (offset.x + element.offsetWidth / 2) * zoom,
    panY: viewportHeight / 2 - (offset.y + element.offsetHeight / 2) * zoom,
  }
}

export function fitSheetInViewport(
  sheetWidth: number,
  sheetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 40,
): CsvViewportState {
  if (sheetWidth <= 0 || sheetHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { panX: 0, panY: 0, zoom: 1 }
  }

  const scaleX = (viewportWidth - padding * 2) / sheetWidth
  const scaleY = (viewportHeight - padding * 2) / sheetHeight
  const zoom = clampPageZoom(Math.min(scaleX, scaleY, 1))

  return {
    zoom,
    panX: (viewportWidth - sheetWidth * zoom) / 2,
    panY: (viewportHeight - sheetHeight * zoom) / 2,
  }
}

export function fitCanvasSheetInViewport(
  sheetWidth: number,
  sheetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  padding = 40,
  maxZoom = Number.POSITIVE_INFINITY,
): CsvViewportState {
  if (sheetWidth <= 0 || sheetHeight <= 0 || viewportWidth <= 0 || viewportHeight <= 0) {
    return { panX: 0, panY: 0, zoom: 1 }
  }

  const scaleX = (viewportWidth - padding * 2) / sheetWidth
  const scaleY = (viewportHeight - padding * 2) / sheetHeight
  const zoom = clampCanvasZoom(Math.min(scaleX, scaleY, maxZoom))

  return {
    zoom,
    panX: (viewportWidth - sheetWidth * zoom) / 2,
    panY: (viewportHeight - sheetHeight * zoom) / 2,
  }
}

export function stepZoomAtViewportCenter(
  state: CsvViewportState,
  direction: 'in' | 'out',
  viewportRect: DOMRect,
) {
  const nextZoom = stepPageZoom(state.zoom, direction)
  const centerX = viewportRect.left + viewportRect.width / 2
  const centerY = viewportRect.top + viewportRect.height / 2
  return zoomAtPoint(state.panX, state.panY, state.zoom, nextZoom, centerX, centerY, viewportRect)
}

export function stepCanvasZoomAtViewportCenter(
  state: CsvViewportState,
  direction: 'in' | 'out',
  viewportRect: DOMRect,
) {
  const nextZoom = stepCanvasZoom(state.zoom, direction)
  const centerX = viewportRect.left + viewportRect.width / 2
  const centerY = viewportRect.top + viewportRect.height / 2
  return zoomAtPoint(state.panX, state.panY, state.zoom, nextZoom, centerX, centerY, viewportRect)
}

export function wheelZoomDelta(deltaY: number) {
  return deltaY > 0 ? -0.08 : 0.08
}

/**
 * Keep the panned sheet from leaving the viewport entirely. At least `margin`
 * pixels of the sheet stay visible on every edge, so the document can never be
 * flung completely off-screen.
 */
export function clampPan(
  panX: number,
  panY: number,
  zoom: number,
  sheetWidth: number,
  sheetHeight: number,
  viewportWidth: number,
  viewportHeight: number,
  margin = 96,
): { panX: number; panY: number } {
  return {
    panX: clampAxis(panX, sheetWidth * zoom, viewportWidth, margin),
    panY: clampAxis(panY, sheetHeight * zoom, viewportHeight, margin),
  }
}

function clampAxis(pan: number, scaledSize: number, viewportSize: number, margin: number) {
  // Cap the margin so a sheet smaller than the margin still stays reachable.
  const keep = Math.min(margin, scaledSize, viewportSize)
  const min = keep - scaledSize
  const max = viewportSize - keep
  if (min > max) {
    // Sheet fits within the viewport: pin it so it can't drift out.
    return Math.min(Math.max(pan, max), min)
  }
  return Math.min(Math.max(pan, min), max)
}
