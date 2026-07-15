// Per-document reading position, persisted locally so every document
// reopens where the reader left off.

export type ReadingPosition = {
  /** Heading id (markdown) or section/page id (pdf). */
  anchorId: string
  /** 0–1 scroll progress at save time. */
  progress: number
  updatedAt: number
}

const KEY_PREFIX = 'mdv-pos:'

export function saveReadingPosition(docKey: string, position: ReadingPosition) {
  try {
    localStorage.setItem(KEY_PREFIX + docKey, JSON.stringify(position))
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}

export function loadReadingPosition(docKey: string): ReadingPosition | null {
  try {
    const raw = localStorage.getItem(KEY_PREFIX + docKey)
    if (!raw) {
      return null
    }

    const parsed = JSON.parse(raw) as Partial<ReadingPosition>
    if (typeof parsed.anchorId !== 'string') {
      return null
    }

    return {
      anchorId: parsed.anchorId,
      progress:
        typeof parsed.progress === 'number'
          ? Math.min(1, Math.max(0, parsed.progress))
          : 0,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : 0,
    }
  } catch {
    return null
  }
}

export function currentScrollProgress(): number {
  const el = document.scrollingElement ?? document.documentElement
  const max = el.scrollHeight - window.innerHeight
  if (max <= 0) {
    return 0
  }
  return Math.min(1, Math.max(0, window.scrollY / max))
}
