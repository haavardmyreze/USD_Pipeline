/**
 * What a project page is given, and what it may ask the app to do.
 *
 * Pages are plain render functions: they get the scanned project and this
 * context, and return nothing. Everything that reaches outside a page — going
 * to another page, drawing a layer's graph, touching the filesystem — goes
 * through here, so no page needs a reference to the app itself.
 */

import type { Project } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'

export type PageName =
  | 'overview'
  | 'workspace'
  | 'artists'
  | 'calendar'
  | 'workfiles'
  | 'graph'

export interface PageContext {
  project: Project
  /** Draw this layer's graph, and switch to the Graph page. */
  openLayer(path: string): void
  /** Show this file in the OS file manager. */
  reveal(path: string): void
  /** Put a path on the clipboard, with a toast either way. */
  copyPath(path: string): void
  /** Switch pages. The page reads whatever focus was set before the jump. */
  goTo(page: PageName): void
  /** Re-render the page in place, after its own state changed. */
  refresh(): void
}

// ---------------------------------------------------------------------------
// Per-page state
// ---------------------------------------------------------------------------

/**
 * Each page's UI state, kept for the life of the session so switching pages
 * and coming back lands you where you were. Cross-page links write here before
 * calling `goTo`, which is how "show me this artist's work" arrives on the
 * Artists page already filtered.
 */
export const pageState = {
  workspace: {
    tier: 'all' as NodeTier | 'all',
    /** The entity shown in full; the first in the list when null. */
    selected: null as string | null,
    query: '',
  },
  artists: {
    /** The person whose whole history is listed; everyone's latest when null. */
    artist: null as string | null,
  },
  calendar: {
    cursor: null as { year: number; month: number } | null,
    selectedDay: null as string | null,
  },
  workfiles: {
    /** The workfile shown in full, by its grouping key; the first when null. */
    selected: null as string | null,
    query: '',
  },
}

/** Reset everything a page remembers. Called when a new project is scanned. */
export function resetPageState(): void {
  pageState.workspace.tier = 'all'
  pageState.workspace.selected = null
  pageState.workspace.query = ''
  pageState.artists.artist = null
  pageState.calendar.cursor = null
  pageState.calendar.selectedDay = null
  pageState.workfiles.selected = null
  pageState.workfiles.query = ''
}
