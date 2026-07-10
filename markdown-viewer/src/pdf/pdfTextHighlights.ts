import type { DocumentComment } from '../documentComments'
import { isPdfCommentAnchor } from '../documents/commentAnchorUtils'

export type TextHighlightRange = {
  start: number
  end: number
  className: string
}

export type SpanSegment = {
  span: HTMLSpanElement
  start: number
  end: number
  text: string
}

type CharRange = {
  start: number
  end: number
}

function tokenizeQuery(query: string) {
  return query
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function buildWhitespaceCollapsedIndex(text: string) {
  const indexMap: number[] = []
  let collapsed = ''

  for (let index = 0; index < text.length; index += 1) {
    const char = text[index]
    if (/\s/.test(char)) {
      continue
    }

    indexMap.push(index)
    collapsed += char
  }

  return { collapsed: collapsed.toLowerCase(), indexMap }
}

function mapCollapsedRange(
  text: string,
  collapsedStart: number,
  collapsedLength: number,
): CharRange | null {
  const { indexMap } = buildWhitespaceCollapsedIndex(text)
  if (
    collapsedStart < 0 ||
    collapsedLength <= 0 ||
    collapsedStart + collapsedLength > indexMap.length
  ) {
    return null
  }

  const start = indexMap[collapsedStart]
  const end = indexMap[collapsedStart + collapsedLength - 1] + 1
  return { start, end }
}

function findFlexibleTextRange(text: string, needle: string, hintOffset = 0) {
  const trimmed = needle.trim()
  if (!trimmed || !text) {
    return null
  }

  let best: CharRange | null = null
  let bestDistance = Number.POSITIVE_INFINITY
  let index = text.indexOf(trimmed)

  while (index !== -1) {
    const distance = Math.abs(index - hintOffset)
    if (distance < bestDistance) {
      bestDistance = distance
      best = { start: index, end: index + trimmed.length }
    }
    index = text.indexOf(trimmed, index + 1)
  }

  if (best) {
    return best
  }

  const textIndex = buildWhitespaceCollapsedIndex(text)
  const needleIndex = buildWhitespaceCollapsedIndex(trimmed)
  const collapsedIndex = textIndex.collapsed.indexOf(needleIndex.collapsed)
  if (collapsedIndex >= 0) {
    return mapCollapsedRange(text, collapsedIndex, needleIndex.collapsed.length)
  }

  return null
}

function findQueryRanges(text: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed || !text) {
    return [] as CharRange[]
  }

  const ranges: CharRange[] = []
  const lowerText = text.toLowerCase()
  const lowerQuery = trimmed.toLowerCase()

  let index = lowerText.indexOf(lowerQuery)
  while (index !== -1) {
    ranges.push({ start: index, end: index + trimmed.length })
    index = lowerText.indexOf(lowerQuery, index + Math.max(1, trimmed.length))
  }

  if (ranges.length > 0) {
    return ranges
  }

  const flexible = findFlexibleTextRange(text, trimmed)
  if (flexible) {
    return [flexible]
  }

  for (const token of tokenizeQuery(trimmed)) {
    let tokenIndex = lowerText.indexOf(token)
    while (tokenIndex !== -1) {
      ranges.push({ start: tokenIndex, end: tokenIndex + token.length })
      tokenIndex = lowerText.indexOf(token, tokenIndex + token.length)
    }
  }

  return ranges
}

export function buildSpanSegments(textLayer: HTMLElement) {
  const segments: SpanSegment[] = []
  let text = ''

  for (const span of textLayer.querySelectorAll('span')) {
    const segmentText = span.textContent ?? ''
    if (!segmentText) {
      continue
    }

    const start = text.length
    text += segmentText
    segments.push({
      span,
      start,
      end: text.length,
      text: segmentText,
    })
  }

  return { text, segments }
}

export function buildPageHighlightRanges(
  pageNumber: number,
  layerText: string,
  options: {
    searchQuery?: string
    comments?: DocumentComment[]
    activeCommentId?: string
  },
) {
  const ranges: TextHighlightRange[] = []

  if (options.searchQuery?.trim()) {
    for (const match of findQueryRanges(layerText, options.searchQuery)) {
      ranges.push({
        start: match.start,
        end: match.end,
        className: 'pdf-search-hit',
      })
    }
  }

  for (const comment of options.comments ?? []) {
    if (!isPdfCommentAnchor(comment.anchor) || comment.anchor.page !== pageNumber) {
      continue
    }

    const resolved =
      findFlexibleTextRange(layerText, comment.anchor.quote, comment.anchor.charOffset) ??
      ({
        start: comment.anchor.charOffset,
        end: Math.max(comment.anchor.charEnd, comment.anchor.charOffset + 1),
      } satisfies CharRange)

    ranges.push({
      start: resolved.start,
      end: resolved.end,
      className:
        comment.id === options.activeCommentId
          ? 'pdf-comment-hit pdf-comment-hit-active'
          : 'pdf-comment-hit',
    })
  }

  return ranges
}

export function buildHighlightRangesFromTextLayer(
  textLayer: HTMLElement,
  pageNumber: number,
  options: {
    searchQuery?: string
    comments?: DocumentComment[]
    activeCommentId?: string
  },
) {
  const { text } = buildSpanSegments(textLayer)
  return buildPageHighlightRanges(pageNumber, text, options)
}

export function applyHighlightsToSegments(
  segments: SpanSegment[],
  ranges: TextHighlightRange[],
) {
  for (const segment of segments) {
    segment.span.classList.remove('pdf-search-hit', 'pdf-comment-hit', 'pdf-comment-hit-active')
  }

  for (const segment of segments) {
    for (const range of ranges) {
      if (segment.end > range.start && segment.start < range.end) {
        for (const className of range.className.split(/\s+/)) {
          if (className) {
            segment.span.classList.add(className)
          }
        }
      }
    }
  }
}

export function applyHighlightsToTextLayer(
  textLayer: HTMLElement,
  ranges: TextHighlightRange[],
) {
  const { segments } = buildSpanSegments(textLayer)
  applyHighlightsToSegments(segments, ranges)
}
