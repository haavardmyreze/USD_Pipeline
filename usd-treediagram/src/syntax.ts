/**
 * Colours the outline, as HTML laid exactly under the editor's text.
 *
 * It must never change a character's width or position, only its colour, or
 * the caret would drift away from the letters it sits between.
 */

import type { Mode } from './render'

const TREE_TOKENS = /("[^"]*"?)|(\{[^}]*\}?)|(\S+)/g
const GRAPH_TOKENS = /"[^"]*"?|->|→|[^\s"]+?(?=->|→|\s|$)/g

const ARC_WORDS = /^(sublayers?|references?|ref|payloads?|clips?|valueclip|asset|texture|other|unknown)$/i
const TINT_WORDS = /^(asset|set|shot|blue|green|red|yellow|pink|teal|indigo|gray)$/i
const NODE_WORDS = /^(root|assembly|block|missing|template|selected|\*)$/i
const NODE_KEYS = /^(color|tint|tier|status|artist|icon)=/i

export function highlight(source: string, mode: Mode = 'tree'): string {
  const paint = mode === 'graph' ? graphLine : treeLine
  return source.split('\n').map(paint).join('\n')
}

function treeLine(text: string): string {
  const { body, comment } = splitComment(text)
  const trimmed = body.trimStart()
  if (trimmed.startsWith('...') || trimmed.startsWith('…')) {
    return escape(body.slice(0, body.length - trimmed.length)) + span('note', trimmed) + comment
  }
  return paintTokens(body, TREE_TOKENS, (token, index) => classifyTree(token, index === 0)) + comment
}

function classifyTree(token: string, first: boolean): string {
  if (first) return 'name'
  if (token.startsWith('"')) return 'callout'
  if (token.startsWith('{')) return 'variant'
  if (token.startsWith('+')) return 'arc'
  if (/^(kind|icon)=/i.test(token)) return 'kind'
  if (/^(over|class|def|inactive|proxy|closed|selected|\*)$/i.test(token)) return 'keyword'
  if (/^[A-Z]/.test(token)) return 'type'
  return 'unknown'
}

function graphLine(text: string): string {
  const { body, comment } = splitComment(text)
  const tokens = body.match(GRAPH_TOKENS) ?? []
  const arcLine = tokens.some((t) => t === '->' || t === '→')
  // On an arc line, names sit either side of each arrow and the kind follows.
  let afterNames = false
  let expectName = true
  return (
    paintTokens(body, GRAPH_TOKENS, (token, index) => {
      if (token === '->' || token === '→') {
        expectName = true
        return 'operator'
      }
      if (arcLine) {
        if (expectName && !afterNames) {
          expectName = false
          return 'name'
        }
        afterNames = true
        return ARC_WORDS.test(token) ? 'arc' : 'unknown'
      }
      if (index === 0) return 'name'
      if (token.startsWith('"')) return 'callout'
      if (TINT_WORDS.test(token)) return 'type'
      if (NODE_KEYS.test(token)) return 'kind'
      if (NODE_WORDS.test(token)) return 'keyword'
      return 'unknown'
    }) + comment
  )
}

function paintTokens(body: string, pattern: RegExp, classify: (token: string, index: number) => string): string {
  let out = ''
  let last = 0
  let index = 0
  for (const match of body.matchAll(pattern)) {
    out += escape(body.slice(last, match.index))
    const token = match[0]
    out += span(classify(token, index++), token)
    last = match.index + token.length
  }
  return out + escape(body.slice(last))
}

function splitComment(text: string): { body: string; comment: string } {
  let quoted = false
  for (let i = 0; i < text.length; i++) {
    if (text[i] === '"') quoted = !quoted
    else if (text[i] === '#' && !quoted) return { body: text.slice(0, i), comment: span('comment', text.slice(i)) }
  }
  return { body: text, comment: '' }
}

function span(kind: string, text: string): string {
  return `<span class="tok-${kind}">${escape(text)}</span>`
}

function escape(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
}
