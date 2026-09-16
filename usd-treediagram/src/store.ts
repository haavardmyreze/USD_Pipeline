/**
 * The diagram being edited, and the little the browser remembers.
 *
 * Diagrams are never stored: the page holds one, and it lasts until the tab
 * closes. A diagram is kept by exporting it — the PNG carries its outline
 * (see `png.ts`) — and brought back with Open or a drop. Only the look
 * settings are remembered, so a new diagram starts in the style last used.
 */

import { DEFAULT_OPTIONS, type Options } from './render'

export interface Diagram {
  name: string
  source: string
  options: Options
}

const LOOK = 'usd-treediagram:look'

/** Keys from when diagrams were kept in the browser; cleared on start. */
const RETIRED = ['usd-treediagram:diagrams', 'usd-treediagram:current']

export function loadLook(): Partial<Options> {
  try {
    for (const key of RETIRED) localStorage.removeItem(key)
    const value = JSON.parse(localStorage.getItem(LOOK) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}

/** Remember the style, without the heading, which belongs to one diagram. */
export function saveLook(options: Options): void {
  const { title: _title, ...look } = options
  try {
    localStorage.setItem(LOOK, JSON.stringify(look))
  } catch {
    // Not remembered; nothing depends on it.
  }
}

/** Fill in anything an imported or new diagram is missing. */
export function normalise(data: Partial<Diagram>, look: Partial<Options> = {}): Diagram {
  return {
    name: data.name?.trim() || 'Untitled',
    source: data.source ?? '',
    options: { ...DEFAULT_OPTIONS, ...look, ...(data.options ?? {}) },
  }
}
