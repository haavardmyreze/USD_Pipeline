// Code block rendering shared by every markdown surface: theme-adaptive
// highlighting plus a hover copy button. The measure host renders these same
// components so paged-mode measurements stay exact.

import { type ReactNode, memo, useMemo, useRef, useState } from 'react'
import type { Components } from 'react-markdown'
import { shouldHighlightCode } from '../code/codeView'
import { highlightCode } from './codeHighlight'

function CodePre({ children }: { children?: ReactNode }) {
  const preRef = useRef<HTMLPreElement | null>(null)
  const [copied, setCopied] = useState(false)

  return (
    <div className="code-block">
      <button
        type="button"
        className="code-copy"
        aria-label="Copy code"
        onClick={() => {
          const text = preRef.current?.textContent ?? ''
          void navigator.clipboard?.writeText(text)
          setCopied(true)
          window.setTimeout(() => setCopied(false), 1500)
        }}
      >
        {copied ? 'Copied' : 'Copy'}
      </button>
      <pre ref={preRef}>{children}</pre>
    </div>
  )
}

const Code = memo(function Code({
  className,
  children,
}: {
  className?: string
  children?: ReactNode
}) {
  const language = /language-([\w+-]+)/.exec(className ?? '')?.[1]
  const text = useMemo(
    () =>
      (Array.isArray(children) ? children.join('') : String(children ?? '')).replace(/\n$/, ''),
    [children],
  )

  // Highlight once per (text, language). Oversized blocks skip highlight.js
  // entirely so a giant fenced block can never block the render thread.
  const html = useMemo(() => {
    if (!language || !shouldHighlightCode(text, language)) {
      return null
    }
    return highlightCode(text, language)
  }, [language, text])

  if (html !== null) {
    return (
      <code
        className={className}
        // highlight.js output over text we already have — not user HTML.
        dangerouslySetInnerHTML={{ __html: html }}
      />
    )
  }

  return <code className={className}>{children}</code>
})

export const markdownCodeComponents: Components = {
  pre: CodePre,
  code: Code,
}
