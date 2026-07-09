import { headingId } from './headings'

export type SearchSection = {
  id: string
  text: string
  level: number
  body: string
  index: number
}

export type SearchResult = {
  id: string
  text: string
  level: number
  score: number
  snippet: string
  reason: string
}

const STOP_WORDS = new Set([
  'a',
  'an',
  'and',
  'are',
  'as',
  'at',
  'be',
  'by',
  'for',
  'from',
  'how',
  'in',
  'is',
  'it',
  'of',
  'on',
  'or',
  'that',
  'the',
  'this',
  'to',
  'with',
])

function normalizeSearchText(value: string) {
  return value
    .replace(/ı/g, 'i')
    .replace(/İ/g, 'i')
    .replace(/ç/g, 'c')
    .replace(/Ç/g, 'c')
    .replace(/ğ/g, 'g')
    .replace(/Ğ/g, 'g')
    .replace(/ş/g, 's')
    .replace(/Ş/g, 's')
    .replace(/ö/g, 'o')
    .replace(/Ö/g, 'o')
    .replace(/ü/g, 'u')
    .replace(/Ü/g, 'u')
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
}

function compactWhitespace(value: string) {
  return value.replace(/\s+/g, ' ').trim()
}

function tokenizeQuery(query: string) {
  return normalizeSearchText(query)
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((token) => token.length >= 2 && !STOP_WORDS.has(token))
}

function countOccurrences(haystack: string, needle: string) {
  if (!needle) {
    return 0
  }

  let count = 0
  let fromIndex = 0

  while (fromIndex < haystack.length) {
    const found = haystack.indexOf(needle, fromIndex)
    if (found === -1) {
      break
    }
    count += 1
    fromIndex = found + needle.length
  }

  return count
}

function countWholeWordOccurrences(haystack: string, needle: string) {
  if (!needle) {
    return 0
  }

  const escaped = needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])`, 'g')
  return [...haystack.matchAll(pattern)].length
}

function hasWholePhraseMatch(haystack: string, phrase: string) {
  if (!phrase) {
    return false
  }

  const escaped = phrase.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  const pattern = new RegExp(`(^|[^\\w])${escaped}(?=$|[^\\w])`)
  return pattern.test(haystack)
}

function sliceSnippet(text: string, matchIndex: number, matchLength: number) {
  if (!text.trim()) {
    return ''
  }

  const start = Math.max(0, matchIndex - 68)
  const end = Math.min(text.length, matchIndex + matchLength + 84)
  const prefix = start > 0 ? '...' : ''
  const suffix = end < text.length ? '...' : ''
  return `${prefix}${text.slice(start, end).trim()}${suffix}`
}

function buildSnippet(body: string, normalizedBody: string, normalizedQuery: string, tokens: string[]) {
  const plainBody = compactWhitespace(body.replace(/[#>*`_[\]-]+/g, ' '))
  if (!plainBody) {
    return ''
  }

  const plainBodyNormalized = compactWhitespace(normalizeSearchText(plainBody))
  const phraseIndex = normalizedQuery ? plainBodyNormalized.indexOf(normalizedQuery) : -1
  if (phraseIndex >= 0) {
    return sliceSnippet(plainBody, phraseIndex, normalizedQuery.length)
  }

  for (const token of tokens) {
    const tokenIndex = normalizedBody.indexOf(token)
    if (tokenIndex >= 0) {
      return sliceSnippet(plainBody, tokenIndex, token.length)
    }
  }

  return sliceSnippet(plainBody, 0, 0)
}

function classifyReason(
  headingMatch: boolean,
  exactHeadingMatch: boolean,
  allTokensInHeading: boolean,
  bodyPhraseMatch: boolean,
) {
  if (exactHeadingMatch) {
    return 'Exact heading match'
  }
  if (headingMatch || allTokensInHeading) {
    return 'Strong heading match'
  }
  if (bodyPhraseMatch) {
    return 'Phrase found in section'
  }
  return 'Relevant section'
}

