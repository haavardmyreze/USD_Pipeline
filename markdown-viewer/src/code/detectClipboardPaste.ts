import { autoDetectLanguage } from '../markdown/codeHighlight'
import { normalizePastedText } from '../text/normalizeLineBreaks'
import {
  detectCodeLanguage,
  detectModelineLanguage,
  detectShebangLanguage,
} from './detectLanguage'

export type ClipboardPasteResult =
  | { format: 'markdown'; fileName: 'clipboard.md'; content: string }
  | { format: 'code'; fileName: string; content: string; language: string }

const LANGUAGE_CLIPBOARD_EXTENSION: Record<string, string> = {
  python: 'py',
  javascript: 'js',
  typescript: 'ts',
  json: 'json',
  java: 'java',
  c: 'c',
  cpp: 'cpp',
  css: 'css',
  yaml: 'yaml',
  xml: 'xml',
  bash: 'sh',
  go: 'go',
  rust: 'rs',
  kotlin: 'kt',
  sql: 'sql',
  csharp: 'cs',
  glsl: 'glsl',
  cmake: 'cmake',
  ini: 'ini',
  diff: 'diff',
}

const MARKDOWN_PATTERNS = [
  /^#{1,6}\s+\S/im,
  /^\s*[-*+]\s+\S/im,
  /^\s*\d+\.\s+\S/im,
  /^>\s+\S/im,
  /\[.+?\]\(.+?\)/,
  /^```/m,
  /^\|.+\|$/m,
]

function clipboardFileName(language: string) {
  const extension = LANGUAGE_CLIPBOARD_EXTENSION[language] ?? 'txt'
  return `clipboard.${extension}`
}

function looksLikeJson(content: string) {
  const trimmed = content.trim()
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) {
    return false
  }

  try {
    JSON.parse(trimmed)
    return true
  } catch {
    return false
  }
}

function hasMarkdownStructure(content: string) {
  return MARKDOWN_PATTERNS.some((pattern) => pattern.test(content))
}

function codeStructureScore(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) {
    return 0
  }

  let score = 0
  for (const line of lines) {
    const trimmed = line.trim()
    if (
      /^(import|from|export|class|def|function|const|let|var|public|private|protected|#include|using|package|interface|enum|struct|SELECT|INSERT|CREATE|UPDATE|DELETE)\b/.test(
        trimmed,
      )
    ) {
      score += 2
    }
    if (/[{}();=<>]/.test(trimmed) && !trimmed.startsWith('//')) {
      score += 1
    }
    if (/^\s{2,}\S/.test(line)) {
      score += 0.5
    }
  }

  return score / lines.length
}

function looksLikeProse(content: string) {
  const lines = content.split(/\r?\n/).filter((line) => line.trim())
  if (lines.length === 0) {
    return false
  }

  const proseLines = lines.filter((line) => {
    const trimmed = line.trim()
    return (
      /^[A-Za-z"'([]/.test(trimmed) &&
      trimmed.split(/\s+/).length >= 5 &&
      !/[{}();=<>]/.test(trimmed)
    )
  })

  return proseLines.length / lines.length >= 0.45
}

function isLikelyCodeLanguage(language: string) {
  return language !== 'markdown' && language !== 'text' && language !== 'plaintext'
}

function languageHintFromStructure(content: string) {
  if (/\bpublic\s+(?:static\s+)?(?:final\s+)?class\b/.test(content)) {
    return 'java'
  }
  if (/^\s*def\s+\w+/m.test(content)) {
    return 'python'
  }
  if (/^\s*(using|namespace)\s+/m.test(content)) {
    return 'csharp'
  }
  if (/^\s*SELECT\b/im.test(content)) {
    return 'sql'
  }
  if (/^\s*(const|let|var|function|export)\b/m.test(content)) {
    return 'javascript'
  }
  return null
}

function resolveClipboardLanguage(content: string) {
  return languageHintFromStructure(content) ?? detectCodeLanguage('clipboard.txt', content)
}

function withNormalizedContent(result: ClipboardPasteResult): ClipboardPasteResult {
  const hint = result.format === 'code' ? 'code' : 'markdown'
  const content = normalizePastedText(result.content, hint)

  if (result.format === 'code') {
    const language = resolveClipboardLanguage(content)
    return {
      ...result,
      content,
      language,
      fileName: clipboardFileName(language),
    }
  }

  return { ...result, content }
}

/**
 * Decide whether clipboard text should open as markdown or a code document.
 */
export function detectClipboardPaste(content: string): ClipboardPasteResult {
  const trimmed = content.trim()

  if (detectShebangLanguage(trimmed) || detectModelineLanguage(trimmed)) {
    const language = resolveClipboardLanguage(trimmed)
    return withNormalizedContent({
      format: 'code',
      fileName: clipboardFileName(language),
      content,
      language,
    })
  }

  if (looksLikeJson(trimmed)) {
    return withNormalizedContent({
      format: 'code',
      fileName: 'clipboard.json',
      content,
      language: 'json',
    })
  }

  const prose = looksLikeProse(trimmed)
  const codeScore = codeStructureScore(trimmed)

  if (prose && codeScore < 0.8) {
    return withNormalizedContent({ format: 'markdown', fileName: 'clipboard.md', content })
  }

  const markdownStructure = hasMarkdownStructure(trimmed)

  if (markdownStructure && codeScore < 1.2) {
    return withNormalizedContent({ format: 'markdown', fileName: 'clipboard.md', content })
  }

  const auto = autoDetectLanguage(trimmed)
  const detectedLanguage = auto.language
  const codeLanguage = isLikelyCodeLanguage(detectedLanguage)

  if (codeLanguage && auto.relevance >= 4 && !prose) {
    const language = resolveClipboardLanguage(trimmed)
    return withNormalizedContent({
      format: 'code',
      fileName: clipboardFileName(language),
      content,
      language,
    })
  }

  if (detectedLanguage === 'markdown' && auto.relevance >= 5 && markdownStructure) {
    return withNormalizedContent({ format: 'markdown', fileName: 'clipboard.md', content })
  }

  if (codeScore >= 1.5 && !prose) {
    const language = resolveClipboardLanguage(trimmed)
    return withNormalizedContent({
      format: 'code',
      fileName: clipboardFileName(language),
      content,
      language,
    })
  }

  if (prose && !codeLanguage) {
    return withNormalizedContent({ format: 'markdown', fileName: 'clipboard.md', content })
  }

  if (trimmed.split(/\r?\n/).length <= 30 && codeLanguage && auto.relevance >= 2 && !prose) {
    const language = resolveClipboardLanguage(trimmed)
    return withNormalizedContent({
      format: 'code',
      fileName: clipboardFileName(language),
      content,
      language,
    })
  }

  return withNormalizedContent({ format: 'markdown', fileName: 'clipboard.md', content })
}
