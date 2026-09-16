/**
 * Diagrams kept in this browser's local storage.
 *
 * Nothing leaves the machine; a diagram meant to last goes into a PNG, which
 * carries its own source (see `png.ts`).
 */

import { DEFAULT_OPTIONS, type Options } from './render'

export interface Diagram {
  id: string
  name: string
  source: string
  options: Options
  updated: number
}

const KEY = 'usd-treediagram:diagrams'
const CURRENT = 'usd-treediagram:current'

export function loadDiagrams(): Diagram[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]') as Partial<Diagram>[]
    return raw.filter((d) => d.id && typeof d.source === 'string').map(normalise)
  } catch {
    return []
  }
}

export function saveDiagrams(diagrams: Diagram[]): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(diagrams))
  } catch {
    // Storage full or blocked: the session keeps working, it just won't persist.
  }
}

export function loadCurrent(): string | null {
  try {
    return localStorage.getItem(CURRENT)
  } catch {
    return null
  }
}

export function saveCurrent(id: string): void {
  try {
    localStorage.setItem(CURRENT, id)
  } catch {
    // As above.
  }
}

/** Fill in anything an older or imported diagram is missing. */
export function normalise(data: Partial<Diagram>): Diagram {
  return {
    id: data.id ?? newId(),
    name: data.name?.trim() || 'Untitled',
    source: data.source ?? '',
    options: { ...DEFAULT_OPTIONS, ...(data.options ?? {}) },
    updated: data.updated ?? Date.now(),
  }
}

export function newId(): string {
  return Math.random().toString(36).slice(2, 10)
}
