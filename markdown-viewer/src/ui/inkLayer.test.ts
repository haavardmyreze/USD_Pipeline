import { describe, expect, it } from 'vitest'
import { scrollDocumentInkViewportFromRect, type InkViewport } from './inkAnchors'
import type { InkLayer } from './inkLayer'
import { storageToViewportPoint, viewportToStoragePoint } from './inkLayer'

function sheetLayer(): InkLayer {
  return {
    key: 'test',
    anchorX: 0,
    anchorY: 0,
    coordinateSpace: 'sheet',
    strokes: [],
    backingCanvas: {} as HTMLCanvasElement,
  }
}

describe('scroll document ink coordinates', () => {
  it('tracks the same client point when page zoom changes', () => {
    const layer = sheetLayer()
    const inkTop = 72
    const clientPoint = { x: 280, y: 420 }
    const drawZoom = 1.1
    const nextZoom = 1.6
    const drawRect = { left: 120, top: 180 }
    const unscaledX = (clientPoint.x - drawRect.left) / drawZoom
    const unscaledY = (clientPoint.y - drawRect.top) / drawZoom
    const nextRect = {
      left: clientPoint.x - unscaledX * nextZoom,
      top: clientPoint.y - unscaledY * nextZoom,
    }

    const viewportAtDraw = scrollDocumentInkViewportFromRect(drawRect, inkTop)
    const canvasPoint = {
      x: clientPoint.x,
      y: clientPoint.y - inkTop,
    }

    const stored = viewportToStoragePoint(canvasPoint, layer, viewportAtDraw, drawZoom)
    const viewportAfterZoom = scrollDocumentInkViewportFromRect(nextRect, inkTop)
    const restored = storageToViewportPoint(stored, viewportAfterZoom, nextZoom, 'sheet')

    expect(restored.x).toBeCloseTo(clientPoint.x, 5)
    expect(restored.y).toBeCloseTo(clientPoint.y - inkTop, 5)
  })
})

describe('sheet ink coordinates', () => {
  it('round-trips pan/zoom viewport points at the same zoom', () => {
    const viewport: InkViewport = {
      anchorX: 120,
      anchorY: 80,
      contentOffsetX: 0,
      contentOffsetY: 0,
    }
    const zoom = 1.5
    const layer = sheetLayer()
    const point = { x: 420, y: 260, pressure: 0.5 }

    const stored = viewportToStoragePoint(point, layer, viewport, zoom)
    const restored = storageToViewportPoint(stored, viewport, zoom, 'sheet')

    expect(restored.x).toBeCloseTo(point.x, 5)
    expect(restored.y).toBeCloseTo(point.y, 5)
  })

  it('keeps the same document point when zoom changes', () => {
    const layer = sheetLayer()
    const screenPoint = { x: 300, y: 200 }
    const viewportAtDraw: InkViewport = {
      anchorX: 40,
      anchorY: 60,
      contentOffsetX: 0,
      contentOffsetY: 0,
    }
    const drawZoom = 1

    const documentPoint = viewportToStoragePoint(screenPoint, layer, viewportAtDraw, drawZoom)

    const viewportAfterZoom: InkViewport = {
      anchorX: 10,
      anchorY: -5,
      contentOffsetX: 0,
      contentOffsetY: 0,
    }
    const nextZoom = 2.25

    const restored = storageToViewportPoint(documentPoint, viewportAfterZoom, nextZoom, 'sheet')
    const expectedX =
      documentPoint.x * nextZoom + viewportAfterZoom.anchorX + (viewportAfterZoom.contentOffsetX ?? 0)
    const expectedY =
      documentPoint.y * nextZoom + viewportAfterZoom.anchorY + (viewportAfterZoom.contentOffsetY ?? 0)

    expect(restored.x).toBeCloseTo(expectedX, 5)
    expect(restored.y).toBeCloseTo(expectedY, 5)
  })

  it('does not drift when the ink overlay starts at the top of the screen', () => {
    const layer = sheetLayer()
    const clientY = 200
    const viewport: InkViewport = {
      anchorX: 0,
      anchorY: 0,
      contentOffsetX: 0,
      contentOffsetY: 0,
    }
    const zoomBefore = 1
    const zoomAfter = 2
    const panBefore = { anchorX: 0, anchorY: 0 }
    const panAfter = { anchorX: 0, anchorY: -100 }

    const stored = viewportToStoragePoint({ x: 100, y: clientY }, layer, panBefore, zoomBefore)
    const atNewZoom = storageToViewportPoint(
      stored,
      { ...viewport, ...panAfter },
      zoomAfter,
      'sheet',
    )

    const expectedY = stored.y * zoomAfter + panAfter.anchorY
    expect(atNewZoom.y).toBeCloseTo(expectedY, 5)
    expect(stored.y).toBeCloseTo(clientY, 5)
  })
})
