/**
 * The outline language a tree is written in.
 *
 * One prim per line; indentation is the hierarchy. After the name, in any
 * order:
 *
 *     World  Xform  kind=assembly
 *       hero  Xform  kind=component  +ref +payload  {lod=high}  "the asset"
 *         geo  Scope  closed
 *       ... 12 more not shown
 *
 *   Type          a word starting with a capital: Xform, Mesh, Material
 *   kind=…        component, assembly, group, subcomponent
 *   icon=…        any Houdini icon, by type (`camera`) or file name
 *   +ref +payload +unloaded +instance +inherit +specialize +relocate
 *   {set=value}   a variant selection; several are counted
 *   over class    the specifier, drawn in italics
 *   inactive      struck through
 *   proxy         dimmed, as a prim inside an instance
 *   closed        a closed chevron; children, if any, are not drawn
 *   selected / *  the blue selection highlight
 *   "text"        a callout to the right of the row
 *
 * A line starting with `...` is a note row, and `#` starts a comment.
 */

export type Specifier = 'def' | 'over' | 'class'

export interface TreeNode {
  /** A prim, or a grey note such as "12 more not shown". */
  note: boolean
  name: string
  type: string
  kind: string
  icon: string
  arcs: string[]
  unloaded: boolean
  instance: boolean
  variants: [string, string][]
  specifier: Specifier
  active: boolean
  proxy: boolean
  closed: boolean
  selected: boolean
  callout: string
  /** Zero-based source line, to jump from the picture back to the text. */
  line: number
  /** Where the name starts on its line, in characters (a tab is four). */
  column: number
  children: TreeNode[]
}

export interface Problem {
  line: number
  message: string
}

export interface Parsed {
  roots: TreeNode[]
  problems: Problem[]
}

const ARCS: Record<string, string> = {
  ref: 'reference',
  reference: 'reference',
  payload: 'payload',
  inherit: 'inherit',
  inherits: 'inherit',
  specialize: 'specialize',
  specializes: 'specialize',
  relocate: 'relocate',
  relocates: 'relocate',
}

const TOKENS = /"[^"]*"?|\{[^}]*\}?|\S+/g

export function parse(source: string): Parsed {
  const roots: TreeNode[] = []
  const problems: Problem[] = []
  const stack: { indent: number; node: TreeNode }[] = []

  source.split(/\r?\n/).forEach((raw, line) => {
    const text = stripComment(raw)
    if (!text.trim()) return
    const indent = measureIndent(text)

    while (stack.length && stack[stack.length - 1]!.indent >= indent) stack.pop()
    const parent = stack[stack.length - 1]?.node
    if (parent?.note) {
      problems.push({ line, message: 'A note cannot have children' })
      return
    }

    const node = parseLine(text.trim(), line, problems)
    node.column = indent
    ;(parent ? parent.children : roots).push(node)
    stack.push({ indent, node })
  })

  return { roots, problems }
}

function parseLine(text: string, line: number, problems: Problem[]): TreeNode {
  const node: TreeNode = {
    note: false,
    name: '',
    type: '',
    kind: '',
    icon: '',
    arcs: [],
    unloaded: false,
    instance: false,
    variants: [],
    specifier: 'def',
    active: true,
    proxy: false,
    closed: false,
    selected: false,
    callout: '',
    line,
    column: 0,
    children: [],
  }

  if (text.startsWith('...') || text.startsWith('…')) {
    node.note = true
    node.name = text.replace(/^(\.\.\.|…)\s*/, '') || '…'
    return node
  }

  const tokens = text.match(TOKENS) ?? []
  node.name = tokens.shift() ?? ''

  for (const token of tokens) {
    const lower = token.toLowerCase()
    if (token.startsWith('"')) {
      node.callout = token.replace(/^"|"$/g, '')
    } else if (token.startsWith('{')) {
      for (const pair of token.replace(/^\{|\}$/g, '').split(',')) {
        if (!pair.trim()) continue
        const [set, value = ''] = pair.split('=')
        node.variants.push([set!.trim(), value.trim()])
      }
    } else if (token.startsWith('+')) {
      const flag = lower.slice(1)
      if (ARCS[flag]) addArc(node, ARCS[flag]!)
      else if (flag === 'unloaded') {
        addArc(node, 'payload')
        node.unloaded = true
      } else if (flag === 'instance' || flag === 'instanceable') node.instance = true
      else problems.push({ line, message: `Unknown flag ${token}` })
    } else if (lower.startsWith('kind=')) {
      node.kind = token.slice(5)
    } else if (lower.startsWith('icon=')) {
      node.icon = token.slice(5)
    } else if (lower === 'over' || lower === 'class' || lower === 'def') {
      node.specifier = lower
    } else if (lower === 'inactive') {
      node.active = false
    } else if (lower === 'proxy') {
      node.proxy = true
    } else if (lower === 'closed') {
      node.closed = true
    } else if (lower === 'selected' || token === '*') {
      node.selected = true
    } else if (/^[A-Z]/.test(token) && !node.type) {
      node.type = token
    } else {
      problems.push({ line, message: `Not sure what "${token}" means` })
    }
  }
  return node
}

function addArc(node: TreeNode, arc: string): void {
  if (!node.arcs.includes(arc)) node.arcs.push(arc)
}

/** Drop a `#` comment, unless the `#` sits inside a quoted callout. */
function stripComment(line: string): string {
  let quoted = false
  for (let i = 0; i < line.length; i++) {
    const char = line[i]
    if (char === '"') quoted = !quoted
    else if (char === '#' && !quoted) return line.slice(0, i)
  }
  return line
}

/** Leading whitespace, with a tab worth four spaces. */
function measureIndent(line: string): number {
  let width = 0
  for (const char of line) {
    if (char === ' ') width += 1
    else if (char === '\t') width += 4
    else break
  }
  return width
}

// ---------------------------------------------------------------------------
// Editing helpers, used when the picture changes the text
// ---------------------------------------------------------------------------

/** Toggle a bare keyword (`closed`, `selected`) on one source line. */
export function toggleKeyword(source: string, line: number, keyword: string): string {
  const lines = source.split(/\r?\n/)
  const text = lines[line]
  if (text === undefined) return source
  const pattern = new RegExp(`\\s+${keyword}(?=\\s|$|#)`)
  lines[line] = pattern.test(text)
    ? text.replace(pattern, '')
    : insertBeforeCallout(text, keyword)
  return lines.join('\n')
}

/**
 * Remove `keyword`, and any of its `aliases`, from every line, and put it on
 * `line` alone — or nowhere, if `line` already had it.
 */
export function moveKeyword(source: string, line: number, keyword: string, aliases: string[] = []): string {
  const words = [keyword, ...aliases].map((word) => word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')
  const pattern = new RegExp(`\\s+(?:${words})(?=\\s|$|#)`, 'g')
  const lines = source.split(/\r?\n/)
  const had = new RegExp(pattern.source).test(lines[line] ?? '')
  const cleared = lines.map((text) => text.replace(pattern, ''))
  if (!had && cleared[line] !== undefined) cleared[line] = insertBeforeCallout(cleared[line]!, keyword)
  return cleared.join('\n')
}

/** Append a token to a line, ahead of its callout and comment. */
function insertBeforeCallout(text: string, token: string): string {
  const content = stripComment(text)
  const tail = text.slice(content.length)
  const quote = content.indexOf('"')
  if (quote < 0) return `${content.trimEnd()}  ${token}${tail ? ` ${tail.trimStart()}` : ''}`
  return `${content.slice(0, quote).trimEnd()}  ${token}  ${content.slice(quote)}${tail}`
}
