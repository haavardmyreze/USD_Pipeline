import { useCallback, useEffect, useState } from 'react'
import { getCommentAnchorSortKey, isCsvCommentAnchor, normalizeCommentAnchor } from './documents/commentAnchorUtils'

export type MarkdownCommentAnchor = {
  kind?: 'markdown'
  start: number
  end: number
  quote: string
  headingId: string
}

export type PdfCommentAnchor = {
  kind: 'pdf'
  page: number
  quote: string
  charOffset: number
  charEnd: number
  globalOffset: number
}

export type CsvCommentAnchor = {
  kind: 'csv'
  row: number
  col: number
  quote: string
  globalOffset: number
}

export type CodeCommentAnchor = {
  kind: 'code'
  line: number
  quote: string
  globalOffset: number
}

export type CommentAnchor =
  | MarkdownCommentAnchor
  | PdfCommentAnchor
  | CsvCommentAnchor
  | CodeCommentAnchor

export type DocumentComment = {
  id: string
  anchor: CommentAnchor
  body: string
  createdAt: number
  updatedAt: number
}

export type CommentPruneSource =
  | { format: 'markdown'; markdown: string }
  | { format: 'pdf'; pageTexts: string[] }
  | { format: 'csv'; rows: string[][] }
  | { format: 'code'; lines: string[] }

const STORAGE_PREFIX = 'mdv-comments:'

function storageKey(docKey: string) {
  return `${STORAGE_PREFIX}${docKey}`
}

function createCommentId() {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) {
    return crypto.randomUUID()
  }

  return `comment-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`
}

function normalizeStoredComment(comment: DocumentComment): DocumentComment {
  return {
    ...comment,
    anchor: normalizeCommentAnchor(comment.anchor),
  }
}

export function loadDocumentComments(docKey: string): DocumentComment[] {
  if (!docKey) {
    return []
  }

  try {
    const raw = localStorage.getItem(storageKey(docKey))
    if (!raw) {
      return []
    }

    const parsed = JSON.parse(raw) as DocumentComment[]
    if (!Array.isArray(parsed)) {
      return []
    }

    return parsed
      .filter(
        (comment) =>
          comment &&
          typeof comment.id === 'string' &&
          typeof comment.body === 'string' &&
          comment.anchor &&
          typeof comment.anchor.quote === 'string',
      )
      .map(normalizeStoredComment)
      .sort(
        (left, right) =>
          getCommentAnchorSortKey(left.anchor) - getCommentAnchorSortKey(right.anchor),
      )
  } catch {
    return []
  }
}

export function saveDocumentComments(docKey: string, comments: DocumentComment[]) {
  if (!docKey) {
    return
  }

  try {
    localStorage.setItem(storageKey(docKey), JSON.stringify(comments))
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}

export function pruneDocumentComments(
  source: CommentPruneSource,
  comments: DocumentComment[],
): DocumentComment[] {
  return comments.filter((comment) => {
    const anchor = normalizeCommentAnchor(comment.anchor)

    if (anchor.kind === 'pdf') {
      if (source.format !== 'pdf') {
        return false
      }

      const pageText = source.pageTexts[anchor.page - 1] ?? ''
      if (!pageText) {
        return false
      }

      return pageText.includes(anchor.quote.trim())
    }

    if (isCsvCommentAnchor(anchor)) {
      if (source.format !== 'csv') {
        return false
      }

      const cellValue = source.rows[anchor.row]?.[anchor.col] ?? ''
      if (!cellValue) {
        return false
      }

      const quote = anchor.quote.trim()
      return cellValue === quote || cellValue.includes(quote) || quote.includes(cellValue.trim())
    }

    if (anchor.kind === 'code') {
      if (source.format !== 'code') {
        return false
      }

      if (anchor.line < 0 || anchor.line >= source.lines.length) {
        return false
      }

      const quote = anchor.quote.trim()
      if (!quote) {
        return true
      }

      const lineText = source.lines[anchor.line] ?? ''
      return lineText.includes(quote) || quote.includes(lineText.trim())
    }

    if (source.format !== 'markdown') {
      return false
    }

    const { start, end, quote } = anchor
    if (start < 0 || end <= start || end > source.markdown.length) {
      return false
    }

    const anchoredText = source.markdown.slice(start, end)
    if (!anchoredText) {
      return false
    }

    return (
      anchoredText === quote ||
      anchoredText.includes(quote) ||
      quote.includes(anchoredText.trim())
    )
  })
}

export function useDocumentComments(docKey: string, source: CommentPruneSource) {
  const [comments, setComments] = useState<DocumentComment[]>(() =>
    pruneDocumentComments(source, loadDocumentComments(docKey)),
  )
  const [activeCommentId, setActiveCommentId] = useState('')

  useEffect(() => {
    setComments(pruneDocumentComments(source, loadDocumentComments(docKey)))
    setActiveCommentId('')
  }, [docKey, source])

  useEffect(() => {
    saveDocumentComments(docKey, comments)
  }, [docKey, comments])

  const addComment = useCallback((anchor: CommentAnchor, body: string) => {
    const trimmedBody = body.trim()
    if (!trimmedBody) {
      return null
    }

    const now = Date.now()
    const comment: DocumentComment = {
      id: createCommentId(),
      anchor: normalizeCommentAnchor(anchor),
      body: trimmedBody,
      createdAt: now,
      updatedAt: now,
    }

    setComments((current) =>
      [...current, comment].sort(
        (left, right) =>
          getCommentAnchorSortKey(left.anchor) - getCommentAnchorSortKey(right.anchor),
      ),
    )
    setActiveCommentId(comment.id)
    return comment
  }, [])

  const updateComment = useCallback((id: string, body: string) => {
    const trimmedBody = body.trim()
    if (!trimmedBody) {
      return
    }

    setComments((current) =>
      current.map((comment) =>
        comment.id === id
          ? { ...comment, body: trimmedBody, updatedAt: Date.now() }
          : comment,
      ),
    )
  }, [])

  const deleteComment = useCallback((id: string) => {
    setComments((current) => current.filter((comment) => comment.id !== id))
    setActiveCommentId((current) => (current === id ? '' : current))
  }, [])

  return {
    comments,
    activeCommentId,
    setActiveCommentId,
    addComment,
    updateComment,
    deleteComment,
  }
}
