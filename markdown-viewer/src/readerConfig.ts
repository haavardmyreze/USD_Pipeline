export type PageSize = 'A3' | 'A4' | 'A5'

export type DocumentViewMode = 'continuous' | 'paged' | 'cards'

export type ReaderPreferences = {
  viewMode: DocumentViewMode
  pageSize: PageSize
  pageZoom: number
}

export const PAGE_ZOOM_MIN = 0.5
export const PAGE_ZOOM_MAX = 2
export const PAGE_ZOOM_STEP = 0.05

const DEFAULT_PREFERENCES: ReaderPreferences = {
  viewMode: 'continuous',
  pageSize: 'A4',
  pageZoom: 1,
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

export function loadReaderPreferences(): ReaderPreferences {
  try {
    return {
      viewMode: parseViewMode(localStorage.getItem('mdv-view-mode')),
      pageSize: parsePageSize(localStorage.getItem('mdv-page-size')),
      pageZoom: parsePageZoom(localStorage.getItem('mdv-page-zoom')),
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
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}
