/**
 * A small highlighter for `.usda` text.
 *
 * It only has to make a layer easy to scan, not parse it: comments, strings,
 * asset paths, prim paths, numbers, and the words that shape composition. It
 * works a line at a time, carrying one bit of state between lines — whether a
 * triple-quoted string is still open — so a long file can be tokenised in
 * pieces as it scrolls into view.
 */

export type TokenKind =
  | 'comment'
  | 'string'
  | 'asset'
  | 'path'
  | 'keyword'
  | 'meta'
  | 'arc'
  | 'type'
  | 'number'
  | 'plain'

export interface Token {
  kind: TokenKind
  text: string
}

export interface LineState {
  /** Inside a `"""` string that began on an earlier line. */
  inDoc: boolean
}

/** Specifiers, list ops and literals: the words that shape the file. */
const KEYWORDS = new Set([
  'def', 'over', 'class', 'custom', 'uniform', 'config', 'varying',
  'prepend', 'append', 'add', 'delete', 'reorder',
  'variantSet', 'rel', 'true', 'false', 'None',
])

/** Metadata names, quieter than keywords since a layer header is full of them. */
const METADATA = new Set([
  'doc', 'kind', 'active', 'instanceable', 'hidden', 'defaultPrim', 'upAxis',
  'metersPerUnit', 'startTimeCode', 'endTimeCode', 'framesPerSecond',
  'timeCodesPerSecond', 'customLayerData', 'customData', 'assetInfo',
  'timeSamples', 'connect', 'permission', 'symmetryFunction', 'displayUnit',
  'apiSchemas', 'clips', 'relocates',
])

/** The arcs this app draws, so they read as the same thing here. */
const ARCS = new Set([
  'subLayers', 'references', 'payload', 'payloads', 'inherits', 'specializes',
  'variants', 'variantSets',
])

const TYPES = new Set([
  'bool', 'uchar', 'int', 'uint', 'int64', 'uint64', 'half', 'float', 'double',
  'timecode', 'string', 'token', 'asset', 'opaque', 'dictionary', 'pathExpression',
  'matrix2d', 'matrix3d', 'matrix4d', 'quath', 'quatf', 'quatd',
  'double2', 'double3', 'double4', 'float2', 'float3', 'float4',
  'half2', 'half3', 'half4', 'int2', 'int3', 'int4',
  'point3d', 'point3f', 'point3h', 'normal3d', 'normal3f', 'normal3h',
  'vector3d', 'vector3f', 'vector3h', 'color3d', 'color3f', 'color3h',
  'color4d', 'color4f', 'color4h', 'frame4d',
  'texCoord2d', 'texCoord2f', 'texCoord2h', 'texCoord3d', 'texCoord3f', 'texCoord3h',
])

/**
 * One pattern, tried at each position. The groups are in priority order: a
 * `#` inside a string or an asset path is part of it, not a comment.
 */
const TOKEN = new RegExp(
  [
    '(""")', // 1: a doc string opening on this line
    '("(?:[^"\\\\]|\\\\.)*"|\'(?:[^\'\\\\]|\\\\.)*\')', // 2: string
    '(@@@.*?@@@|@[^@]*@)', // 3: asset path
    '(<[^<>\\s]*>)', // 4: prim path
    '(#.*$)', // 5: comment
    '(-?(?:\\d+\\.?\\d*|\\.\\d+)(?:[eE][-+]?\\d+)?\\b)', // 6: number
    '([A-Za-z_][\\w:.]*(?:\\[\\])?)', // 7: word
  ].join('|'),
  'g',
)

export function tokenize(line: string, state: LineState): Token[] {
  const tokens: Token[] = []
  let index = 0

  const push = (kind: TokenKind, text: string): void => {
    if (!text) return
    const last = tokens[tokens.length - 1]
    if (last && last.kind === kind) last.text += text
    else tokens.push({ kind, text })
  }

  if (state.inDoc) {
    const end = line.indexOf('"""')
    if (end < 0) {
      push('string', line)
      return tokens
    }
    push('string', line.slice(0, end + 3))
    index = end + 3
    state.inDoc = false
  }

  TOKEN.lastIndex = index
  let match: RegExpExecArray | null
  while ((match = TOKEN.exec(line))) {
    push('plain', line.slice(index, match.index))
    const [text, doc, string, asset, path, comment, number, word] = match

    if (doc) {
      const end = line.indexOf('"""', match.index + 3)
      if (end < 0) {
        push('string', line.slice(match.index))
        state.inDoc = true
        return tokens
      }
      push('string', line.slice(match.index, end + 3))
      index = TOKEN.lastIndex = end + 3
      continue
    }

    if (string) push('string', text)
    else if (asset) push('asset', text)
    else if (path) push('path', text)
    else if (comment) push('comment', text)
    else if (number) push('number', text)
    else if (word) push(wordKind(word), text)
    index = TOKEN.lastIndex
  }
  push('plain', line.slice(index))
  return tokens
}

function wordKind(word: string): TokenKind {
  if (ARCS.has(word)) return 'arc'
  if (KEYWORDS.has(word)) return 'keyword'
  if (METADATA.has(word)) return 'meta'
  if (TYPES.has(word.replace(/\[\]$/, ''))) return 'type'
  return 'plain'
}
