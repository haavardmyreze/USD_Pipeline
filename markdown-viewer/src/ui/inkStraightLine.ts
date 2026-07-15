import type { InkPoint } from './inkBrush'

export type StraightLineAxis = 'horizontal' | 'vertical'

/** Pick horizontal vs vertical from the larger movement component. */
export function pickStraightLineAxis(start: InkPoint, point: InkPoint): StraightLineAxis {
  const deltaX = Math.abs(point.x - start.x)
  const deltaY = Math.abs(point.y - start.y)
  return deltaX >= deltaY ? 'horizontal' : 'vertical'
}

/** Clamp a point onto a horizontal or vertical line through the start. */
export function clampToStraightLine(
  start: InkPoint,
  point: InkPoint,
  axis: StraightLineAxis,
): InkPoint {
  if (axis === 'horizontal') {
    return { ...point, y: start.y }
  }

  return { ...point, x: start.x }
}
