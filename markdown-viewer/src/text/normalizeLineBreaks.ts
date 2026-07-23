/** Normalize common clipboard line-ending quirks. */
export function normalizeLineEndings(text: string) {
  return text
    .replace(/\u2028/g, '\n')
    .replace(/\u2029/g, '\n\n')
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
}

/** Turn literal "\\n" / "\\t" sequences into real characters when paste lost newlines. */
export function unescapeLiteralLineBreaks(text: string) {
  if (text.includes('\n')) {
    return text
  }

  if (!/\\[ntr]/.test(text)) {
    return text
  }

  return text.replace(/\\n/g, '\n').replace(/\\t/g, '\t').replace(/\\r/g, '')
}

const CODE_LINE_STARTERS = [
  'def',
  'class',
  'function',
  'import',
  'from',
  'export',
  'public',
  'private',
  'protected',
  'static',
  'async',
  'if',
  'else',
  'elif',
  'for',
  'while',
  'return',
  'const',
  'let',
  'var',
  '#include',
  'using',
  'namespace',
  'package',
  'interface',
  'enum',
  'struct',
  'SELECT',
  'INSERT',
  'CREATE',
  'UPDATE',
  'DELETE',
  '@Override',
  '@Test',
  'try',
  'catch',
  'finally',
  'switch',
  'case',
  'default',
  'print',
  'println',
]

export function needsLineBreakRestoration(text: string) {
  const lines = text.split('\n').filter((line) => line.trim())
  if (lines.length === 0) {
    return false
  }

  const longestLine = Math.max(...lines.map((line) => line.length))
  if (lines.length === 1 && longestLine > 60) {
    return true
  }

  if (lines.length === 1 && countMidLineCodeStarters(text) >= 2) {
    return true
  }

  return lines.length <= 2 && text.length > 200
}

function countMidLineCodeStarters(text: string) {
  const pattern = new RegExp(`\\s+(?:${CODE_LINE_STARTERS.join('|')})\\b`, 'gi')
  return [...text.matchAll(pattern)].length
}

function prettyPrintJson(text: string) {
  const trimmed = text.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return null
  }

  try {
    return JSON.stringify(JSON.parse(trimmed), null, 2)
  } catch {
    return null
  }
}

/** Re-split code that arrived as one long line (common from PDFs and web copies). */
export function restoreCodeLineBreaks(text: string) {
  let result = text

  const starterPattern = new RegExp(`\\s+(?=(?:${CODE_LINE_STARTERS.join('|')})\\b)`, 'gi')
  result = result.replace(starterPattern, '\n')
  result = result.replace(/;(?=\s*(?:[a-zA-Z_$@]))/g, ';\n')
  result = result.replace(/\{(?=\s*(?:[a-zA-Z_$"'(\[]))/g, '{\n')
  result = result.replace(/\}(?=\s*(?:else|catch|finally|while)\b)/g, '}\n')

  return result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

/** Re-split markdown that lost paragraph and block structure on paste. */
export function restoreMarkdownLineBreaks(text: string) {
  let result = text

  result = result.replace(/\s+(?=(?:#{1,6})\s+\S)/g, '\n\n')
  result = result.replace(/\s+(?=[-*+]\s+\S)/g, '\n')
  result = result.replace(/\s+(?=\d+\.\s+\S)/g, '\n')
  result = result.replace(/\s+(?=>\s+\S)/g, '\n\n')
  result = result.replace(/\s+(?=```)/g, '\n\n')

  return result
    .split('\n')
    .map((line) => line.trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function normalizePastedText(content: string, hint: 'code' | 'markdown' = 'code') {
  let text = normalizeLineEndings(unescapeLiteralLineBreaks(content.trim()))

  const prettyJson = prettyPrintJson(text)
  if (prettyJson) {
    return prettyJson
  }

  if (!needsLineBreakRestoration(text)) {
    return text
  }

  if (hint === 'markdown') {
    return restoreMarkdownLineBreaks(text)
  }

  if (/(?:^|\s)(?:#{1,6})\s+\S/.test(text)) {
    return restoreMarkdownLineBreaks(text)
  }

  return restoreCodeLineBreaks(text)
}
