import type {
  CodeCommentAnchor,
  CommentAnchor,
  CsvCommentAnchor,
  PdfCommentAnchor,
} from '../documentComments'

export function isPdfCommentAnchor(anchor: CommentAnchor): anchor is PdfCommentAnchor {
  return anchor.kind === 'pdf'
}

export function isCsvCommentAnchor(anchor: CommentAnchor): anchor is CsvCommentAnchor {
  return anchor.kind === 'csv'
}

export function isCodeCommentAnchor(anchor: CommentAnchor): anchor is CodeCommentAnchor {
  return anchor.kind === 'code'
}

export function getCommentAnchorSortKey(anchor: CommentAnchor) {
  if (isPdfCommentAnchor(anchor)) {
    return anchor.globalOffset
  }

  if (isCsvCommentAnchor(anchor)) {
    return anchor.globalOffset
  }

  if (isCodeCommentAnchor(anchor)) {
    return anchor.globalOffset
  }

  return anchor.start
}

export function normalizeCommentAnchor(anchor: CommentAnchor): CommentAnchor {
  if (anchor.kind === 'pdf' || anchor.kind === 'csv' || anchor.kind === 'code') {
    return anchor
  }

  return {
    kind: 'markdown',
    start: anchor.start,
    end: anchor.end,
    quote: anchor.quote,
    headingId: anchor.headingId,
  }
}
