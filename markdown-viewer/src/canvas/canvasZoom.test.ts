import { describe, expect, it } from 'vitest'
import {
  CANVAS_ZOOM_MAX,
  CANVAS_ZOOM_MIN,
  clampCanvasZoom,
  nextCanvasWheelZoom,
  scrubSignedDragDistance,
  scrubZoomMultiplier,
  stepCanvasZoom,
  wheelZoomMultiplier,
} from './canvasZoom'

describe('canvasZoom', () => {
  it('clamps to the canvas zoom range', () => {
    expect(clampCanvasZoom(0)).toBe(CANVAS_ZOOM_MIN)
    expect(clampCanvasZoom(999)).toBe(CANVAS_ZOOM_MAX)
    expect(clampCanvasZoom(1.5)).toBe(1.5)
  })

  it('steps zoom exponentially', () => {
    expect(stepCanvasZoom(1, 'in')).toBeCloseTo(1.2, 5)
    expect(stepCanvasZoom(1.2, 'out')).toBeCloseTo(1, 5)
  })

  it('applies exponential wheel and scrub multipliers', () => {
    expect(wheelZoomMultiplier(100)).toBeLessThan(1)
    expect(wheelZoomMultiplier(-100)).toBeGreaterThan(1)
    expect(scrubZoomMultiplier(180)).toBeCloseTo(2, 5)
    expect(scrubZoomMultiplier(-180)).toBeCloseTo(0.5, 5)
    expect(nextCanvasWheelZoom(1, -100)).toBeGreaterThan(1)
  })

  it('uses dominant-axis sign with omnidirectional scrub distance', () => {
    expect(scrubSignedDragDistance(180, 0)).toBe(180)
    expect(scrubSignedDragDistance(-180, 0)).toBe(-180)
    expect(scrubSignedDragDistance(127, 127)).toBeCloseTo(179.6, 1)
    expect(scrubSignedDragDistance(-127, 127)).toBeCloseTo(-179.6, 1)
    expect(scrubSignedDragDistance(0, -120)).toBe(-120)
  })
})
