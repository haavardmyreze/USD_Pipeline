// Single source of truth for "what is the app showing": a discriminated
// union instead of parallel state fields, plus the one URL↔state mapping
// used by initial load, popstate, and every navigation.

import { adapterForFormat } from './documents/adapter'
import { detectFormatFromSrc } from './documents/detectFormat'
import type { DocumentSource } from './documents/types'
import { makeDocumentKey } from './documentKey'
import { getLibraryContent, getLibraryDoc } from './library'

export type OpenDocument = {
  source: DocumentSource
  fileName: string
  /** Library id when opened from the library, otherwise ''. */
  libraryId: string
  fingerprint: string
}

export type AppState =
  | { view: 'home' }
  | { view: 'external'; src: string; fileName: string }
  | { view: 'reader'; doc: OpenDocument }

export function documentKeyFor(doc: OpenDocument): string {
  return makeDocumentKey(doc.libraryId, doc.fileName, doc.fingerprint)
}

export function parseFileNameFromSrc(src: string): string {
  try {
    const url = new URL(src)
    const base = decodeURIComponent(url.pathname.split('/').pop() ?? '')
    return base || 'document.md'
  } catch {
    return 'document.md'
  }
}

export function libraryDocumentState(docId: string): AppState | null {
  const doc = getLibraryDoc(docId)
  const content = getLibraryContent(docId)
  if (!doc || !content) {
    return null
  }

  return {
    view: 'reader',
    doc: {
      source: { format: 'markdown', content },
      fileName: doc.fileName,
      libraryId: doc.id,
      fingerprint: content,
    },
  }
}

/** Derive app state from the current location (?src=, ?doc=, or home). */
export function stateFromLocation(): AppState {
  const params = new URLSearchParams(window.location.search)

  const src = params.get('src')
  if (src) {
    const fileName = params.get('name') ?? parseFileNameFromSrc(src)
    return { view: 'external', src, fileName }
  }

  const docId = params.get('doc')
  if (docId) {
    return libraryDocumentState(docId) ?? { view: 'home' }
  }

  return { view: 'home' }
}

/** The URL a state should live at (inverse of stateFromLocation). */
export function urlForState(state: AppState): URL {
  const url = new URL(window.location.href)
  url.searchParams.delete('doc')
  url.searchParams.delete('src')
  url.searchParams.delete('name')
  url.hash = ''

  if (state.view === 'external') {
    url.searchParams.set('src', state.src)
    if (state.fileName && state.fileName !== parseFileNameFromSrc(state.src)) {
      url.searchParams.set('name', state.fileName)
    }
  } else if (state.view === 'reader' && state.doc.libraryId) {
    url.searchParams.set('doc', state.doc.libraryId)
  }

  return url
}

export async function loadExternalDocument(
  src: string,
  signal: AbortSignal,
  options?: { fileName?: string },
): Promise<OpenDocument> {
  const fileName = options?.fileName ?? parseFileNameFromSrc(src)
  const format = detectFormatFromSrc(src, fileName)
  const adapter = adapterForFormat(format)

  const response = await fetch(src, {
    signal,
    headers:
      format === 'pdf' || format === 'image'
        ? undefined
        : {
            Accept:
              'text/csv,application/json,text/javascript,application/javascript,text/plain,text/markdown;q=0.9,*/*;q=0.8',
          },
  })
  if (!response.ok) {
    throw new Error(`Could not load document (${response.status})`)
  }

  const { source, fingerprint } = await adapter.readResponse(response)
  return { source, fileName, libraryId: '', fingerprint }
}

/** Markdown error page shown when an external document fails to load. */
export function externalErrorDocument(src: string, message: string): OpenDocument {
  return {
    source: {
      format: 'markdown',
      content: `# Unable to load document\n\nSource: \`${src}\`\n\n${message}`,
    },
    fileName: parseFileNameFromSrc(src),
    libraryId: '',
    fingerprint: src,
  }
}
