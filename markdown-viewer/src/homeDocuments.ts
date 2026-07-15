import type { LibraryDoc } from './library'
import type { DocumentFormat } from './documents/types'
import type { RecentDocument } from './recentDocuments'
import { recentDocumentTitle } from './recentDocuments'

export type HomeDocumentItem =
  | { source: 'recent'; entry: RecentDocument; key: string }
  | { source: 'library'; doc: LibraryDoc; key: string }

export function buildHomeDocuments(
  recentDocs: RecentDocument[],
  libraryDocs: LibraryDoc[],
): HomeDocumentItem[] {
  const recentLibraryIds = new Set(
    recentDocs
      .filter((entry) => entry.kind === 'library' && entry.libraryId)
      .map((entry) => entry.libraryId!),
  )

  return [
    ...recentDocs.map((entry) => ({ source: 'recent' as const, entry, key: entry.id })),
    ...libraryDocs
      .filter((doc) => !recentLibraryIds.has(doc.id))
      .map((doc) => ({ source: 'library' as const, doc, key: `library:${doc.id}` })),
  ]
}

export function homeDocumentFormat(item: HomeDocumentItem): DocumentFormat {
  if (item.source === 'recent') {
    return item.entry.format
  }

  return 'markdown'
}

export function homeDocumentTitle(
  item: HomeDocumentItem,
  libraryLookup: (id: string) => LibraryDoc | null,
) {
  if (item.source === 'library') {
    return item.doc.title
  }

  if (item.entry.kind === 'library' && item.entry.libraryId) {
    return libraryLookup(item.entry.libraryId)?.title ?? recentDocumentTitle(item.entry.fileName)
  }

  return recentDocumentTitle(item.entry.fileName)
}

export function homeDocumentExcerpt(
  item: HomeDocumentItem,
  libraryLookup: (id: string) => LibraryDoc | null,
) {
  if (item.source === 'library') {
    return item.doc.excerpt
  }

  if (item.entry.kind === 'library' && item.entry.libraryId) {
    return libraryLookup(item.entry.libraryId)?.excerpt ?? item.entry.fileName
  }

  return item.entry.fileName
}

export function homeDocumentDocKey(item: HomeDocumentItem) {
  if (item.source === 'recent') {
    return item.entry.docKey
  }

  return item.doc.id
}

export function homeDocumentActive(item: HomeDocumentItem, activeDocId: string) {
  if (item.source === 'library') {
    return item.doc.id === activeDocId
  }

  return item.entry.kind === 'library' && item.entry.libraryId === activeDocId
}

export function homeDocumentLibraryDoc(
  item: HomeDocumentItem,
  libraryLookup: (id: string) => LibraryDoc | null,
) {
  if (item.source === 'library') {
    return item.doc
  }

  if (item.entry.kind === 'library' && item.entry.libraryId) {
    return libraryLookup(item.entry.libraryId)
  }

  return null
}
