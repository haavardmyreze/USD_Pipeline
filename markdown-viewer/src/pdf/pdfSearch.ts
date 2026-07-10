import type { PdfPageIndex } from './pdfDocument'

export type PdfSearchResult = {
  id: string
  page: number
  text: string
  score: number
  snippet: string
  reason: string
}

function normalizeSearchText(value: string) {
  return value
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function tokenizeQuery(query: string) {
  return normalizeSearchText(query)
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2)
}

function buildSnippet(text: string, query: string) {
  const tokens = tokenizeQuery(query)
  const lower = text.toLowerCase()
  let index = -1

  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found !== -1) {
      index = found
      break
    }
  }

  if (index === -1) {
    return text.slice(0, 140)
  }

  const start = Math.max(0, index - 48)
  const end = Math.min(text.length, index + 92)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < text.length ? '…' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

export function searchPdfPages(pages: PdfPageIndex[], query: string): PdfSearchResult[] {
  const trimmed = query.trim()
  if (!trimmed) {
    return []
  }

  const normalizedQuery = normalizeSearchText(trimmed)
  const tokens = tokenizeQuery(trimmed)
  const results: PdfSearchResult[] = []

  for (const page of pages) {
    const normalizedText = normalizeSearchText(page.text)
    if (!normalizedText) {
      continue
    }

    let score = 0
    if (normalizedText.includes(normalizedQuery)) {
      score += 80
    }

    for (const token of tokens) {
      if (normalizedText.includes(token)) {
        score += 18
      }
    }

    if (score <= 0) {
      continue
    }

    results.push({
      id: `pdf-page-${page.pageNumber}`,
      page: page.pageNumber,
      text: `Page ${page.pageNumber}`,
      score,
      snippet: buildSnippet(page.text, trimmed),
      reason: normalizedText.includes(normalizedQuery) ? 'Exact page match' : 'Partial page match',
    })
  }

  return results.sort((left, right) => right.score - left.score)
}
