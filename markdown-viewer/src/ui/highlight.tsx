// Shared search-match highlighting used by every search panel.

export function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function highlightMatches(text: string, query: string) {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  if (!text || tokens.length === 0) {
    return text
  }

  const pattern = new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
  const exactPattern = new RegExp(`^(${tokens.map(escapeRegExp).join('|')})$`, 'i')
  const parts = text.split(pattern)

  return parts.map((part, index) =>
    exactPattern.test(part) ? <mark key={`${part}-${index}`}>{part}</mark> : part,
  )
}
