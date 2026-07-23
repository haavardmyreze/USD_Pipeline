import { makeDocumentKey } from './documentKey'
import type { OpenDocument } from './documentState'
import type { DocumentFormat } from './documents/types'
import { isCodeFileName } from './code/codeExtensions'
import {
  cacheRecentDocument,
  pruneRecentDocumentCache,
  rememberRecentDocumentInMemory,
} from './recentDocumentCache'

export type RecentDocumentKind = 'library' | 'external' | 'import' | 'clipboard'

export type RecentDocument = {
  id: string
  kind: RecentDocumentKind
  fileName: string
  format: DocumentFormat
  docKey: string
  libraryId?: string
  externalSrc?: string
  openedAt: number
}

const RECENTS_KEY = 'mdv-recent-docs'
const MAX_RECENTS = 12

const CLIPBOARD_MARKDOWN = 'clipboard.md'
const CLIPBOARD_IMAGE_PATTERN = /\.(png|jpe?g|webp|gif|bmp|tiff?|exr|hdr)$/i

function isClipboardFileName(fileName: string) {
  return fileName === CLIPBOARD_MARKDOWN || fileName.startsWith('clipboard.')
}

function inferClipboardFormat(fileName: string) {
  if (fileName === CLIPBOARD_MARKDOWN) {
    return 'markdown' as const
  }

  if (CLIPBOARD_IMAGE_PATTERN.test(fileName)) {
    return 'image' as const
  }

  if (isCodeFileName(fileName) || fileName.endsWith('.txt')) {
    return 'code' as const
  }

  return 'markdown' as const
}

function recentKindFor(doc: OpenDocument, externalSrc?: string): RecentDocumentKind {
  if (doc.libraryId) {
    return 'library'
  }

  if (externalSrc) {
    return 'external'
  }

  if (isClipboardFileName(doc.fileName)) {
    return 'clipboard'
  }

  return 'import'
}

function inferRecentKind(entry: RecentDocument): RecentDocumentKind {
  if (entry.kind) {
    return entry.kind
  }

  if (entry.libraryId) {
    return 'library'
  }

  if (entry.externalSrc) {
    return 'external'
  }

  if (isClipboardFileName(entry.fileName)) {
    return 'clipboard'
  }

  return 'import'
}

function normalizeRecentDocument(entry: RecentDocument): RecentDocument {
  const kind = inferRecentKind(entry)
  const format =
    entry.format ??
    (entry.fileName.toLowerCase().endsWith('.pdf')
      ? 'pdf'
      : entry.fileName.toLowerCase().endsWith('.csv')
        ? 'csv'
        : isClipboardFileName(entry.fileName)
          ? inferClipboardFormat(entry.fileName)
          : /\.(png|jpe?g|webp|gif|bmp|tiff?|exr|hdr)$/i.test(entry.fileName)
              ? 'image'
              : isCodeFileName(entry.fileName)
                ? 'code'
                : 'markdown')

  return {
    ...entry,
    kind,
    format,
  }
}

export function recentDocumentNeedsCache(entry: RecentDocument) {
  const kind = inferRecentKind(entry)
  return kind === 'import' || kind === 'clipboard'
}

function recentIdFor(doc: OpenDocument, externalSrc?: string) {
  if (doc.libraryId) {
    return `library:${doc.libraryId}`
  }

  if (externalSrc) {
    return `external:${externalSrc}`
  }

  return `import:${makeDocumentKey('', doc.fileName, doc.fingerprint)}`
}

export function rememberRecentDocument(doc: OpenDocument, options?: { externalSrc?: string }) {
  const externalSrc = options?.externalSrc
  const entry: RecentDocument = {
    id: recentIdFor(doc, externalSrc),
    kind: recentKindFor(doc, externalSrc),
    fileName: doc.fileName,
    format: doc.source.format,
    docKey: makeDocumentKey(doc.libraryId, doc.fileName, doc.fingerprint),
    libraryId: doc.libraryId || undefined,
    externalSrc,
    openedAt: Date.now(),
  }

  try {
    const existing = loadRecentDocuments().filter((item) => item.id !== entry.id)
    const next = [entry, ...existing].slice(0, MAX_RECENTS)
    localStorage.setItem(RECENTS_KEY, JSON.stringify(next))

    rememberRecentDocumentInMemory(entry.docKey, doc)

    void (async () => {
      await cacheRecentDocument(entry.docKey, doc)
      await pruneRecentDocumentCache(
        next.filter(recentDocumentNeedsCache).map((item) => item.docKey),
      )
    })()
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}

export function loadRecentDocuments(): RecentDocument[] {
  try {
    const raw = localStorage.getItem(RECENTS_KEY)
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as RecentDocument[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(
        (item) =>
          item &&
          typeof item.id === 'string' &&
          typeof item.fileName === 'string' &&
          typeof item.docKey === 'string' &&
          typeof item.openedAt === 'number',
      )
      .map(normalizeRecentDocument)
  } catch {
    return []
  }
}

export function recentDocumentTitle(fileName: string) {
  return fileName
    .replace(/\.[^.]+$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

export function formatRecentFormatLabel(format: DocumentFormat) {
  switch (format) {
    case 'markdown':
      return 'Markdown'
    case 'pdf':
      return 'PDF'
    case 'csv':
      return 'CSV'
    case 'image':
      return 'Image'
    case 'code':
      return 'Code'
  }
}

export function formatRecentOpenedAgo(openedAt: number) {
  const seconds = Math.max(0, Math.floor((Date.now() - openedAt) / 1000))

  if (seconds < 45) {
    return 'Just now'
  }

  if (seconds < 3600) {
    return `${Math.floor(seconds / 60)}m ago`
  }

  if (seconds < 86_400) {
    return `${Math.floor(seconds / 3600)}h ago`
  }

  if (seconds < 604_800) {
    return `${Math.floor(seconds / 86_400)}d ago`
  }

  return new Date(openedAt).toLocaleDateString(undefined, {
    month: 'short',
    day: 'numeric',
  })
}
