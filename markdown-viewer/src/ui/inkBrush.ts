import { getStroke } from 'perfect-freehand'
import { DEFAULT_INK_COLOR, type InkBrushKind } from './inkConfig'

export type InkPoint = {
  x: number
  y: number
  pressure?: number
}

type BrushFreehandOptions = {
  size: number
  thinning: number
  smoothing: number
  streamline: number
  easing: (pressure: number) => number
  simulatePressure: boolean
  start: {
    cap: boolean
    taper: number
    easing: (distance: number) => number
  }
  end: {
    cap: boolean
    taper: number
    easing: (distance: number) => number
  }
}

export type InkBrushStyle = {
  opacity: number
  options: BrushFreehandOptions
}

const sharedEasing = (pressure: number) => pressure * (2 - pressure)

/** Tapered pen with velocity-based thickness and rounded caps. */
const PEN_OPTIONS: BrushFreehandOptions = {
  size: 5.5,
  thinning: 0.65,
  smoothing: 0.58,
  streamline: 0.42,
  easing: sharedEasing,
  simulatePressure: true,
  start: {
    cap: true,
    taper: 0,
    easing: (distance: number) => distance,
  },
  end: {
    cap: true,
    taper: 0,
    easing: (distance: number) => distance,
  },
}

/** Wide translucent highlighter-style marker. */
const MARKER_OPTIONS: BrushFreehandOptions = {
  size: 15,
  thinning: 0.35,
  smoothing: 0.72,
  streamline: 0.52,
  easing: sharedEasing,
  simulatePressure: true,
  start: {
    cap: true,
    taper: 0,
    easing: (distance: number) => distance,
  },
  end: {
    cap: true,
    taper: 0,
    easing: (distance: number) => distance,
  },
}

export const INK_BRUSH_STYLES: Record<InkBrushKind, InkBrushStyle> = {
  pen: {
    opacity: 1,
    options: PEN_OPTIONS,
  },
  marker: {
    opacity: 0.38,
    options: MARKER_OPTIONS,
  },
}

function strokeHasRealPressure(points: InkPoint[]) {
  return points.some(
    (point) => point.pressure !== undefined && point.pressure > 0 && point.pressure !== 0.5,
  )
}

export function strokeOutline(
  points: InkPoint[],
  brush: InkBrushKind,
  isComplete: boolean,
  simulatePressure: boolean,
  sizeScale = 1,
) {
  if (points.length === 0) {
    return null
  }

  const { options } = INK_BRUSH_STYLES[brush]
  const scaledOptions = {
    ...options,
    size: options.size * sizeScale,
  }

  if (points.length === 1) {
    const [point] = points
    return getStroke([{ x: point.x, y: point.y, pressure: point.pressure ?? 0.45 }], {
      ...scaledOptions,
      size: scaledOptions.size * 0.82,
      simulatePressure,
      last: isComplete,
    })
  }

  return getStroke(
    points.map((point) => ({
      x: point.x,
      y: point.y,
      pressure: point.pressure,
    })),
    {
      ...scaledOptions,
      simulatePressure: simulatePressure && !strokeHasRealPressure(points),
      last: isComplete,
    },
  )
}

export function fillStrokeOutline(
  context: CanvasRenderingContext2D,
  outline: number[][],
  color: string,
  opacity: number,
) {
  if (outline.length < 2) {
    return
  }

  context.beginPath()
  context.moveTo(outline[0][0], outline[0][1])
  for (let index = 1; index < outline.length; index += 1) {
    context.lineTo(outline[index][0], outline[index][1])
  }
  context.closePath()

  context.fillStyle = color
  context.globalAlpha = opacity * 0.94
  context.fill()

  context.globalAlpha = 1
}

export function drawInkStroke(
  context: CanvasRenderingContext2D,
  points: InkPoint[],
  color: string,
  brush: InkBrushKind,
  isComplete: boolean,
  simulatePressure: boolean,
  sizeScale = 1,
) {
  const { opacity } = INK_BRUSH_STYLES[brush]
  const outline = strokeOutline(points, brush, isComplete, simulatePressure, sizeScale)
  if (!outline) {
    return
  }

  fillStrokeOutline(context, outline, color, opacity)
}

export function defaultInkStrokeColor() {
  return DEFAULT_INK_COLOR
}
