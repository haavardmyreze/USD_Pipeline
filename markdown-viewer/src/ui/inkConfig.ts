/** Cap backing-store scale — ink is lines, not photo fidelity. */
export const INK_MAX_DEVICE_PIXEL_RATIO = 1

export type InkColorOption = {
  id: string
  label: string
  value: string
}

export const INK_COLOR_OPTIONS: InkColorOption[] = [
  { id: 'red', label: 'Red', value: '#e84846' },
  { id: 'blue', label: 'Blue', value: '#3b82f6' },
  { id: 'green', label: 'Green', value: '#22a06b' },
  { id: 'amber', label: 'Amber', value: '#d97706' },
  { id: 'violet', label: 'Violet', value: '#8b5cf6' },
  { id: 'black', label: 'Black', value: '#1f2937' },
]

export const DEFAULT_INK_COLOR = INK_COLOR_OPTIONS[0].value

export type InkBrushKind = 'pen' | 'marker'

/** Hit radius for whole-stroke eraser (CSS px). */
export const INK_ERASER_HIT_RADIUS = 12

/** Wider strokes need a larger eraser hit target. */
export const INK_ERASER_HIT_RADIUS_MARKER = 18

/** Thin preview line while dragging the eraser. */
export const INK_ERASER_PREVIEW_WIDTH = 1.25
