import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditableKeyboardTarget } from '../readerConfig'
import type { InkPoint } from './inkBrush'
import { DEFAULT_INK_COLOR, INK_COLOR_OPTIONS, type InkBrushKind } from './inkConfig'
import { clearInkDocumentState, getInkDocumentState } from './inkDocumentStore'
import { pushInkHistory, undoInkHistory } from './inkHistory'
import { hitTestStrokePoints } from './inkHitTest'
import type { InkViewport } from './inkAnchors'
import { clampToStraightLine, pickStraightLineAxis, type StraightLineAxis } from './inkStraightLine'
import type { InkBinding } from './useReaderInk'
import {
  compositeInkLayers,
  createInkLayer,
  createStrokeId,
  drawEraserPreview,
  layerIsVisible,
  redrawInkLayer,
  resizeInkLayer,
  viewportToStoragePoint,
  type InkLayer,
  type StoredStroke,
  viewportCanvasSize,
} from './inkLayer'
import { DrawToolbar, type DrawTool } from './DrawToolbar'

type InkAnnotationProps = {
  docKey: string
  drawMode: boolean
  laserMode?: boolean
} & InkBinding

function pointFromEvent(event: PointerEvent, canvas: HTMLCanvasElement): InkPoint {
  const rect = canvas.getBoundingClientRect()
  const point: InkPoint = {
    x: event.clientX - rect.left,
    y: event.clientY - rect.top,
  }

  if (event.pointerType === 'pen') {
    point.pressure = event.pressure
  }

  return point
}

function toLayerPoint(
  viewportPoint: InkPoint,
  layer: InkLayer,
  viewport: InkViewport,
  contentZoom: number,
): InkPoint {
  return viewportToStoragePoint(viewportPoint, layer, viewport, contentZoom)
}

function toolToBrush(tool: DrawTool): InkBrushKind {
  return tool === 'marker' ? 'marker' : 'pen'
}

