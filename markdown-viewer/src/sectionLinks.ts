import { headingId, type SectionRef } from './headings'

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FENCED_CODE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
const INLINE_CODE_RE = /(`[^`\n]+`)/g
const EXISTING_LINK_RE = /(\[[^\]]+\]\([^)]+\))/g
const MARKDOWN_SECTION_LINK_RE = /\[([^\]]+)\]\(#([^)]+)\)/g

function isGfmTableRow(line: string) {
  const trimmed = line.trim()
  return trimmed.startsWith('|') && trimmed.endsWith('|') && trimmed.length > 2
}

function partitionGfmTables(text: string) {
  const lines = text.split('\n')
  const segments: Array<{ kind: 'text' | 'table'; content: string }> = []
  let currentKind: 'text' | 'table' = 'text'
  let currentLines: string[] = []

  const flush = () => {
    if (currentLines.length === 0) {
      return
    }

    segments.push({
      kind: currentKind,
      content: currentLines.join('\n'),
    })
    currentLines = []
  }

  for (const line of lines) {
    const kind = isGfmTableRow(line) ? 'table' : 'text'
    if (kind !== currentKind) {
      flush()
      currentKind = kind
    }
    currentLines.push(line)
  }

  flush()
  return segments
}

const MIN_LINKABLE_HEADING_CHARS = 3
const DEFAULT_LINK_GUIDE_MAX = 60
const MAX_FOOTER_SECTIONS = 12

function normalizeSectionLabel(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/^\d+[\.)]?\s+/, '')
}

function sectionMentionPatterns(section: SectionRef) {
  const patterns = [section.text]
  const withoutNumber = section.text.replace(/^\d+[\.)]\s+/, '').trim()
  if (withoutNumber !== section.text && withoutNumber.length >= MIN_LINKABLE_HEADING_CHARS) {
    patterns.push(withoutNumber)
  }
  return patterns
}

function resolveSectionByHrefId(rawId: string, sections: SectionRef[]) {
  const id = decodeURIComponent(rawId.trim())
  if (!id) {
    return null
  }

  const exact = sections.find((section) => section.id === id)
  if (exact) {
    return exact
  }

  const slugMatch = sections.find((section) => headingId(section.text) === id)
  if (slugMatch) {
    return slugMatch
  }

  const suffixMatches = sections.filter((section) => section.id.endsWith(`-${id}`))
  if (suffixMatches.length === 1) {
    return suffixMatches[0]
  }

  return null
}

function resolveSectionByLabel(label: string, sections: SectionRef[]) {
  const normalizedLabel = normalizeSectionLabel(label)
  if (!normalizedLabel) {
    return null
  }

  return (
    sections.find((section) => normalizeSectionLabel(section.text) === normalizedLabel) ?? null
  )
}

function sectionMentionedInText(content: string, section: SectionRef) {
  for (const pattern of sectionMentionPatterns(section)) {
    if (pattern.length < MIN_LINKABLE_HEADING_CHARS) {
      continue
    }

    const escaped = escapeRegExp(pattern)
    const boundaryPattern = new RegExp(`(?:^|[^\\w])${escaped}(?:[^\\w]|$)`, 'i')
    if (boundaryPattern.test(content)) {
      return true
    }
  }

  return false
}

export function orderSectionsByDocument(
  referenced: SectionRef[],
  documentOrder: SectionRef[],
) {
  const order = new Map(documentOrder.map((section, index) => [section.id, index]))
  return [...referenced].sort(
    (left, right) => (order.get(left.id) ?? 9999) - (order.get(right.id) ?? 9999),
  )
}

/** Collect every section referenced in an assistant reply. */
export function extractReferencedSections(content: string, sections: SectionRef[]) {
  if (!content.trim() || sections.length === 0) {
    return []
  }

  const seen = new Set<string>()
  const referenced: SectionRef[] = []

  const add = (section: SectionRef | null | undefined) => {
    if (!section || seen.has(section.id)) {
      return
    }
    seen.add(section.id)
    referenced.push(section)
  }

  for (const match of content.matchAll(MARKDOWN_SECTION_LINK_RE)) {
    const label = match[1] ?? ''
    const rawId = match[2] ?? ''
    add(resolveSectionByHrefId(rawId, sections) ?? resolveSectionByLabel(label, sections))
  }

  const sorted = [...sections].sort((left, right) => right.text.length - left.text.length)
  for (const section of sorted) {
    if (seen.has(section.id)) {
      continue
    }
    if (sectionMentionedInText(content, section)) {
      add(section)
    }
  }

  return orderSectionsByDocument(referenced, sections)
}

function linkifyPlainSegment(text: string, sections: SectionRef[]) {
  let result = text

  for (const section of sections) {
    for (const pattern of sectionMentionPatterns(section)) {
      if (pattern.length < MIN_LINKABLE_HEADING_CHARS) {
        continue
      }

      const escaped = escapeRegExp(pattern)
      result = result.replace(
        new RegExp(`\\*\\*(${escaped})\\*\\*`, 'gi'),
        `[$1](#${section.id})`,
      )
    }
  }

  const withoutLinks = result.split(EXISTING_LINK_RE)
  return withoutLinks
    .map((segment) => {
      if (segment.startsWith('[')) {
        return segment
      }

      let next = segment
      for (const section of sections) {
        for (const pattern of sectionMentionPatterns(section)) {
          if (pattern.length < MIN_LINKABLE_HEADING_CHARS) {
            continue
          }

          const escaped = escapeRegExp(pattern)
          next = next.replace(
            new RegExp(`(?<!\\[)(${escaped})(?!\\]\\()`, 'gi'),
            `[$1](#${section.id})`,
          )
        }
      }
      return next
    })
    .join('')
}

/** Turn section name mentions into markdown links — skips code and existing links. */
export function linkifySectionMentions(content: string, sections: SectionRef[]) {
  if (!content.trim() || sections.length === 0) {
    return content
  }

  const sorted = [...sections].sort((left, right) => right.text.length - left.text.length)
  const fencedParts = content.split(FENCED_CODE_RE)

  return fencedParts
    .map((part) => {
      if (part.startsWith('```') || part.startsWith('~~~')) {
        return part
      }

      const inlineParts = part.split(INLINE_CODE_RE)
      return inlineParts
        .map((segment) => {
          if (segment.startsWith('`')) {
            return segment
          }

          return partitionGfmTables(segment)
            .map((block) =>
              block.kind === 'table'
                ? block.content
                : linkifyPlainSegment(block.content, sorted),
            )
            .join('\n')
        })
        .join('')
    })
    .join('')
}

export function formatSectionLinkGuide(sections: SectionRef[], max = DEFAULT_LINK_GUIDE_MAX) {
  const unique = new Map<string, SectionRef>()
  for (const section of sections) {
    if (!unique.has(section.id)) {
      unique.set(section.id, section)
    }
  }

  const lines = [...unique.values()].slice(0, max).map(
    (section) => `- [${section.text}](#${section.id})`,
  )

  if (lines.length === 0) {
    return ''
  }

  const omitted = unique.size - lines.length
  const footer =
    omitted > 0
      ? `(${omitted} more section${omitted === 1 ? '' : 's'} exist — use the same [Heading](#section-id) format.)`
      : ''

  return [
    'Section index — link inline whenever you cite document content. Use multiple links per answer when needed.',
    'Copy these markdown links exactly (heading text and section id), including numeric prefixes and -2 suffixes for duplicates.',
    ...lines,
    footer,
  ]
    .filter(Boolean)
    .join('\n')
}

export const MAX_ASSISTANT_FOOTER_SECTIONS = MAX_FOOTER_SECTIONS