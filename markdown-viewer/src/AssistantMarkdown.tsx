import { useMemo } from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import { type SectionRef } from './headings'
import { linkifySectionMentions } from './sectionLinks'

type AssistantMarkdownProps = {
  content: string
  sections: SectionRef[]
  onNavigateToSection: (id: string) => void
}

function resolveSectionId(href: string | undefined) {
  if (!href) {
    return null
  }

  if (href.startsWith('#')) {
    return decodeURIComponent(href.slice(1))
  }

  if (!/^[a-z][\w-]*$/i.test(href) || href.includes('://')) {
    return null
  }

  return decodeURIComponent(href)
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
        a: ({ href, children }) => {
          const sectionId = resolveSectionId(href)
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
