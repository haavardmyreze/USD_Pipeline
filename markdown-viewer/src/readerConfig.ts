export type PageSize = 'A3' | 'A4' | 'A5'

export type DocumentViewMode = 'continuous' | 'paged' | 'cards'

export type ReaderPreferences = {
  viewMode: DocumentViewMode
  pageSize: PageSize
  pageZoom: number
  /** Text size multiplier applied to the paper (0.85–1.3). */
  typeScale: number
  /** Line-height for body text; 0 = theme default. */
  typeLeading: number
}

export const TYPE_SCALE_MIN = 0.85
export const TYPE_SCALE_MAX = 1.3

export const TYPE_LEADING_OPTIONS: { label: string; value: number }[] = [
  { label: 'Tight', value: 1.45 },
  { label: 'Auto', value: 0 },
  { label: 'Relaxed', value: 1.65 },
  { label: 'Airy', value: 1.85 },
]

export function clampTypeScale(value: number) {
  return (
    Math.round(Math.min(TYPE_SCALE_MAX, Math.max(TYPE_SCALE_MIN, value)) * 100) /
    100
  )
}

// Google Docs toolbar zoom presets: 50–90% below 100%, then +25% above 100%.
export const PAGE_ZOOM_LEVELS = [0.5, 0.75, 0.9, 1, 1.25, 1.5, 1.75, 2] as const

export const PAGE_ZOOM_MIN = PAGE_ZOOM_LEVELS[0]
export const PAGE_ZOOM_MAX = 3
const ZOOM_MATCH_TOLERANCE = 0.005

export function isEditableKeyboardTarget(target: EventTarget | null) {
  if (!(target instanceof HTMLElement)) {
    return false
  }

  const tagName = target.tagName
  return (
    target.isContentEditable ||
    tagName === 'INPUT' ||
    tagName === 'TEXTAREA' ||
    tagName === 'SELECT'
  )
}

export function getPageZoomLevels(max = PAGE_ZOOM_MAX): number[] {
  const levels: number[] = [...PAGE_ZOOM_LEVELS]

  for (let zoom = 2.25; zoom <= max + 0.001; zoom += 0.25) {
    levels.push(Math.round(zoom * 100) / 100)
  }

  return levels
}

export function stepPageZoom(current: number, direction: 'in' | 'out', max = PAGE_ZOOM_MAX) {
  const levels = getPageZoomLevels(max)

  if (direction === 'in') {
    for (const level of levels) {
      if (level > current + ZOOM_MATCH_TOLERANCE) {
        return level
      }
    }

    return levels[levels.length - 1]
  }

  for (let index = levels.length - 1; index >= 0; index -= 1) {
    const level = levels[index]
    if (level < current - ZOOM_MATCH_TOLERANCE) {
      return level
    }
  }

  return levels[0]
}

export function zoomDirectionFromWheel(deltaY: number) {
  return deltaY > 0 ? 'out' : 'in'
}

export function isZoomWheelEvent(event: { ctrlKey: boolean; metaKey: boolean }) {
  return event.ctrlKey || event.metaKey
}

export function attachDocumentZoomWheel(
  root: HTMLElement,
  onZoom: (direction: 'in' | 'out', event: WheelEvent) => void,
  options?: {
    /** Return false to ignore the event without blocking other handlers. */
    shouldHandle?: (event: WheelEvent) => boolean
  },
) {
  const onWheel = (event: WheelEvent) => {
    if (!isZoomWheelEvent(event) || isEditableKeyboardTarget(event.target)) {
      return
    }

    if (options?.shouldHandle && !options.shouldHandle(event)) {
      return
    }

    event.preventDefault()
    event.stopPropagation()
    onZoom(zoomDirectionFromWheel(event.deltaY), event)
  }

  root.addEventListener('wheel', onWheel, { passive: false, capture: true })
  return () => root.removeEventListener('wheel', onWheel, { capture: true })
}

export function applyZoomKeyboardShortcut(
  event: KeyboardEvent,
  onStepZoom: (direction: 'in' | 'out') => void,
) {
  if (!(event.ctrlKey || event.metaKey) || event.altKey || isEditableKeyboardTarget(event.target)) {
    return false
  }

  const zoomIn =
    event.key === '+' ||
    event.key === '=' ||
    event.code === 'NumpadAdd'
  const zoomOut = event.key === '-' || event.key === '_' || event.code === 'NumpadSubtract'

  if (zoomIn) {
    event.preventDefault()
    onStepZoom('in')
    return true
  }

  if (zoomOut) {
    event.preventDefault()
    onStepZoom('out')
    return true
  }

  return false
}

const DEFAULT_PREFERENCES: ReaderPreferences = {
  viewMode: 'continuous',
  pageSize: 'A4',
  pageZoom: 1,
  typeScale: 1,
  typeLeading: 0,
}

const PAGE_SIZES: PageSize[] = ['A3', 'A4', 'A5']
const VIEW_MODES: DocumentViewMode[] = ['continuous', 'paged', 'cards']

export function clampPageZoom(value: number) {
  return (
    Math.round(Math.min(PAGE_ZOOM_MAX, Math.max(PAGE_ZOOM_MIN, value)) * 100) / 100
  )
}

function parseViewMode(value: string | null): DocumentViewMode {
  return VIEW_MODES.includes(value as DocumentViewMode)
    ? (value as DocumentViewMode)
    : DEFAULT_PREFERENCES.viewMode
}

function parsePageSize(value: string | null): PageSize {
  return PAGE_SIZES.includes(value as PageSize)
    ? (value as PageSize)
    : DEFAULT_PREFERENCES.pageSize
}

function parsePageZoom(value: string | null): number {
  if (!value) {
    return DEFAULT_PREFERENCES.pageZoom
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed)) {
    return DEFAULT_PREFERENCES.pageZoom
  }

  return clampPageZoom(parsed)
}

function parseTypeScale(value: string | null): number {
  if (!value) {
    return DEFAULT_PREFERENCES.typeScale
  }

  const parsed = Number(value)
  return Number.isFinite(parsed)
    ? clampTypeScale(parsed)
    : DEFAULT_PREFERENCES.typeScale
}

function parseTypeLeading(value: string | null): number {
  if (!value) {
    return DEFAULT_PREFERENCES.typeLeading
  }

  const parsed = Number(value)
  if (!Number.isFinite(parsed) || parsed <= 0) {
    return 0
  }

  return Math.min(2.2, Math.max(1.2, parsed))
}

export function loadReaderPreferences(): ReaderPreferences {
  try {
    return {
      viewMode: parseViewMode(localStorage.getItem('mdv-view-mode')),
      pageSize: parsePageSize(localStorage.getItem('mdv-page-size')),
      pageZoom: parsePageZoom(localStorage.getItem('mdv-page-zoom')),
      typeScale: parseTypeScale(localStorage.getItem('mdv-type-scale')),
      typeLeading: parseTypeLeading(localStorage.getItem('mdv-type-leading')),
    }
  } catch {
    return { ...DEFAULT_PREFERENCES }
  }
}

export function saveReaderPreferences(preferences: ReaderPreferences) {
  try {
    localStorage.setItem('mdv-view-mode', preferences.viewMode)
    localStorage.setItem('mdv-page-size', preferences.pageSize)
    localStorage.setItem('mdv-page-zoom', String(clampPageZoom(preferences.pageZoom)))
    localStorage.setItem('mdv-type-scale', String(clampTypeScale(preferences.typeScale)))
    localStorage.setItem('mdv-type-leading', String(preferences.typeLeading))
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}
