import type { InkPoint } from './inkBrush'
import {
  INK_ERASER_HIT_RADIUS,
  INK_ERASER_HIT_RADIUS_MARKER,
  type InkBrushKind,
} from './inkConfig'

function eraserRadiusForBrush(brush: InkBrushKind) {
  return brush === 'marker' ? INK_ERASER_HIT_RADIUS_MARKER : INK_ERASER_HIT_RADIUS
}

function distToSegmentSquared(
  px: number,
  py: number,
  ax: number,
  ay: number,
  bx: number,
  by: number,
) {
  const abx = bx - ax
  const aby = by - ay
  const lengthSquared = abx * abx + aby * aby

  if (lengthSquared === 0) {
    const dx = px - ax
    const dy = py - ay
    return dx * dx + dy * dy
  }

  let t = ((px - ax) * abx + (py - ay) * aby) / lengthSquared
  t = Math.max(0, Math.min(1, t))
  const cx = ax + t * abx
  const cy = ay + t * aby
  const dx = px - cx
  const dy = py - cy
  return dx * dx + dy * dy
}

export function hitTestStrokePoints(
  points: InkPoint[],
  x: number,
  y: number,
  brush: InkBrushKind = 'pen',
  options?: {
    radiusScale?: number
  },
) {
  const radiusScale = options?.radiusScale ?? 1
  const radius = eraserRadiusForBrush(brush) * radiusScale
  const radiusSquared = radius * radius

  if (points.length === 0) {
    return false
  }

  if (points.length === 1) {
    const dx = x - points[0].x
    const dy = y - points[0].y
    return dx * dx + dy * dy <= radiusSquared
  }

  for (let index = 1; index < points.length; index += 1) {
    const previous = points[index - 1]
    const current = points[index]
    if (
      distToSegmentSquared(x, y, previous.x, previous.y, current.x, current.y) <= radiusSquared
    ) {
      return true
    }
  }

  return false
}
