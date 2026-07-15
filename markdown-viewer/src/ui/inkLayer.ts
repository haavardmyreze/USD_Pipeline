import { drawInkStroke, type InkPoint } from './inkBrush'
import { INK_MAX_DEVICE_PIXEL_RATIO, type InkBrushKind } from './inkConfig'
import type { InkViewport } from './inkAnchors'

export type StoredStroke = {
  id: string
  color: string
  brush: InkBrushKind
  points: InkPoint[]
  simulatePressure: boolean
}

export type InkCoordinateSpace = 'viewport' | 'sheet'

export type InkLayer = {
  key: string
  anchorX: number
  anchorY: number
  coordinateSpace: InkCoordinateSpace
  strokes: StoredStroke[]
  backingCanvas: HTMLCanvasElement
}

export type ViewportCanvasSize = {
  cssWidth: number
  cssHeight: number
  devicePixelRatio: number
}

export function createStrokeId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `stroke-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

export function viewportCanvasSize(): ViewportCanvasSize {
  const topbar = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--topbar-total'),
  )
  const topbarHeight = Number.isFinite(topbar) ? topbar : 72

  return {
    cssWidth: window.innerWidth,
    cssHeight: Math.max(window.innerHeight - topbarHeight, 1),
    devicePixelRatio: Math.min(window.devicePixelRatio || 1, INK_MAX_DEVICE_PIXEL_RATIO),
  }
}

export function createInkLayer(
  key: string,
  anchorX: number,
  anchorY: number,
  coordinateSpace: InkCoordinateSpace,
  size: ViewportCanvasSize,
): InkLayer {
  const layer: InkLayer = {
    key,
    anchorX,
    anchorY,
    coordinateSpace,
    strokes: [],
    backingCanvas: document.createElement('canvas'),
  }

  resizeInkLayer(layer, size)
  return layer
}

function layerContext(layer: InkLayer, size: ViewportCanvasSize) {
  const context = layer.backingCanvas.getContext('2d', {
    alpha: true,
    desynchronized: true,
  })
  if (!context) {
    return null
  }

  context.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0)
  return context
}

export function resizeInkLayer(layer: InkLayer, size: ViewportCanvasSize) {
  const pixelWidth = Math.max(1, Math.floor(size.cssWidth * size.devicePixelRatio))
  const pixelHeight = Math.max(1, Math.floor(size.cssHeight * size.devicePixelRatio))

  layer.backingCanvas.width = pixelWidth
  layer.backingCanvas.height = pixelHeight
  redrawInkLayer(layer, size)
}

export function redrawInkLayer(layer: InkLayer, size: ViewportCanvasSize) {
  if (layer.coordinateSpace === 'sheet') {
    return
  }

  const context = layerContext(layer, size)
  if (!context) {
    return
  }

  context.setTransform(1, 0, 0, 1, 0, 0)
  context.clearRect(0, 0, layer.backingCanvas.width, layer.backingCanvas.height)
  context.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0)

  for (const stroke of layer.strokes) {
    drawInkStroke(
      context,
      stroke.points,
      stroke.color,
      stroke.brush ?? 'pen',
      true,
      stroke.simulatePressure,
    )
  }
}

export function viewportToStoragePoint(
  viewportPoint: InkPoint,
  layer: InkLayer,
  viewport: InkViewport,
  contentZoom: number,
): InkPoint {
  if (layer.coordinateSpace === 'sheet') {
    const offsetX = viewport.contentOffsetX ?? 0
    const offsetY = viewport.contentOffsetY ?? 0
    const contentX = viewportPoint.x - offsetX
    const contentY = viewportPoint.y - offsetY
    return {
      x: (contentX - viewport.anchorX) / contentZoom,
      y: (contentY - viewport.anchorY) / contentZoom,
      pressure: viewportPoint.pressure,
    }
  }

  return {
    x: viewportPoint.x - (layer.anchorX - viewport.anchorX),
    y: viewportPoint.y - (layer.anchorY - viewport.anchorY),
    pressure: viewportPoint.pressure,
  }
}

export function storageToViewportPoint(
  storagePoint: InkPoint,
  viewport: InkViewport,
  contentZoom: number,
  coordinateSpace: InkCoordinateSpace,
): InkPoint {
  if (coordinateSpace === 'sheet') {
    const offsetX = viewport.contentOffsetX ?? 0
    const offsetY = viewport.contentOffsetY ?? 0
    return {
      x: storagePoint.x * contentZoom + viewport.anchorX + offsetX,
      y: storagePoint.y * contentZoom + viewport.anchorY + offsetY,
      pressure: storagePoint.pressure,
    }
  }

  return storagePoint
}

function strokeIntersectsViewport(
  stroke: StoredStroke,
  viewport: InkViewport,
  contentZoom: number,
  coordinateSpace: InkCoordinateSpace,
  viewportWidth: number,
  viewportHeight: number,
) {
  const margin = 48
  for (const point of stroke.points) {
    const viewportPoint = storageToViewportPoint(point, viewport, contentZoom, coordinateSpace)
    if (
      viewportPoint.x >= -margin &&
      viewportPoint.x <= viewportWidth + margin &&
      viewportPoint.y >= -margin &&
      viewportPoint.y <= viewportHeight + margin
    ) {
      return true
    }
  }

  return false
}

export function layerIsVisible(
  layer: InkLayer,
  viewport: InkViewport,
  viewportWidth: number,
  viewportHeight: number,
  contentZoom = 1,
) {
  if (layer.coordinateSpace === 'sheet') {
    return layer.strokes.some((stroke) =>
      strokeIntersectsViewport(
        stroke,
        viewport,
        contentZoom,
        layer.coordinateSpace,
        viewportWidth,
        viewportHeight,
      ),
    )
  }

  const offsetX = layer.anchorX - viewport.anchorX
  const offsetY = layer.anchorY - viewport.anchorY
  return (
    offsetX + viewportWidth > 0 &&
    offsetX < viewportWidth &&
    offsetY + viewportHeight > 0 &&
    offsetY < viewportHeight
  )
}

export function compositeInkLayers(
  displayContext: CanvasRenderingContext2D,
  displayCanvas: HTMLCanvasElement,
  layers: InkLayer[],
  viewport: InkViewport,
  size: ViewportCanvasSize,
  activeLayer: InkLayer | null,
  currentStroke: InkPoint[],
  currentColor: string,
  currentBrush: InkBrushKind,
  simulatePressure: boolean,
  contentZoom: number,
  strokeUnitScale = 1,
) {
  displayContext.setTransform(1, 0, 0, 1, 0, 0)
  displayContext.clearRect(0, 0, displayCanvas.width, displayCanvas.height)
  displayContext.setTransform(size.devicePixelRatio, 0, 0, size.devicePixelRatio, 0, 0)

  const strokeSizeScale = contentZoom * strokeUnitScale

  for (const layer of layers) {
    if (
      !layerIsVisible(layer, viewport, size.cssWidth, size.cssHeight, contentZoom)
    ) {
      continue
    }

    if (layer.coordinateSpace === 'sheet') {
      for (const stroke of layer.strokes) {
        const viewportPoints = stroke.points.map((point) =>
          storageToViewportPoint(point, viewport, contentZoom, layer.coordinateSpace),
        )
        drawInkStroke(
          displayContext,
          viewportPoints,
          stroke.color,
          stroke.brush ?? 'pen',
          true,
          stroke.simulatePressure,
          strokeSizeScale,
        )
      }
      continue
    }

    const offsetX = layer.anchorX - viewport.anchorX
    const offsetY = layer.anchorY - viewport.anchorY
    displayContext.drawImage(
      layer.backingCanvas,
      0,
      0,
      layer.backingCanvas.width,
      layer.backingCanvas.height,
      offsetX,
      offsetY,
      size.cssWidth,
      size.cssHeight,
    )
  }

  if (activeLayer && currentStroke.length > 0) {
    const drawActiveStroke =
      activeLayer.coordinateSpace === 'sheet' ||
      layerIsVisible(activeLayer, viewport, size.cssWidth, size.cssHeight, contentZoom)

    if (!drawActiveStroke) {
      return
    }
    const viewportStroke =
      activeLayer.coordinateSpace === 'sheet'
        ? currentStroke.map((point) =>
            storageToViewportPoint(point, viewport, contentZoom, activeLayer.coordinateSpace),
          )
        : currentStroke

    if (activeLayer.coordinateSpace === 'sheet') {
      drawInkStroke(
        displayContext,
        viewportStroke,
        currentColor,
        currentBrush,
        false,
        simulatePressure,
        strokeSizeScale,
      )
    } else {
      const offsetX = activeLayer.anchorX - viewport.anchorX
      const offsetY = activeLayer.anchorY - viewport.anchorY
      displayContext.save()
      displayContext.translate(offsetX, offsetY)
      drawInkStroke(displayContext, viewportStroke, currentColor, currentBrush, false, simulatePressure)
      displayContext.restore()
    }
  }
}

export function drawEraserPreview(
  displayContext: CanvasRenderingContext2D,
  points: InkPoint[],
) {
  if (points.length < 2) {
    return
  }

  displayContext.save()
  displayContext.strokeStyle = 'rgba(90, 98, 110, 0.72)'
  displayContext.lineWidth = 1.25
  displayContext.lineCap = 'round'
  displayContext.lineJoin = 'round'
  displayContext.setLineDash([4, 4])
  displayContext.beginPath()
  displayContext.moveTo(points[0].x, points[0].y)
  for (let index = 1; index < points.length; index += 1) {
    displayContext.lineTo(points[index].x, points[index].y)
  }
  displayContext.stroke()
  displayContext.restore()
}

export function cloneStoredStroke(stroke: StoredStroke): StoredStroke {
  return {
    id: stroke.id,
    color: stroke.color,
    brush: stroke.brush ?? 'pen',
    simulatePressure: stroke.simulatePressure,
    points: stroke.points.map((point) => ({ ...point })),
  }
}
