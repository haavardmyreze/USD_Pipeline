/** Pan/zoom canvas limits for image (and similar) viewers. */
export const CANVAS_ZOOM_MIN = 0.02
export const CANVAS_ZOOM_MAX = 64

/** ~20% change per toolbar step. */
export const CANVAS_ZOOM_STEP_FACTOR = 1.2

/** Drag this many pixels from the scrub anchor to double zoom. */
export const CANVAS_SCRUB_PIXELS_PER_OCTAVE = 180

export function clampCanvasZoom(value: number) {
  if (!Number.isFinite(value)) {
    return 1
  }

  return Math.min(CANVAS_ZOOM_MAX, Math.max(CANVAS_ZOOM_MIN, value))
}

export function stepCanvasZoom(current: number, direction: 'in' | 'out') {
  const factor = direction === 'in' ? CANVAS_ZOOM_STEP_FACTOR : 1 / CANVAS_ZOOM_STEP_FACTOR
  return clampCanvasZoom(current * factor)
}

/** Exponential wheel zoom multiplier (deltaY > 0 zooms out). */
export function wheelZoomMultiplier(deltaY: number) {
  return Math.exp(-deltaY * 0.001)
}

/** Exponential scrub multiplier from signed radial drag (positive = zoom in). */
export function scrubZoomMultiplier(signedDistance: number) {
  return Math.pow(2, signedDistance / CANVAS_SCRUB_PIXELS_PER_OCTAVE)
}

/** Sign from dominant drag axis; magnitude from total distance for consistent speed. */
export function scrubSignedDragDistance(deltaX: number, deltaY: number) {
  const distance = Math.hypot(deltaX, deltaY)
  if (distance < 0.5) {
    return 0
  }

  const sign =
    Math.abs(deltaX) >= Math.abs(deltaY) ? Math.sign(deltaX) || 1 : Math.sign(deltaY) || 1
  return sign * distance
}

export function nextCanvasWheelZoom(current: number, deltaY: number) {
  return clampCanvasZoom(current * wheelZoomMultiplier(deltaY))
}

export function formatCanvasZoomPercent(zoom: number) {
  const percent = Math.round(zoom * 100)
  if (percent >= 1000) {
    return `${Math.round(percent / 10) * 10}%`
  }

  return `${percent}%`
}
