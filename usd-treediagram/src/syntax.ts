/**
 * Colours the outline, as HTML laid exactly under the editor's text.
 *
 * It must never change a character's width or position, only its colour, or
 * the caret would drift away from the letters it sits between.
 */

const TOKENS = /("[^"]*"?)|(\{[^}]*\}?)|(\S+)/g

export function highlight(source: string): string {
  return source.split('\n').map(line).join('\n')
}

function line(text: string): string {
  const hash = commentStart(text)
  const body = hash < 0 ? text : text.slice(0, hash)
  const comment = hash < 0 ? '' : span('comment', text.slice(hash))

  const trimmed = body.trimStart()
  if (trimmed.startsWith('...') || trimmed.startsWith('…')) {
    return escape(body.slice(0, body.length - trimmed.length)) + span('note', trimmed) + comment
  }

  let out = ''
  let last = 0
  let first = true
  for (const match of body.matchAll(TOKENS)) {
    out += escape(body.slice(last, match.index))
    const token = match[0]
    out += span(classify(token, first), token)
    first = false
    last = match.index + token.length
  }
  return out + escape(body.slice(last)) + comment
}

function classify(token: string, first: boolean): string {
  if (first) return 'name'
  if (token.startsWith('"')) return 'callout'
  if (token.startsWith('{')) return 'variant'
  if (token.startsWith('+')) return 'arc'
  if (/^(kind|icon)=/i.test(token)) return 'kind'
  if (/^(over|class|def|inactive|proxy|closed|selected|\*)$/i.test(token)) return 'keyword'
  if (/^[A-Z]/.test(token)) return 'type'
  return 'unknown'
}

function commentStart(text: string): number {
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (text[i] === '#' && !quoted) return i
  }
  return -1
}

function span(kind: string, text: string): string {
  return `<span class="tok-${kind}">${escape(text)}</span>`
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
