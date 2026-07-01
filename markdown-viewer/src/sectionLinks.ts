import { type SectionRef } from './headings'

export function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

const FENCED_CODE_RE = /(```[\s\S]*?```|~~~[\s\S]*?~~~)/g
const INLINE_CODE_RE = /(`[^`\n]+`)/g
const EXISTING_LINK_RE = /(\[[^\]]+\]\([^)]+\))/g

function linkifyPlainSegment(text: string, sections: SectionRef[]) {
  let result = text

  for (const section of sections) {
    if (section.text.length < 4) {
      continue
    }

    const escaped = escapeRegExp(section.text)
    result = result.replace(
      new RegExp(`\\*\\*(${escaped})\\*\\*`, 'gi'),
      `[$1](#${section.id})`,
    )
  }

  const withoutLinks = result.split(EXISTING_LINK_RE)
  result = withoutLinks
    .map((segment) => {
      if (segment.startsWith('[')) {
        return segment
      }

      let next = segment
      for (const section of sections) {
        if (section.text.length < 4) {
          continue
        }

        const escaped = escapeRegExp(section.text)
        next = next.replace(
          new RegExp(`(?<!\\[)(${escaped})(?!\\]\\()`, 'gi'),
          `[$1](#${section.id})`,
        )
      }
      return next
    })
    .join('')

  return result
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
          return linkifyPlainSegment(segment, sorted)
        })
        .join('')
    })
    .join('')
}

export function formatSectionLinkGuide(sections: SectionRef[], max = 8) {
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

  return ['Link to sections inline using these markdown links:', ...lines].join('\n')
}
