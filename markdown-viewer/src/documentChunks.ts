import { formatCharCount, MAX_CONTEXT_CHARS } from './contextBudget'
import { headingId, type SectionRef } from './headings'

export type DocChunk = {
  heading: string
  level: number
  content: string
}

const STOP_WORDS = new Set([
  'the',
  'and',
  'for',
  'are',
  'but',
  'not',
  'you',
  'all',
  'can',
  'had',
  'her',
  'was',
  'one',
  'our',
  'out',
  'has',
  'have',
  'been',
  'were',
  'they',
  'this',
  'that',
  'with',
  'from',
  'what',
  'when',
  'where',
  'which',
  'who',
  'will',
  'your',
  'how',
  'does',
  'about',
  'into',
  'than',
  'then',
  'them',
  'these',
  'those',
  'there',
  'their',
  'would',
  'should',
  'could',
])

function tokenize(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, ' ')
    .split(/\s+/)
    .filter((word) => word.length > 2 && !STOP_WORDS.has(word))
}

/** Split the document into sections at h1–h3 boundaries. */
export function chunkDocument(markdown: string): DocChunk[] {
  const lines = markdown.split('\n')
  const chunks: DocChunk[] = []
  let currentHeading = 'Introduction'
  let currentLevel = 1
  let currentLines: string[] = []
  let inFence = false
  let fenceToken = ''

  const flush = () => {
    const content = currentLines.join('\n').trim()
    if (content) {
      chunks.push({
        heading: currentHeading,
        level: currentLevel,
        content,
      })
    }
    currentLines = []
  }

  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const token = fenceMatch[1]
      if (!inFence) {
        inFence = true
        fenceToken = token.slice(0, 3)
      } else if (line.trim().startsWith(fenceToken)) {
        inFence = false
        fenceToken = ''
      }
      currentLines.push(line)
      continue
    }

    if (!inFence) {
      const headingMatch = /^(#{1,3})\s+(.+)$/.exec(line)
      if (headingMatch) {
        flush()
        currentLevel = headingMatch[1].length
        currentHeading = headingMatch[2].trim()
        currentLines.push(line)
        continue
      }
    }

    currentLines.push(line)
  }

  flush()
  return chunks
}

/** Keyword scoring over headings + body — good enough without embeddings. */
export function retrieveRelevantChunks(
  chunks: DocChunk[],
  query: string,
  maxChars = 6_000,
  maxChunks = 4,
) {
  if (chunks.length === 0) {
    return []
  }

  const queryTokens = tokenize(query)
  if (queryTokens.length === 0) {
    return chunks.slice(0, Math.min(3, chunks.length))
  }

  const scored = chunks
    .map((chunk) => {
      const headingLower = chunk.heading.toLowerCase()
      const contentLower = chunk.content.toLowerCase()
      let score = 0

      for (const token of queryTokens) {
        if (headingLower.includes(token)) {
          score += 5
        }
        const occurrences = contentLower.split(token).length - 1
        score += Math.min(occurrences, 4)
      }

      return { chunk, score }
    })
    .sort((left, right) => right.score - left.score)

  const selected: DocChunk[] = []
  let chars = 0

  for (const { chunk, score } of scored) {
    if (selected.length >= maxChunks) {
      break
    }
    if (score === 0 && selected.length >= 2) {
      continue
    }

    const nextChars = chars + chunk.content.length
    if (nextChars > maxChars && selected.length > 0) {
      continue
    }

    selected.push(chunk)
    chars = nextChars
  }

  if (selected.length === 0) {
    return chunks.slice(0, Math.min(2, chunks.length))
  }

  return selected
}

export function formatChunksForPrompt(chunks: DocChunk[], maxChunkChars = 2200) {
  return chunks
    .map(
      (chunk) =>
        `### ${chunk.heading}\n${chunk.content.slice(0, maxChunkChars)}`,
    )
    .join('\n\n')
}