export function buildSearchSections(markdown: string): SearchSection[] {
  const lines = markdown.split('\n')
  const headings: Array<{ id: string; text: string; level: number; lineIndex: number }> = []
  const headingCounts = new Map<string, number>()
  let inFence = false
  let fenceToken = ''

  for (let index = 0; index < lines.length; index += 1) {
    const line = lines[index]
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const token = fenceMatch[1].slice(0, 3)
      if (!inFence) {
        inFence = true
        fenceToken = token
      } else if (line.trim().startsWith(fenceToken)) {
        inFence = false
        fenceToken = ''
      }
      continue
    }

    if (inFence) {
      continue
    }

    const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line)
    if (!headingMatch) {
      continue
    }

    const level = headingMatch[1].length
    const text = headingMatch[2].trim()
    if (!text) {
      continue
    }

    const baseId = headingId(text)
    const seenCount = headingCounts.get(baseId) ?? 0
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`
    headingCounts.set(baseId, seenCount + 1)
    headings.push({ id, text, level, lineIndex: index })
  }

  return headings.map((heading, index) => {
    let endLine = lines.length
    for (let nextIndex = index + 1; nextIndex < headings.length; nextIndex += 1) {
      const nextHeading = headings[nextIndex]
      if (nextHeading.level <= heading.level) {
        endLine = nextHeading.lineIndex
        break
      }
    }

    const rawBodyLines = lines.slice(heading.lineIndex + 1, endLine)
    const bodyWithoutNestedHeadings = rawBodyLines
      .filter((line) => !/^\s*#{1,6}\s+/.test(line))
      .join('\n')
      .trim()

    return {
      id: heading.id,
      text: heading.text,
      level: heading.level,
      body: bodyWithoutNestedHeadings,
      index,
    }
  })
}

export function searchSections(sections: SearchSection[], query: string, limit = 12): SearchResult[] {
  const trimmedQuery = compactWhitespace(query)
  const normalizedQuery = compactWhitespace(normalizeSearchText(trimmedQuery))
  const tokens = tokenizeQuery(trimmedQuery)

  if (!normalizedQuery && tokens.length === 0) {
    return []
  }

  const hasSubSections = sections.some((section) => section.level > 1)

  const results = sections
    .map((section) => {
      const normalizedHeading = compactWhitespace(normalizeSearchText(section.text))
      const normalizedBody = compactWhitespace(normalizeSearchText(section.body))
      const exactHeadingMatch = normalizedHeading === normalizedQuery && Boolean(normalizedQuery)
      const headingStartsWith =
        Boolean(normalizedQuery) &&
        (normalizedHeading === normalizedQuery ||
          normalizedHeading.startsWith(`${normalizedQuery} `))
      const headingMatch =
        Boolean(normalizedQuery) && hasWholePhraseMatch(normalizedHeading, normalizedQuery)
      const bodyPhraseMatch =
        Boolean(normalizedQuery) && hasWholePhraseMatch(normalizedBody, normalizedQuery)
      const allTokensInHeading =
        tokens.length > 0 &&
        tokens.every((token) => countWholeWordOccurrences(normalizedHeading, token) > 0)
      const allTokensInSection =
        tokens.length > 0 &&
        tokens.every(
          (token) =>
            countWholeWordOccurrences(normalizedHeading, token) > 0 ||
            countWholeWordOccurrences(normalizedBody, token) > 0,
        )
      const anyTokenInHeading =
        tokens.length > 0 &&
        tokens.some((token) => countWholeWordOccurrences(normalizedHeading, token) > 0)
      const anyTokenInBody =
        tokens.length > 0 &&
        tokens.some((token) => countWholeWordOccurrences(normalizedBody, token) > 0)
      const partialTokenInHeading =
        tokens.length > 0 && tokens.some((token) => normalizedHeading.includes(token))
      const partialTokenInBody =
        tokens.length > 0 && tokens.some((token) => normalizedBody.includes(token))
      const hasAnyMatch =
        exactHeadingMatch ||
        headingStartsWith ||
        headingMatch ||
        bodyPhraseMatch ||
        allTokensInHeading ||
        allTokensInSection ||
        anyTokenInHeading ||
        anyTokenInBody ||
        partialTokenInHeading ||
        partialTokenInBody

      let score = 0

      if (!hasAnyMatch) {
        return null
      }

      const headingIncludesSearch =
        Boolean(normalizedQuery) && hasWholePhraseMatch(normalizedHeading, normalizedQuery)
      const headingIncludesAnyToken =
        tokens.length > 0 &&
        tokens.some((token) => countWholeWordOccurrences(normalizedHeading, token) > 0)
      const canBoostByHeading = headingIncludesSearch || headingIncludesAnyToken

      // Avoid broad root/container matches when we already have finer-grained
      // sections and this top-level heading itself does not match the query.
      if (hasSubSections && section.level === 1 && !canBoostByHeading) {
        return null
      }

      if (exactHeadingMatch) {
        score += 220
      } else if (headingStartsWith) {
        score += 150
      } else if (headingMatch) {
        score += 110
      }

      if (bodyPhraseMatch) {
        score += 50
      }

      if (canBoostByHeading && allTokensInHeading) {
        score += 70
      } else if (allTokensInSection) {
        score += 35
      }

      for (const token of tokens) {
        const headingWholeWordCount = countWholeWordOccurrences(normalizedHeading, token)
        const bodyWholeWordCount = countWholeWordOccurrences(normalizedBody, token)
        const headingPartialCount = countOccurrences(normalizedHeading, token)
        const bodyPartialCount = countOccurrences(normalizedBody, token)

        if (canBoostByHeading) {
          score += Math.min(4, headingWholeWordCount) * 28
          score += Math.min(4, Math.max(0, headingPartialCount - headingWholeWordCount)) * 3
        }
        score += Math.min(6, bodyWholeWordCount) * 9
        score += Math.min(6, Math.max(0, bodyPartialCount - bodyWholeWordCount)) * 2
      }

      if (!anyTokenInHeading && !anyTokenInBody && (partialTokenInHeading || partialTokenInBody)) {
        score += 4
      }

      if (canBoostByHeading) {
        if (section.level === 1) {
          score += 10
        } else if (section.level === 2) {
          score += 14
        } else {
          score += 6
        }
      }

      score += Math.max(0, 10 - section.index)

      if (score <= 0) {
        return null
      }

      return {
        id: section.id,
        text: section.text,
        level: section.level,
        score,
        snippet: buildSnippet(section.body, normalizedBody, normalizedQuery, tokens),
        reason: classifyReason(
          headingMatch || headingStartsWith,
          exactHeadingMatch,
          allTokensInHeading,
          bodyPhraseMatch,
        ),
      }
    })
    .filter((result): result is SearchResult => Boolean(result))
    .sort((left, right) => {
      if (right.score !== left.score) {
        return right.score - left.score
      }
      if (left.level !== right.level) {
        return left.level - right.level
      }
      return left.text.localeCompare(right.text)
    })

  return results.slice(0, limit)
}
