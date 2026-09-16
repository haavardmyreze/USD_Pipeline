/**
 * The flowchart language: nodes and the arcs between them.
 *
 *     shot.usda  shot  root
 *     shot.usda -> layout.usda -> anim.usda  sublayer
 *     shot.usda -> hero.usda  reference
 *     hero.usda  asset  assembly  status=ready  artist=anna
 *     hero.usda -> hero_geo.usda  payload
 *
 * A line with `->` is one or more arcs; the word after the last node names
 * the arc kind (sublayer when left out). A line without `->` declares or
 * decorates a node. Nodes appear the first time they are mentioned, so a
 * chart can be arcs alone. Names with spaces are quoted: "Hero asset".
 *
 * Node words:
 *   asset set shot          the tier tint, as in usd-refgraph
 *   color=blue …            any other tint: blue green red yellow pink teal indigo gray
 *   root                    the blue root outline
 *   assembly / block        a bold name with the layers mark / a quieter name
 *   missing / template      a dashed red card / the placeholder mark
 *   status=… artist=…       the status dot (placeholder, ready, locked) and a name
 *   icon=…                  a Houdini icon before the name
 *   "text"                  a second line on the card
 *   selected / *            the selection outline
 *
 * Arc kinds: sublayer, reference (ref), payload, clip, asset (texture), other.
 */

import type { Problem } from '../parse'

export type ArcKind = 'sublayer' | 'reference' | 'payload' | 'clip' | 'asset' | 'unknown'

export const ARC_ORDER: ArcKind[] = ['sublayer', 'reference', 'payload', 'clip', 'asset', 'unknown']

export const ARC_LABEL: Record<ArcKind, string> = {
  sublayer: 'sublayer',
  reference: 'reference',
  payload: 'payload',
  clip: 'value clip',
  asset: 'texture / asset',
  unknown: 'other',
}

const ARC_WORDS: Record<string, ArcKind> = {
  sublayer: 'sublayer',
  sublayers: 'sublayer',
  reference: 'reference',
  references: 'reference',
  ref: 'reference',
  payload: 'payload',
  payloads: 'payload',
  clip: 'clip',
  clips: 'clip',
  valueclip: 'clip',
  asset: 'asset',
  texture: 'asset',
  other: 'unknown',
  unknown: 'unknown',
}

export type Status = 'placeholder' | 'ready' | 'locked' | ''

const STATUS_WORDS: Record<string, Status> = {
  placeholder: 'placeholder',
  ready: 'ready',
  production_ready: 'ready',
  locked: 'locked',
}

export const TINTS = ['asset', 'set', 'shot', 'blue', 'green', 'red', 'yellow', 'pink', 'teal', 'indigo', 'gray'] as const
export type Tint = (typeof TINTS)[number]

export interface GraphNode {
  id: string
  name: string
  /** First line that mentions the node, to jump back to the text. */
  line: number
  /** The line that declares the node on its own, if there is one. */
  declLine: number | null
  tint: Tint | ''
  root: boolean
  role: 'assembly' | 'block' | ''
  missing: boolean
  template: boolean
  status: Status
  artist: string
  label: string
  icon: string
  selected: boolean
}

export interface GraphEdge {
  id: string
  from: string
  to: string
  kind: ArcKind
  line: number
}

export interface ParsedGraph {
  nodes: GraphNode[]
  edges: GraphEdge[]
  problems: Problem[]
}

const TOKENS = /"[^"]*"?|->|\S+/g

export function parseGraph(source: string): ParsedGraph {
  const nodes = new Map<string, GraphNode>()
  const edges: GraphEdge[] = []
  const problems: Problem[] = []

  const node = (name: string, line: number): GraphNode => {
    let found = nodes.get(name)
    if (!found) {
      found = {
        id: name,
        name,
        line,
        declLine: null,
        tint: '',
        root: false,
        role: '',
        missing: false,
        template: false,
        status: '',
        artist: '',
        label: '',
        icon: '',
        selected: false,
      }
      nodes.set(name, found)
    }
    return found
  }

  source.split(/\r?\n/).forEach((raw, line) => {
    const text = stripComment(raw).replace(/→/g, '->').replace(/->/g, ' -> ').trim()
    if (!text) return
    const tokens: string[] = text.match(TOKENS) ?? []

    if (tokens.includes('->')) {
      // name -> name [-> name …] [kind]
      const names: string[] = []
      let index = 0
      let expectName = true
      for (; index < tokens.length; index++) {
        const token = tokens[index]!
        if (token === '->') {
          if (expectName) problems.push({ line, message: 'An arrow needs a node on each side' })
          expectName = true
          continue
        }
        if (!expectName) break
        names.push(unquote(token))
        expectName = false
      }
      if (expectName) problems.push({ line, message: 'An arrow needs a node on each side' })

      let kind: ArcKind = 'sublayer'
      for (const token of tokens.slice(index)) {
        const word = ARC_WORDS[token.toLowerCase()]
        if (word) kind = word
        else problems.push({ line, message: `Not an arc kind: "${token}"` })
      }

      for (let i = 0; i + 1 < names.length; i++) {
        const from = node(names[i]!, line)
        const to = node(names[i + 1]!, line)
        edges.push({ id: `e${edges.length}`, from: from.id, to: to.id, kind, line })
      }
      return
    }

    // A node on its own.
    const [first, ...rest] = tokens
    const target = node(unquote(first!), line)
    if (target.declLine === null) target.declLine = line
    for (const token of rest) {
      const problem = applyWord(target, token)
      if (problem) problems.push({ line, message: problem })
    }
  })

  return { nodes: [...nodes.values()], edges, problems }
}

function applyWord(node: GraphNode, token: string): string | null {
  const lower = token.toLowerCase()
  if (token.startsWith('"')) {
    node.label = unquote(token)
    return null
  }
  if ((TINTS as readonly string[]).includes(lower)) {
    node.tint = lower as Tint
    return null
  }
  const [key, ...valueParts] = token.split('=')
  const value = valueParts.join('=')
  switch (valueParts.length ? key!.toLowerCase() : lower) {
    case 'root':
      node.root = true
      return null
    case 'assembly':
    case 'block':
      node.role = lower as 'assembly' | 'block'
      return null
    case 'missing':
      node.missing = true
      return null
    case 'template':
      node.template = true
      return null
    case 'selected':
    case '*':
      node.selected = true
      return null
    case 'color':
    case 'tint':
    case 'tier': {
      const tint = value.toLowerCase()
      if (!(TINTS as readonly string[]).includes(tint)) return `Colour is one of ${TINTS.join(', ')}`
      node.tint = tint as Tint
      return null
    }
    case 'status': {
      const status = STATUS_WORDS[value.toLowerCase()]
      if (!status) return 'Status is placeholder, ready or locked'
      node.status = status
      return null
    }
    case 'artist':
      node.artist = unquote(value)
      return null
    case 'icon':
      node.icon = value
      return null
    default:
      return `Not sure what "${token}" means`
  }
}

function unquote(token: string): string {
  return token.replace(/^"|"$/g, '')
}

function stripComment(line: string): string {
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    if (line[i] === '"') quoted = !quoted
    else if (line[i] === '#' && !quoted) return line.slice(0, i)
  }
  return line
}

/** Whether an outline reads as a flowchart: any line with an arrow. */
export function looksLikeGraph(source: string): boolean {
  return source.split(/\r?\n/).some((line) => /->|→/.test(stripComment(line)))
}
