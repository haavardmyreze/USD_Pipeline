import { highlightCodeAuto } from '../markdown/codeHighlight'

/** Above this size, skip highlight.js to avoid massive DOM trees. */
export const CODE_HIGHLIGHT_MAX_CHARS = 120_000
export const CODE_HIGHLIGHT_MAX_LINES = 2_500
// JSON is punctuation-heavy, but we strip those spans before rendering, so it
// no longer needs a lower ceiling than other languages — the char cap governs.
export const JSON_HIGHLIGHT_MAX_LINES = CODE_HIGHLIGHT_MAX_LINES

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

/**
 * Split highlighted HTML into one string per source line, keeping every
 * <span> balanced across line breaks (highlight.js emits tokens that can
 * straddle newlines — e.g. block comments — so we close open tags at each
 * newline and reopen them on the next line).
 */
export function splitHighlightedLines(html: string): string[] {
  const lines: string[] = []
  const openTags: string[] = []
  let current = ''
  let index = 0

  while (index < html.length) {
    const char = html[index]

    if (char === '\n') {
      lines.push(current + '</span>'.repeat(openTags.length))
      current = openTags.join('')
      index += 1
      continue
    }

    if (char === '<') {
      if (html.startsWith('</span>', index)) {
        current += '</span>'
        openTags.pop()
        index += 7
        continue
      }
      if (html.startsWith('<span', index)) {
        const close = html.indexOf('>', index)
        if (close !== -1) {
          const tag = html.slice(index, close + 1)
          current += tag
          openTags.push(tag)
          index = close + 1
          continue
        }
      }
      current += char
      index += 1
      continue
    }

    let next = index
    while (next < html.length && html[next] !== '<' && html[next] !== '\n') {
      next += 1
    }
    current += html.slice(index, next)
    index = next
  }

  lines.push(current)
  return lines
}

/** Lines per virtualized block. Small enough that only a little lays out when a
 * chunk scrolls into view, large enough that even huge files produce few
 * `content-visibility` containers — thousands of them make a forced layout
 * (e.g. when the laser/draw overlay mounts) stall for a noticeable beat. */
export const CODE_CHUNK_LINES = 50

/**
 * Group source lines into a handful of `content-visibility` chunk blocks so the
 * renderer can skip whole off-screen chunks — the key to keeping large,
 * token-dense files (JSON especially) responsive without flooding the page with
 * virtualization containers.
 *
 * Each line inside a chunk is its own addressable block (`data-line` + id) so
 * the reader can scroll to a line and highlight whole lines (search hits,
 * comments) via cheap DOM class toggles — without re-running the highlighter.
 * Per-line `content-visibility` is deliberately avoided (thousands of them stall
 * a forced layout); containment lives on the chunk instead.
 */
export function wrapCodeLines(html: string): string {
  const lines = splitHighlightedLines(html)
  let out = ''
  for (let start = 0; start < lines.length; start += CODE_CHUNK_LINES) {
    const end = Math.min(start + CODE_CHUNK_LINES, lines.length)
    let inner = ''
    for (let index = start; index < end; index += 1) {
      // data-ln (1-based) is surfaced as the line number via CSS ::before, so
      // the number shares the line's own line box and can never drift from it.
      inner += `<span class="code-line" id="code-line-${index}" data-line="${index}" data-ln="${index + 1}">${lines[index]}</span>`
    }
    out += `<span class="code-chunk" style="--chunk-lines:${end - start}">${inner}</span>`
  }
  return out
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

export function prepareCodeView(content: string, language: string): PreparedCodeView {
  const lineCount = countCodeLines(content)

  if (!shouldHighlightCode(content, language, lineCount)) {
    return {
      language,
      html: wrapCodeLines(escapeHtml(content)),
      lineCount,
      highlighted: false,
    }
  }

  const highlighted = highlightCodeAuto(content, language)
  return {
    language: highlighted.language,
    html: wrapCodeLines(highlighted.html),
    lineCount,
    highlighted: true,
  }
}
