import { useCallback, useEffect, useState } from 'react'

export type CommentAnchor = {
  start: number
  end: number
  quote: string
  headingId: string
}

export type DocumentComment = {
  id: string
  anchor: CommentAnchor
  body: string
  createdAt: number
  updatedAt: number
}

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
          typeof comment.anchor.start === 'number' &&
          typeof comment.anchor.end === 'number' &&
          typeof comment.anchor.quote === 'string',
      )
      .sort((left, right) => left.anchor.start - right.anchor.start)
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
  markdown: string,
  comments: DocumentComment[],
): DocumentComment[] {
  return comments.filter((comment) => {
    const { start, end, quote } = comment.anchor
    if (start < 0 || end <= start || end > markdown.length) {
      return false
    }

    const anchoredText = markdown.slice(start, end)
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

export function useDocumentComments(docKey: string, markdown: string) {
  const [comments, setComments] = useState<DocumentComment[]>(() =>
    pruneDocumentComments(markdown, loadDocumentComments(docKey)),
  )
  const [activeCommentId, setActiveCommentId] = useState('')

  useEffect(() => {
    setComments(pruneDocumentComments(markdown, loadDocumentComments(docKey)))
    setActiveCommentId('')
  }, [docKey, markdown])

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
      anchor,
      body: trimmedBody,
      createdAt: now,
      updatedAt: now,
    }

    setComments((current) =>
      [...current, comment].sort((left, right) => left.anchor.start - right.anchor.start),
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
