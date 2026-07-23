import { highlightCodeAuto } from '../markdown/codeHighlight'

/** Above this size, skip highlight.js to avoid massive DOM trees. */
export const CODE_HIGHLIGHT_MAX_CHARS = 120_000
export const CODE_HIGHLIGHT_MAX_LINES = 2_500
export const JSON_HIGHLIGHT_MAX_LINES = 800

export type PreparedCodeView = {
  language: string
  html: string
  lineCount: number
  highlighted: boolean
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

export function countCodeLines(content: string) {
  if (!content) {
    return 0
  }

  let lines = 1
  for (let index = 0; index < content.length; index += 1) {
    if (content.charCodeAt(index) === 10) {
      lines += 1
    }
  }
  return lines
}

export function shouldHighlightCode(
  content: string,
  language?: string,
  lineCount = countCodeLines(content),
) {
  if (content.length > CODE_HIGHLIGHT_MAX_CHARS) {
    return false
  }

  const maxLines = language === 'json' ? JSON_HIGHLIGHT_MAX_LINES : CODE_HIGHLIGHT_MAX_LINES
  return lineCount <= maxLines
}

export function formatCodeGutter(lineCount: number) {
  if (lineCount <= 0) {
    return ''
  }

  const lines = new Array<string>(lineCount)
  for (let index = 0; index < lineCount; index += 1) {
    lines[index] = String(index + 1)
  }
  return lines.join('\n')
}

export function prepareCodeView(content: string, language: string): PreparedCodeView {
  const lineCount = countCodeLines(content)

  if (!shouldHighlightCode(content, language, lineCount)) {
    return {
      language,
      html: escapeHtml(content),
      lineCount,
      highlighted: false,
    }
  }

  const highlighted = highlightCodeAuto(content, language)
  return {
    language: highlighted.language,
    html: highlighted.html,
    lineCount,
    highlighted: true,
  }
}