export function InkAnnotation({
  docKey,
  drawMode,
  laserMode = false,
  contentZoom,
  useSheetCoordinates = false,
  strokeUnitScale = 1,
  navigation,
  getLayerKey,
  getInkViewport,
  viewportVersion,
}: InkAnnotationProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const displayContextRef = useRef<CanvasRenderingContext2D | null>(null)
  const activeLayerRef = useRef<InkLayer | null>(null)
  const currentStrokeRef = useRef<InkPoint[]>([])
  const lineStartRef = useRef<InkPoint | null>(null)
  const lineAxisRef = useRef<StraightLineAxis | null>(null)
  const eraserPathRef = useRef<InkPoint[]>([])
  const erasedStrokeIdsRef = useRef(new Set<string>())
  const simulatePressureRef = useRef(true)
  const isDrawingRef = useRef(false)
  const isErasingRef = useRef(false)
  const temporaryEraserRef = useRef(false)
  const panSessionRef = useRef<{ x: number; y: number; pointerId: number } | null>(null)
  const getLayerKeyRef = useRef(getLayerKey)
  const getInkViewportRef = useRef(getInkViewport)
  const repaintFrameRef = useRef<number | null>(null)
  const docKeyRef = useRef(docKey)
  const contentZoomRef = useRef(contentZoom)
  const strokeUnitScaleRef = useRef(strokeUnitScale)
  const useSheetCoordinatesRef = useRef(useSheetCoordinates)
  const navigationRef = useRef(navigation)
  const drawModeRef = useRef(drawMode)
  const laserModeRef = useRef(laserMode)
  const visibleRef = useRef(drawMode || laserMode)
  const toolRef = useRef<DrawTool>('pen')
  const brushRef = useRef<InkBrushKind>('pen')
  const colorRef = useRef(DEFAULT_INK_COLOR)

  const [tool, setTool] = useState<DrawTool>('pen')
  const [color, setColor] = useState(DEFAULT_INK_COLOR)

  getLayerKeyRef.current = getLayerKey
  getInkViewportRef.current = getInkViewport
  docKeyRef.current = docKey
  contentZoomRef.current = contentZoom
  strokeUnitScaleRef.current = strokeUnitScale
  useSheetCoordinatesRef.current = useSheetCoordinates
  navigationRef.current = navigation
  drawModeRef.current = drawMode
  laserModeRef.current = laserMode
  visibleRef.current = drawMode || laserMode
  toolRef.current = tool
  brushRef.current = toolToBrush(tool)
  colorRef.current = color

  const documentState = () => getInkDocumentState(docKeyRef.current)

  const syncCanvasCursor = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const showEraserCursor =
      toolRef.current === 'eraser' || temporaryEraserRef.current || isErasingRef.current
    canvas.classList.toggle('ink-overlay-eraser', showEraserCursor)
  }, [])

  const paintDisplay = useCallback(() => {
    const canvas = canvasRef.current
    const context = displayContextRef.current
    if (!canvas || !context || !visibleRef.current) {
      return
    }

    const { layers } = documentState()
    const size = viewportCanvasSize()
    const viewport = getInkViewportRef.current()
    compositeInkLayers(
      context,
      canvas,
      layers,
      viewport,
      size,
      isDrawingRef.current ? activeLayerRef.current : null,
      currentStrokeRef.current,
      colorRef.current,
      brushRef.current,
      simulatePressureRef.current,
      contentZoomRef.current,
      strokeUnitScaleRef.current,
    )

    if (isErasingRef.current && eraserPathRef.current.length >= 2) {
      drawEraserPreview(context, eraserPathRef.current)
    }
  }, [])

  const resizeDisplayCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const size = viewportCanvasSize()
    const pixelWidth = Math.max(1, Math.floor(size.cssWidth * size.devicePixelRatio))
    const pixelHeight = Math.max(1, Math.floor(size.cssHeight * size.devicePixelRatio))

    canvas.width = pixelWidth
    canvas.height = pixelHeight
    canvas.style.width = `${size.cssWidth}px`
    canvas.style.height = `${size.cssHeight}px`

    const context = canvas.getContext('2d', {
      alpha: true,
      desynchronized: true,
    })

    if (!context) {
      return
    }

    displayContextRef.current = context

    for (const layer of documentState().layers) {
      resizeInkLayer(layer, size)
    }

    paintDisplay()
  }, [paintDisplay])

  const scheduleRepaint = useCallback(() => {
    if (repaintFrameRef.current !== null) {
      return
    }

    repaintFrameRef.current = window.requestAnimationFrame(() => {
      repaintFrameRef.current = null
      paintDisplay()
    })
  }, [paintDisplay])

  const findOrCreateLayer = useCallback(() => {
    const { layers } = documentState()
    const key = getLayerKeyRef.current()
    const viewport = getInkViewportRef.current()
    const size = viewportCanvasSize()
    const zoom = contentZoomRef.current
    const useSheet = useSheetCoordinatesRef.current

    if (useSheet) {
      const sheetAnchorX = viewport.anchorX / zoom
      const sheetAnchorY = viewport.anchorY / zoom
      const threshold = 48 / zoom
      const existing = layers.find(
        (layer) =>
          layer.key === key &&
          layer.coordinateSpace === 'sheet' &&
          Math.abs(layer.anchorX - sheetAnchorX) < threshold &&
          Math.abs(layer.anchorY - sheetAnchorY) < threshold,
      )

      if (existing) {
        return existing
      }

      const layer = createInkLayer(key, sheetAnchorX, sheetAnchorY, 'sheet', size)
      layers.push(layer)
      return layer
    }

    const existing = layers.find(
      (layer) =>
        layer.key === key &&
        layer.coordinateSpace === 'viewport' &&
        Math.abs(layer.anchorX - viewport.anchorX) < 48 &&
        Math.abs(layer.anchorY - viewport.anchorY) < 48,
    )

    if (existing) {
      return existing
    }

    const layer = createInkLayer(
      key,
      viewport.anchorX,
      viewport.anchorY,
      'viewport',
      size,
    )
    layers.push(layer)
    return layer
  }, [])

  const appendPoint = (stroke: InkPoint[], point: InkPoint) => {
    const lastPoint = stroke[stroke.length - 1]
    if (lastPoint) {
      const deltaX = point.x - lastPoint.x
      const deltaY = point.y - lastPoint.y
      if (deltaX * deltaX + deltaY * deltaY < 0.2) {
        return
      }
    }

    stroke.push(point)
  }

  const eraseStrokeAt = (viewportPoint: InkPoint, skipIds: Set<string>) => {
    const { layers, history } = documentState()
    const viewport = getInkViewportRef.current()
    const size = viewportCanvasSize()
    let removedAny = false

    for (let layerIndex = layers.length - 1; layerIndex >= 0; layerIndex -= 1) {
      const layer = layers[layerIndex]
      if (!layerIsVisible(layer, viewport, size.cssWidth, size.cssHeight, contentZoomRef.current)) {
        continue
      }

      const layerPoint = toLayerPoint(viewportPoint, layer, viewport, contentZoomRef.current)

      for (let strokeIndex = layer.strokes.length - 1; strokeIndex >= 0; strokeIndex -= 1) {
        const stroke = layer.strokes[strokeIndex]
        if (skipIds.has(stroke.id)) {
          continue
        }

        if (!hitTestStrokePoints(stroke.points, layerPoint.x, layerPoint.y, stroke.brush ?? 'pen', {
          radiusScale: strokeUnitScaleRef.current / contentZoomRef.current,
        })) {
          continue
        }

        const removed = layer.strokes.splice(strokeIndex, 1)[0]
        if (removed) {
          skipIds.add(removed.id)
          pushInkHistory(history, layer, removed, strokeIndex)
          removedAny = true
        }
      }
    }

    if (removedAny) {
      for (const layer of layers) {
        redrawInkLayer(layer, size)
      }
    }

    return removedAny
  }

  const eraseAlongPoints = (points: InkPoint[]) => {
    const skipIds = erasedStrokeIdsRef.current
    for (const point of points) {
      eraseStrokeAt(point, skipIds)
    }
  }

  const resetErasing = useCallback(() => {
    isErasingRef.current = false
    temporaryEraserRef.current = false
    eraserPathRef.current = []
    erasedStrokeIdsRef.current = new Set()
    syncCanvasCursor()
  }, [syncCanvasCursor])

  const undoLastStroke = useCallback(() => {
    const { history } = documentState()
    if (!undoInkHistory(history)) {
      return
    }

    paintDisplay()
  }, [paintDisplay])

  const clearAllInk = useCallback(() => {
    clearInkDocumentState(docKeyRef.current)
    eraserPathRef.current = []
    currentStrokeRef.current = []
    lineStartRef.current = null
    lineAxisRef.current = null
    activeLayerRef.current = null
    isDrawingRef.current = false
    resetErasing()
    paintDisplay()
  }, [paintDisplay, resetErasing])

  useEffect(() => {
    syncCanvasCursor()
  }, [tool, syncCanvasCursor])

  useEffect(() => {
    const visible = drawMode || laserMode
    if (!visible) {
      isDrawingRef.current = false
      resetErasing()
      currentStrokeRef.current = []
      lineStartRef.current = null
      lineAxisRef.current = null
      activeLayerRef.current = null
      return
    }

    resizeDisplayCanvas()
  }, [drawMode, laserMode, docKey, resizeDisplayCanvas, resetErasing])

  useEffect(() => {
    if (!drawMode && !laserMode) {
      return
    }

    const onScroll = () => {
      scheduleRepaint()
    }

    window.addEventListener('scroll', onScroll, { passive: true })
    return () => window.removeEventListener('scroll', onScroll)
  }, [drawMode, laserMode, scheduleRepaint])

  useEffect(() => {
    if ((!drawMode && !laserMode) || viewportVersion === undefined) {
      return
    }

    scheduleRepaint()
  }, [drawMode, laserMode, viewportVersion, scheduleRepaint])

  useEffect(() => {
    if (!drawMode && !laserMode) {
      return
    }

    const onResize = () => {
      if (!isDrawingRef.current && !isErasingRef.current) {
        resizeDisplayCanvas()
      }
    }

    window.addEventListener('resize', onResize)
    return () => window.removeEventListener('resize', onResize)
  }, [drawMode, laserMode, resizeDisplayCanvas])

  useEffect(() => {
    if (!drawMode) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      if (event.ctrlKey || event.metaKey) {
        if (event.key.toLowerCase() === 'z' && !event.shiftKey) {
          event.preventDefault()
          undoLastStroke()
        }
        return
      }

      if (event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'x') {
        event.preventDefault()
        clearAllInk()
        return
      }

      if (key === 'b') {
        event.preventDefault()
        setTool((current) => {
          if (current === 'eraser') {
            return 'pen'
          }
          return current === 'marker' ? 'pen' : 'marker'
        })
        return
      }

      if (key === 'c') {
        event.preventDefault()
        setTool((current) => (current === 'eraser' ? 'pen' : current))
        setColor((current) => {
          const index = INK_COLOR_OPTIONS.findIndex((option) => option.value === current)
          const nextIndex = index >= 0 ? (index + 1) % INK_COLOR_OPTIONS.length : 0
          return INK_COLOR_OPTIONS[nextIndex]?.value ?? DEFAULT_INK_COLOR
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [clearAllInk, drawMode, undoLastStroke])

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas || !drawMode) {
      return
    }

    const endPanSession = () => {
      panSessionRef.current = null
      canvas.classList.remove('ink-overlay-panning')
    }

    const onWheel = (event: WheelEvent) => {
      if (!navigationRef.current) {
        return
      }

      navigationRef.current.handleWheel(event)
      scheduleRepaint()
    }

    const beginErasing = (viewportPoint: InkPoint, pointerId: number) => {
      isDrawingRef.current = false
      currentStrokeRef.current = []
      lineStartRef.current = null
      lineAxisRef.current = null
      activeLayerRef.current = null
      isErasingRef.current = true
      erasedStrokeIdsRef.current = new Set()
      eraserPathRef.current = [viewportPoint]
      canvas.setPointerCapture(pointerId)
      syncCanvasCursor()
      eraseStrokeAt(viewportPoint, erasedStrokeIdsRef.current)
      paintDisplay()
    }

    const endErasing = (event: PointerEvent) => {
      if (typeof event.getCoalescedEvents === 'function') {
        const points = event.getCoalescedEvents().map((coalescedEvent) =>
          pointFromEvent(coalescedEvent, canvas),
        )
        for (const point of points) {
          appendPoint(eraserPathRef.current, point)
        }
        eraseAlongPoints(points)
      }

      resetErasing()
      paintDisplay()
    }

    const appendDrawPoints = (events: PointerEvent[], shiftKey: boolean) => {
      const layer = activeLayerRef.current
      const start = lineStartRef.current
      if (!layer || !start) {
        return
      }

      const viewport = getInkViewportRef.current()

      if (!shiftKey) {
        lineAxisRef.current = null
      }

      for (const coalescedEvent of events) {
        const rawPoint = toLayerPoint(
          pointFromEvent(coalescedEvent, canvas),
          layer,
          viewport,
          contentZoomRef.current,
        )

        if (shiftKey) {
          if (!lineAxisRef.current) {
            lineAxisRef.current = pickStraightLineAxis(start, rawPoint)
          }

          appendPoint(
            currentStrokeRef.current,
            clampToStraightLine(start, rawPoint, lineAxisRef.current),
          )
          continue
        }

        appendPoint(currentStrokeRef.current, rawPoint)
      }
    }

    const onContextMenu = (event: MouseEvent) => {
      event.preventDefault()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (
        document.body.classList.contains('canvas-zoom-scrub-ready') ||
        document.body.classList.contains('canvas-zoom-scrub-dragging')
      ) {
        return
      }

      if (event.button === 1 && navigationRef.current) {
        event.preventDefault()
        panSessionRef.current = {
          x: event.clientX,
          y: event.clientY,
          pointerId: event.pointerId,
        }
        canvas.setPointerCapture(event.pointerId)
        canvas.classList.add('ink-overlay-panning')
        return
      }

      if (event.button === 2) {
        event.preventDefault()
        temporaryEraserRef.current = true
        beginErasing(pointFromEvent(event, canvas), event.pointerId)
        return
      }

      if (event.button !== 0) {
        return
      }

      event.preventDefault()
      const viewportPoint = pointFromEvent(event, canvas)

      if (toolRef.current === 'eraser') {
        beginErasing(viewportPoint, event.pointerId)
        return
      }

      resetErasing()
      isDrawingRef.current = true
      simulatePressureRef.current = event.pointerType !== 'pen'
      canvas.setPointerCapture(event.pointerId)
      const layer = findOrCreateLayer()
      activeLayerRef.current = layer
      const viewport = getInkViewportRef.current()
      const layerPoint = toLayerPoint(viewportPoint, layer, viewport, contentZoomRef.current)
      lineStartRef.current = { ...layerPoint }
      lineAxisRef.current = null
      currentStrokeRef.current = [{ ...layerPoint }]
      paintDisplay()
    }

    const onPointerMove = (event: PointerEvent) => {
      const panSession = panSessionRef.current
      if (panSession && panSession.pointerId === event.pointerId) {
        event.preventDefault()
        const deltaX = event.clientX - panSession.x
        const deltaY = event.clientY - panSession.y
        panSession.x = event.clientX
        panSession.y = event.clientY
        navigationRef.current?.panBy(deltaX, deltaY)
        scheduleRepaint()
        return
      }

      if (!canvas.hasPointerCapture(event.pointerId)) {
        return
      }

      event.preventDefault()

      const events =
        typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents()
          : [event]

      if (isErasingRef.current) {
        const points = events.map((coalescedEvent) => pointFromEvent(coalescedEvent, canvas))
        for (const point of points) {
          appendPoint(eraserPathRef.current, point)
        }
        eraseAlongPoints(points)
        scheduleRepaint()
        return
      }

      if (!isDrawingRef.current) {
        return
      }

      appendDrawPoints(events, event.shiftKey)
      scheduleRepaint()
    }

    const finishPointer = (event: PointerEvent) => {
      const panSession = panSessionRef.current
      if (panSession && panSession.pointerId === event.pointerId) {
        if (canvas.hasPointerCapture(event.pointerId)) {
          canvas.releasePointerCapture(event.pointerId)
        }
        endPanSession()
        return
      }

      const hasCapture = canvas.hasPointerCapture(event.pointerId)

      if (hasCapture) {
        canvas.releasePointerCapture(event.pointerId)
      }

      if (isErasingRef.current) {
        endErasing(event)
        return
      }

      if (!isDrawingRef.current) {
        return
      }

      if (hasCapture) {
        const events =
          typeof event.getCoalescedEvents === 'function'
            ? event.getCoalescedEvents()
            : [event]
        appendDrawPoints(events, event.shiftKey)
      }

      const layer = activeLayerRef.current
      const points = currentStrokeRef.current
      const { history } = documentState()

      if (layer && points.length >= 1) {
        const stored: StoredStroke = {
          id: createStrokeId(),
          color: colorRef.current,
          brush: brushRef.current,
          points: points.map((point) => ({ ...point })),
          simulatePressure: simulatePressureRef.current,
        }
        layer.strokes.push(stored)
        redrawInkLayer(layer, viewportCanvasSize())
        pushInkHistory(history, layer, stored, layer.strokes.length - 1)
      }

      currentStrokeRef.current = []
      lineStartRef.current = null
      lineAxisRef.current = null
      activeLayerRef.current = null
      isDrawingRef.current = false
      paintDisplay()
    }

    const onLostPointerCapture = () => {
      if (panSessionRef.current) {
        endPanSession()
      }

      if (isErasingRef.current) {
        resetErasing()
        paintDisplay()
      }
    }

    canvas.addEventListener('contextmenu', onContextMenu)
    canvas.addEventListener('wheel', onWheel, { passive: false, capture: true })
    canvas.addEventListener('pointerdown', onPointerDown)
    canvas.addEventListener('pointermove', onPointerMove)
    canvas.addEventListener('pointerup', finishPointer)
    canvas.addEventListener('pointercancel', finishPointer)
    canvas.addEventListener('lostpointercapture', onLostPointerCapture)

    return () => {
      canvas.removeEventListener('contextmenu', onContextMenu)
      canvas.removeEventListener('wheel', onWheel, { capture: true })
      canvas.removeEventListener('pointerdown', onPointerDown)
      canvas.removeEventListener('pointermove', onPointerMove)
      canvas.removeEventListener('pointerup', finishPointer)
      canvas.removeEventListener('pointercancel', finishPointer)
      canvas.removeEventListener('lostpointercapture', onLostPointerCapture)
    }
  }, [drawMode, findOrCreateLayer, paintDisplay, resetErasing, scheduleRepaint, syncCanvasCursor])

  if (!drawMode && !laserMode) {
    return null
  }

  return (
    <>
      {drawMode ? (
        <DrawToolbar
          color={color}
          tool={tool}
          onColorChange={setColor}
          onToolChange={setTool}
          onClearAll={clearAllInk}
        />
      ) : null}
      <canvas
        ref={canvasRef}
        className={
          drawMode
            ? 'ink-overlay-canvas ink-overlay-interactive'
            : 'ink-overlay-canvas ink-overlay-passive'
        }
        aria-hidden={drawMode ? false : true}
      />
    </>
  )
}

/** @deprecated Use InkAnnotation */
export const EphemeralInkOverlay = InkAnnotation
