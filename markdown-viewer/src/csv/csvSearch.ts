import type { CsvDocumentIndex } from './csvDocument'
import { csvColumnLabel } from './csvDocument'

export type CsvSearchResult = {
  id: string
  row: number
  col: number
  columnName: string
  value: string
  snippet: string
  score: number
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

function buildSnippet(value: string, query: string) {
  const tokens = tokenizeQuery(query)
  const lower = value.toLowerCase()
  let index = -1

  for (const token of tokens) {
    const found = lower.indexOf(token)
    if (found !== -1) {
      index = found
      break
    }
  }

  if (index === -1) {
    return value.slice(0, 120)
  }

  const start = Math.max(0, index - 40)
  const end = Math.min(value.length, index + 80)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < value.length ? '…' : ''
  return `${prefix}${value.slice(start, end).trim()}${suffix}`
}

export function searchCsv(index: CsvDocumentIndex, query: string): CsvSearchResult[] {
  const trimmed = query.trim()
  if (!trimmed || index.rowCount === 0) {
    return []
  }

  const normalizedQuery = normalizeSearchText(trimmed)
  const tokens = tokenizeQuery(trimmed)
  const results: CsvSearchResult[] = []

  for (let row = 0; row < index.rows.length; row += 1) {
    const rowValues = index.rows[row]

    for (let col = 0; col < rowValues.length; col += 1) {
      const value = rowValues[col] ?? ''
      const normalizedValue = normalizeSearchText(value)
      if (!normalizedValue) {
        continue
      }

      let score = 0
      if (normalizedValue.includes(normalizedQuery)) {
        score += 80
      }

      for (const token of tokens) {
        if (normalizedValue.includes(token)) {
          score += 18
        }
      }

      if (score <= 0) {
        continue
      }

      results.push({
        id: `csv-cell-${row}-${col}`,
        row,
        col,
        columnName: index.headers[col] ?? csvColumnLabel(col),
        value,
        snippet: buildSnippet(value, trimmed),
        score,
      })
    }
  }

  return results.sort((left, right) => right.score - left.score)
}

export function cellMatchesQuery(value: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed || !value) {
    return false
  }

  const normalizedValue = normalizeSearchText(value)
  const normalizedQuery = normalizeSearchText(trimmed)
  if (normalizedValue.includes(normalizedQuery)) {
    return true
  }

  return tokenizeQuery(trimmed).some((token) => normalizedValue.includes(token))
}
