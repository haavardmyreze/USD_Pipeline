import { useMemo } from 'react'
import type { ReactNode } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { headingId, type SectionRef } from './headings'
import { linkifySectionMentions } from './sectionLinks'

type AssistantMarkdownProps = {
  content: string
  sections: SectionRef[]
  onNavigateToSection: (id: string) => void
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }
  if (Array.isArray(node)) {
    return node.map((item) => getNodeText(item)).join('')
  }
  if (node && typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return getNodeText(withProps.props?.children)
  }
  return ''
}

function normalizeSectionLabel(text: string) {
  return text
    .trim()
    .toLowerCase()
    .replace(/^\d+[\.)]?\s+/, '')
}

function resolveSectionId(
  href: string | undefined,
  sections: SectionRef[],
  labelText: string,
) {
  if (!href) {
    return null
  }

  let rawId = ''
  if (href.startsWith('#')) {
    rawId = decodeURIComponent(href.slice(1))
  } else {
    if (!/^[a-z][\w-]*$/i.test(href) || href.includes('://')) {
      return null
    }
    rawId = decodeURIComponent(href)
  }

  if (sections.some((section) => section.id === rawId)) {
    return rawId
  }

  const slugMatch = sections.find((section) => headingId(section.text) === rawId)
  if (slugMatch) {
    return slugMatch.id
  }

  const suffixMatches = sections.filter((section) => section.id.endsWith(`-${rawId}`))
  if (suffixMatches.length === 1) {
    return suffixMatches[0].id
  }

  const normalizedLabel = normalizeSectionLabel(labelText)
  if (normalizedLabel) {
    const byLabel = sections.find(
      (section) => normalizeSectionLabel(section.text) === normalizedLabel,
    )
    if (byLabel) {
      return byLabel.id
    }
  }

  return rawId
}

export function AssistantMarkdown({
  content,
  sections,
  onNavigateToSection,
}: AssistantMarkdownProps) {
  const linkedContent = useMemo(
    () => linkifySectionMentions(content, sections),
    [content, sections],
  )

  return (
    <ReactMarkdown
      remarkPlugins={[remarkGfm]}
      components={{
        table: ({ children }) => (
          <div className="assistant-table-wrap">
            <table>{children}</table>
          </div>
        ),
        a: ({ href, children }) => {
          const sectionId = resolveSectionId(href, sections, getNodeText(children))
          if (sectionId) {
            return (
              <button
                type="button"
                className="assistant-inline-link"
                onClick={() => onNavigateToSection(sectionId)}
              >
                {children}
              </button>
            )
          }

          return (
            <a href={href} target="_blank" rel="noopener noreferrer">
              {children}
            </a>
          )
        },
      }}
    >
      {linkedContent}
    </ReactMarkdown>
  )
}
