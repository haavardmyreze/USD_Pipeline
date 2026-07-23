import type { CommentAnchor, DocumentComment } from './documentComments'
import {
  isCodeCommentAnchor,
  isCsvCommentAnchor,
  isPdfCommentAnchor,
} from './documents/commentAnchorUtils'

export type TocEntryLike = {
  id: string
  text: string
  level: number
}

function escapeRegex(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function normalizeWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

export function getNearestHeadingId(node: Node | null, scope: ParentNode) {
  let element =
    node instanceof HTMLElement ? node : node?.parentElement ?? null

  while (element && scope.contains(element)) {
    if (element.matches('h1[id], h2[id], h3[id]')) {
      return element.id
    }
    element = element.parentElement
  }

  return ''
}

export function getPaperRoot(node: Node | null, scope: ParentNode) {
  let element =
    node instanceof HTMLElement ? node : node?.parentElement ?? null

  while (element && scope.contains(element)) {
    if (element.matches('.paper-scroll, .paper-page, .paper-card')) {
      return element
    }
    element = element.parentElement
  }

  return null
}

export function getSelectionContext(scope: HTMLElement, range: Range) {
  const preRange = range.cloneRange()
  preRange.selectNodeContents(scope)
  preRange.setEnd(range.startContainer, range.startOffset)
  const startOffset = preRange.toString().length
  const quote = range.toString()
  const fullText = scope.textContent ?? ''

  return {
    quote,
    prefix: fullText.slice(Math.max(0, startOffset - 96), startOffset),
    suffix: fullText.slice(
      startOffset + quote.length,
      startOffset + quote.length + 96,
    ),
    startOffset,
  }
}

function getHeadingLevel(heading: HTMLElement) {
  return Number(heading.tagName.slice(1))
}

function getSectionTextAfterHeading(scope: HTMLElement, headingId: string) {
  const heading = scope.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`)
  if (!heading) {
    return ''
  }

  const level = getHeadingLevel(heading)
  const parts: string[] = []

  let node: ChildNode | null = heading.nextSibling
  while (node) {
    if (node instanceof HTMLElement && /^H[1-3]$/i.test(node.tagName)) {
      if (getHeadingLevel(node) <= level) {
        break
      }
    }

    parts.push(node.textContent ?? '')
    node = node.nextSibling
  }

  return parts.join('')
}

function getOffsetWithinSection(scope: HTMLElement, range: Range, headingId: string) {
  const heading = scope.querySelector<HTMLElement>(`#${CSS.escape(headingId)}`)
  if (!heading) {
    return 0
  }

  const sectionRange = document.createRange()
  sectionRange.setStartAfter(heading)
  sectionRange.setEnd(range.startContainer, range.startOffset)

  if (!scope.contains(sectionRange.commonAncestorContainer)) {
    return 0
  }

  return sectionRange.toString().length
}

function findHeadingLineIndex(markdown: string, entry: TocEntryLike) {
  const pattern = new RegExp(
    `^#{1,3}\\s+${escapeRegex(entry.text.trim())}\\s*$`,
    'm',
  )
  const match = pattern.exec(markdown)
  return match?.index ?? -1
}

export function getSectionMarkdownRange(
  markdown: string,
  toc: TocEntryLike[],
  headingId: string,
) {
  const entryIndex = toc.findIndex((entry) => entry.id === headingId)
  if (entryIndex === -1) {
    return { start: 0, end: markdown.length }
  }

  const entry = toc[entryIndex]
  const start = findHeadingLineIndex(markdown, entry)
  if (start === -1) {
    return { start: 0, end: markdown.length }
  }

  let end = markdown.length
  for (let index = entryIndex + 1; index < toc.length; index += 1) {
    const nextEntry = toc[index]
    if (nextEntry.level > entry.level) {
      continue
    }

    const nextStart = findHeadingLineIndex(markdown, nextEntry)
    if (nextStart !== -1 && nextStart > start) {
      end = nextStart
      break
    }
  }

  return { start, end }
}

function trimSelectionQuote(quote: string) {
  return quote.replace(/^\s+|\s+$/g, '')
}

function quoteToPattern(quote: string) {
  const parts = trimSelectionQuote(quote)
    .split(/\s+/)
    .filter(Boolean)
    .map(escapeRegex)

  if (parts.length === 0) {
    return null
  }

  return new RegExp(parts.join('\\s+'), 'g')
}

function occurrenceIndexAtOffset(fullText: string, quote: string, offset: number) {
  const trimmed = trimSelectionQuote(quote)
  if (!trimmed) {
    return 0
  }

  let occurrence = 0
  let searchFrom = 0

  while (searchFrom <= offset) {
    const found = fullText.indexOf(trimmed, searchFrom)
    if (found === -1 || found > offset) {
      return Math.max(0, occurrence - 1)
    }

    if (offset <= found + trimmed.length) {
      return occurrence
    }

    occurrence += 1
    searchFrom = found + trimmed.length
  }

  return Math.max(0, occurrence - 1)
}

type QuoteMatch = {
  start: number
  length: number
}

function findAllQuoteMatches(sectionMarkdown: string, quote: string): QuoteMatch[] {
  const trimmedQuote = trimSelectionQuote(quote)
  if (!trimmedQuote) {
    return []
  }

  const matches: QuoteMatch[] = []

  let searchFrom = 0
  while (searchFrom < sectionMarkdown.length) {
    const found = sectionMarkdown.indexOf(trimmedQuote, searchFrom)
    if (found === -1) {
      break
    }
    matches.push({ start: found, length: trimmedQuote.length })
    searchFrom = found + Math.max(1, trimmedQuote.length)
  }

  const pattern = quoteToPattern(trimmedQuote)
  if (pattern) {
    for (const match of sectionMarkdown.matchAll(pattern)) {
      const start = match.index ?? 0
      const length = match[0].length
      const overlaps = matches.some(
        (existing) =>
          start < existing.start + existing.length && start + length > existing.start,
      )
      if (!overlaps) {
        matches.push({ start, length })
      }
    }
  }

  return matches.sort((left, right) => left.start - right.start)
}

function scoreCandidate(
  sectionMarkdown: string,
  candidateStart: number,
  matchLength: number,
  prefix: string,
  suffix: string,
) {
  const before = sectionMarkdown.slice(Math.max(0, candidateStart - 96), candidateStart)
  const after = sectionMarkdown.slice(
    candidateStart + matchLength,
    candidateStart + matchLength + 96,
  )

  let score = 0
  const prefixTail = prefix.slice(-48)
  const suffixHead = suffix.slice(0, 48)

  if (prefixTail && before.includes(prefixTail)) {
    score += 6
  }
  if (suffixHead && after.includes(suffixHead)) {
    score += 6
  }

  if (prefixTail && normalizeWhitespace(before).includes(normalizeWhitespace(prefixTail))) {
    score += 2
  }
  if (suffixHead && normalizeWhitespace(after).includes(normalizeWhitespace(suffixHead))) {
    score += 2
  }

  if (prefixTail.length >= 8 && before.endsWith(prefixTail.slice(-8))) {
    score += 3
  }
  if (suffixHead.length >= 8 && after.startsWith(suffixHead.slice(0, 8))) {
    score += 3
  }

  return score
}

function findQuoteRangeInSection(
  sectionMarkdown: string,
  quote: string,
  prefix: string,
  suffix: string,
  occurrenceIndex: number,
) {
  const trimmedQuote = trimSelectionQuote(quote)
  if (!trimmedQuote) {
    return null
  }

  const matches = findAllQuoteMatches(sectionMarkdown, trimmedQuote)
  if (matches.length === 0) {
    return null
  }

  if (occurrenceIndex >= 0 && occurrenceIndex < matches.length) {
    const candidate = matches[occurrenceIndex]
    const candidateScore = scoreCandidate(
      sectionMarkdown,
      candidate.start,
      candidate.length,
      prefix,
      suffix,
    )
    const bestScore = matches.reduce((max, match) => {
      return Math.max(
        max,
        scoreCandidate(sectionMarkdown, match.start, match.length, prefix, suffix),
      )
    }, -1)

    if (candidateScore >= bestScore - 1) {
      return candidate
    }
  }

  let best = matches[0]
  let bestScore = -1
  for (const match of matches) {
    const score = scoreCandidate(sectionMarkdown, match.start, match.length, prefix, suffix)
    if (score > bestScore) {
      bestScore = score
      best = match
    }
  }

  return best
}

export function resolveSelectionAnchor(
  markdown: string,
  selection: Selection,
  scope: HTMLElement,
  toc: TocEntryLike[],
): CommentAnchor | null {
  if (selection.rangeCount === 0 || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!scope.contains(range.commonAncestorContainer)) {
    return null
  }

  const paperRoot = getPaperRoot(range.commonAncestorContainer, scope)
  if (!paperRoot) {
    return null
  }

  if (paperRoot.closest('.measure-host')) {
    return null
  }

  if (paperRoot.closest('pre, code, .page-running-header, .page-number')) {
    return null
  }

  const { quote, prefix, suffix } = getSelectionContext(paperRoot, range)
  const trimmedQuote = trimSelectionQuote(quote)
  if (!trimmedQuote) {
    return null
  }

  const headingId = getNearestHeadingId(range.commonAncestorContainer, scope)
  const sectionRange = headingId
    ? getSectionMarkdownRange(markdown, toc, headingId)
    : { start: 0, end: markdown.length }
  const sectionMarkdown = markdown.slice(sectionRange.start, sectionRange.end)
  const sectionPlainText = headingId
    ? getSectionTextAfterHeading(scope, headingId)
    : paperRoot.textContent ?? ''
  const offsetInSection = headingId
    ? getOffsetWithinSection(scope, range, headingId)
    : getSelectionContext(paperRoot, range).startOffset
  const occurrenceIndex = occurrenceIndexAtOffset(sectionPlainText, trimmedQuote, offsetInSection)
  const match = findQuoteRangeInSection(
    sectionMarkdown,
    trimmedQuote,
    prefix,
    suffix,
    occurrenceIndex,
  )

  if (!match) {
    return null
  }

  return {
    start: sectionRange.start + match.start,
    end: sectionRange.start + match.start + match.length,
    quote: trimmedQuote,
    headingId,
  }
}

export function injectCommentHighlights(
  markdown: string,
  comments: DocumentComment[],
) {
  if (comments.length === 0) {
    return markdown
  }

  const validComments = comments
    .filter((comment) => {
      if (
        isPdfCommentAnchor(comment.anchor) ||
        isCsvCommentAnchor(comment.anchor) ||
        isCodeCommentAnchor(comment.anchor)
      ) {
        return false
      }

      const { start, end } = comment.anchor
      return start >= 0 && end > start && end <= markdown.length
    })
    .sort((left, right) => {
      if (
        isPdfCommentAnchor(left.anchor) ||
        isPdfCommentAnchor(right.anchor) ||
        isCsvCommentAnchor(left.anchor) ||
        isCsvCommentAnchor(right.anchor) ||
        isCodeCommentAnchor(left.anchor) ||
        isCodeCommentAnchor(right.anchor)
      ) {
        return 0
      }

      return right.anchor.start - left.anchor.start
    })

  let result = markdown
  for (const comment of validComments) {
    if (
      isPdfCommentAnchor(comment.anchor) ||
      isCsvCommentAnchor(comment.anchor) ||
      isCodeCommentAnchor(comment.anchor)
    ) {
      continue
    }

    const { start, end } = comment.anchor
    const slice = result.slice(start, end)
    if (!slice) {
      continue
    }

    const wrapped = `<mark class="comment-highlight" data-comment-id="${comment.id}">${slice}</mark>`
    result = `${result.slice(0, start)}${wrapped}${result.slice(end)}`
  }

  return result
}
