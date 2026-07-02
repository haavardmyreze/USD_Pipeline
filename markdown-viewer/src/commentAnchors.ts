import type { CommentAnchor, DocumentComment } from './documentComments'

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
    prefix: fullText.slice(Math.max(0, startOffset - 48), startOffset),
    suffix: fullText.slice(
      startOffset + quote.length,
      startOffset + quote.length + 48,
    ),
    startOffset,
  }
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

function scoreCandidate(
  sectionMarkdown: string,
  candidateStart: number,
  matchLength: number,
  prefix: string,
  suffix: string,
) {
  const before = sectionMarkdown.slice(Math.max(0, candidateStart - 64), candidateStart)
  const after = sectionMarkdown.slice(candidateStart + matchLength, candidateStart + matchLength + 64)

  let score = 0
  const prefixTail = prefix.slice(-24)
  const suffixHead = suffix.slice(0, 24)

  if (prefixTail && before.includes(prefixTail)) {
    score += 3
  }
  if (suffixHead && after.includes(suffixHead)) {
    score += 3
  }

  if (prefixTail && normalizeWhitespace(before).includes(normalizeWhitespace(prefixTail))) {
    score += 1
  }
  if (suffixHead && normalizeWhitespace(after).includes(normalizeWhitespace(suffixHead))) {
    score += 1
  }

  return score
}

function findQuoteRangeInSection(
  sectionMarkdown: string,
  quote: string,
  prefix: string,
  suffix: string,
) {
  const trimmedQuote = trimSelectionQuote(quote)
  if (!trimmedQuote) {
    return null
  }

  const directIndex = sectionMarkdown.indexOf(trimmedQuote)
  if (directIndex !== -1) {
    return { start: directIndex, length: trimmedQuote.length }
  }

  const pattern = quoteToPattern(trimmedQuote)
  if (!pattern) {
    return null
  }

  const matches = [...sectionMarkdown.matchAll(pattern)]
  if (matches.length === 0) {
    return null
  }

  if (matches.length === 1) {
    const match = matches[0]
    return { start: match.index ?? 0, length: match[0].length }
  }

  let best = matches[0]
  let bestScore = -1
  for (const match of matches) {
    const start = match.index ?? 0
    const score = scoreCandidate(sectionMarkdown, start, match[0].length, prefix, suffix)
    if (score > bestScore) {
      bestScore = score
      best = match
    }
  }

  return { start: best.index ?? 0, length: best[0].length }
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
  const match = findQuoteRangeInSection(sectionMarkdown, trimmedQuote, prefix, suffix)

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
      const { start, end } = comment.anchor
      return start >= 0 && end > start && end <= markdown.length
    })
    .sort((left, right) => right.anchor.start - left.anchor.start)

  let result = markdown
  for (const comment of validComments) {
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