const OVERVIEW_PATTERNS = [
  /\bwhat is (this|the) (doc(ument)?|guide|file) about\b/i,
  /\bwhat('s| is) this (doc(ument)?|guide) (about|for)\b/i,
  /\b(summarize|summary|overview|tl;?dr)\b/i,
  /\bwhat does (this|the) (doc(ument)?|guide) cover\b/i,
  /\bexplain (this|the) (doc(ument)?|guide)\b/i,
  /\b(main topics?|key topics?|purpose of)\b/i,
  /\bwho is (this|it) (for|aimed at)\b/i,
  /\bhigh[- ]level (overview|summary)\b/i,
]

export function isOverviewQuestion(query: string) {
  return OVERVIEW_PATTERNS.some((pattern) => pattern.test(query))
}

/** Compact table of contents from all section headings. */
export function buildDocumentOutline(chunks: DocChunk[]) {
  if (chunks.length === 0) {
    return '(No sections found)'
  }

  return chunks
    .map((chunk) => `${'  '.repeat(Math.max(0, chunk.level - 1))}- ${chunk.heading}`)
    .join('\n')
}

/** Opening sections — title, TOC, and how-to-use material. */
export function buildIntroExcerpt(chunks: DocChunk[], maxChars = 5_000) {
  const parts: string[] = []
  let chars = 0

  for (const chunk of chunks) {
    const block = `### ${chunk.heading}\n${chunk.content}`
    if (parts.length > 0 && chars + block.length > maxChars) {
      break
    }
    parts.push(block)
    chars += block.length
    if (parts.length >= 6) {
      break
    }
  }

  return parts.join('\n\n')
}

function chunkKey(chunk: DocChunk) {
  return `${chunk.level}:${chunk.heading}`
}

function mergeChunks(
  primary: DocChunk[],
  secondary: DocChunk[],
  maxChars: number,
  maxChunks: number,
) {
  const merged: DocChunk[] = []
  const seen = new Set<string>()
  let chars = 0

  const add = (chunk: DocChunk) => {
    const key = chunkKey(chunk)
    if (seen.has(key)) {
      return
    }
    const nextChars = chars + chunk.content.length
    if (merged.length > 0 && nextChars > maxChars) {
      return
    }
    if (merged.length >= maxChunks) {
      return
    }
    seen.add(key)
    merged.push(chunk)
    chars = nextChars
  }

  for (const chunk of primary) {
    add(chunk)
  }
  for (const chunk of secondary) {
    add(chunk)
  }

  return merged
}

/** Sample the start of major sections for broad overview questions. */
export function retrieveOverviewChunks(chunks: DocChunk[], maxChars = 10_000) {
  const selected: DocChunk[] = []
  let chars = 0

  for (const chunk of chunks.slice(0, 6)) {
    selected.push(chunk)
    chars += chunk.content.length
  }

  const seen = new Set(selected.map(chunkKey))
  for (const chunk of chunks) {
    if (chunk.level > 2) {
      continue
    }
    if (seen.has(chunkKey(chunk))) {
      continue
    }

    const snippet: DocChunk = {
      ...chunk,
      content: chunk.content.slice(0, 700),
    }
    const nextChars = chars + snippet.content.length
    if (nextChars > maxChars && selected.length > 0) {
      continue
    }

    selected.push(snippet)
    seen.add(chunkKey(chunk))
    chars = nextChars
  }

  return selected
}

const SKIP_NAV_HEADINGS = new Set([
  'introduction',
  'table of contents',
  'how to use this guide',
])

function sectionsFromChunks(chunks: DocChunk[], max = 4): SectionRef[] {
  const seen = new Set<string>()
  const sections: SectionRef[] = []

  for (const chunk of chunks) {
    const key = chunk.heading.toLowerCase()
    if (SKIP_NAV_HEADINGS.has(key)) {
      continue
    }

    const id = headingId(chunk.heading)
    if (seen.has(id)) {
      continue
    }

    seen.add(id)
    sections.push({ id, text: chunk.heading, level: chunk.level })
    if (sections.length >= max) {
      break
    }
  }

  return sections
}

export type QuestionContext = {
  contextBlock: string
  relatedSections: SectionRef[]
}

export function buildContextForQuestion(chunks: DocChunk[], query: string): QuestionContext {
  const outline = buildDocumentOutline(chunks)
  const intro = buildIntroExcerpt(chunks)
  const overview = isOverviewQuestion(query)

  const relevant = overview
    ? retrieveOverviewChunks(chunks)
    : retrieveRelevantChunks(chunks, query, 5_000, 4)

  const introChunks = chunks.slice(0, Math.min(3, chunks.length))
  const excerpts = mergeChunks(
    introChunks,
    relevant,
    overview ? 11_000 : 7_500,
    overview ? 12 : 7,
  )

  const excerptBlock = formatChunksForPrompt(
    excerpts,
    overview ? 2800 : 2200,
  )

  const contextBlock = [
    '--- DOCUMENT OUTLINE ---',
    outline,
    '--- END OUTLINE ---',
    '',
    '--- INTRODUCTION ---',
    intro,
    '--- END INTRODUCTION ---',
    '',
    overview ? '--- KEY SECTIONS ---' : '--- RELEVANT SECTIONS ---',
    excerptBlock,
    overview ? '--- END KEY SECTIONS ---' : '--- END RELEVANT SECTIONS ---',
  ].join('\n')

  const relatedSections = sectionsFromChunks(
    overview ? relevant.filter((chunk) => chunk.level <= 2) : relevant,
    overview ? 5 : 4,
  )

  return { contextBlock, relatedSections }
}

/** Below this size we send the full document once per session. */
export const FULL_DOCUMENT_CHAR_LIMIT = 24_000

export type DocumentContextMode = 'full' | 'excerpts'

export function shouldUseFullDocument(markdown: string) {
  return markdown.length <= FULL_DOCUMENT_CHAR_LIMIT
}

export type DocumentContextInfo = {
  mode: DocumentContextMode
  documentChars: number
  summary: string
  detail: string
}

export function getDocumentContextInfo(markdown: string): DocumentContextInfo {
  const documentChars = markdown.length
  const sizeLabel = formatCharCount(documentChars)
  const limitLabel = formatCharCount(FULL_DOCUMENT_CHAR_LIMIT)
  const capLabel = formatCharCount(MAX_CONTEXT_CHARS)
  const budgetNote = `Chat history uses whatever space remains in a ${capLabel} total context budget.`

  if (shouldUseFullDocument(markdown)) {
    return {
      mode: 'full',
      documentChars,
      summary: `Full document · ${sizeLabel}`,
      detail:
        `The complete document is sent on your first question and reused for follow-ups in this chat. ${budgetNote}`,
    }
  }

  return {
    mode: 'excerpts',
    documentChars,
    summary: `Relevant sections · ${sizeLabel} document`,
    detail: `Documents over ${limitLabel} use excerpts. Each question sends the outline, introduction, and about 5–7.5k characters of matching sections (up to ~11k for overview questions). ${budgetNote}`,
  }
}

export function buildFullDocumentSystemPrompt(
  fileName: string,
  markdown: string,
  linkGuide = '',
) {
  const lines = [
    `You are a helpful assistant answering questions about the Markdown document "${fileName}".`,
    'The complete document is provided below. Answer from this document only.',
    'If the answer is not in the document, say that clearly and ask a brief clarifying follow-up.',
    'Do not invent or assume rules that are not explicitly documented.',
    'Give practical, clear answers. For overview questions, summarize the document structure and purpose.',
    'Start with a direct answer. Use bullets only when they improve clarity (for steps, options, or comparisons).',
    'Whenever you discuss content from a section, add an inline markdown link: [Exact heading](#section-id).',
    'Use multiple section links in a single answer when your reply draws from more than one place.',
    'Put a section link near the first mention of each section you cite — readers should always be able to jump to source context.',
    'Use section ids exactly as provided in the section index, including numeric prefixes and -2 suffixes for duplicate headings.',
    'For specific technical claims, include a short quote from the document when helpful.',
  ]

  if (linkGuide) {
    lines.push('', '--- SECTION INDEX ---', linkGuide, '--- END SECTION INDEX ---')
  }

  lines.push('', '--- FULL DOCUMENT ---', markdown, '--- END DOCUMENT ---')
  return lines.join('\n')
}

export function buildExcerptSystemPrompt(
  fileName: string,
  contextBlock: string,
  overview = false,
  linkGuide = '',
) {
  const lines = [
    `You are a helpful assistant answering questions about the Markdown document "${fileName}".`,
    'You receive a document outline, introduction, and section excerpts — not the full file.',
    'If the answer is not in the provided material, say that clearly and ask a brief clarifying follow-up.',
    'Do not invent or assume rules that are not explicitly documented.',
    overview
      ? 'This is an overview question: synthesize a useful summary from the outline, introduction, and key sections. Describe what the guide covers, who it is for, and the main topics.'
      : 'Answer using the provided material. Combine information across sections when needed.',
    'Start with a direct answer. Use bullets only when they improve clarity (for steps, options, or comparisons).',
    'Whenever you discuss content from a section, add an inline markdown link: [Exact heading](#section-id).',
    'Use multiple section links in a single answer when your reply draws from more than one place.',
    'Put a section link near the first mention of each section you cite — readers should always be able to jump to source context.',
    'Use the exact heading text and section ids from the section index, including numeric prefixes and -2 suffixes for duplicate headings.',
    'You may link to sections that are listed in the index even if their full text is not in the excerpts.',
    'For specific technical claims, include a short quote from the provided material when helpful.',
  ]

  if (linkGuide) {
    lines.push('', '--- SECTION INDEX ---', linkGuide, '--- END SECTION INDEX ---')
  }

  lines.push('', contextBlock)
  return lines.join('\n')
}
