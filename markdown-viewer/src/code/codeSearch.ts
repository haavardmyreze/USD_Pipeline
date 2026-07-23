// Line-oriented search for the code reader. Results are whole lines that match
// the query; the reader lists them and jumps + flashes on selection.

export type CodeSearchResult = {
  id: string
  line: number
  lineNumber: number
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
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)
}

function buildSnippet(value: string, query: string) {
  const trimmed = value.trim()
  const lower = trimmed.toLowerCase()
  const needle = normalizeSearchText(query.trim())
  let index = needle ? lower.indexOf(needle) : -1

  if (index === -1) {
    for (const token of tokenizeQuery(query)) {
      const found = lower.indexOf(token)
      if (found !== -1) {
        index = found
        break
      }
    }
  }

  if (index === -1) {
    return trimmed.slice(0, 120)
  }

  const start = Math.max(0, index - 32)
  const end = Math.min(trimmed.length, index + 88)
  const prefix = start > 0 ? '…' : ''
  const suffix = end < trimmed.length ? '…' : ''
  return `${prefix}${trimmed.slice(start, end)}${suffix}`
}

/** True when a single line matches the query (used to tag hit lines). */
export function lineMatchesQuery(line: string, query: string) {
  const trimmed = query.trim()
  if (!trimmed || !line) {
    return false
  }

  const normalizedLine = normalizeSearchText(line)
  const normalizedQuery = normalizeSearchText(trimmed)
  if (normalizedQuery && normalizedLine.includes(normalizedQuery)) {
    return true
  }

  return tokenizeQuery(trimmed).some((token) => normalizedLine.includes(token))
}

export function searchCode(content: string, query: string): CodeSearchResult[] {
  const trimmed = query.trim()
  if (!trimmed || !content) {
    return []
  }

  const normalizedQuery = normalizeSearchText(trimmed)
  const tokens = tokenizeQuery(trimmed)
  const lines = content.split('\n')
  const results: CodeSearchResult[] = []

  for (let line = 0; line < lines.length; line += 1) {
    const value = lines[line]
    const normalizedValue = normalizeSearchText(value)
    if (!normalizedValue) {
      continue
    }

    let score = 0
    if (normalizedQuery && normalizedValue.includes(normalizedQuery)) {
      score += 80
    }
    for (const token of tokens) {
      if (normalizedValue.includes(token)) {
        score += 16
      }
    }

    if (score <= 0) {
      continue
    }

    results.push({
      id: `code-line-${line}`,
      line,
      lineNumber: line + 1,
      snippet: buildSnippet(value, trimmed),
      score,
    })
  }

  // Keep document order for readability (line numbers ascending).
  return results
}
