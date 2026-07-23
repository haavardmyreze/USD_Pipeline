import { highlightCodeAuto, resolveHighlightLanguage } from '../markdown/codeHighlight'
import {
  extensionFromFileName,
  languageFromExtension,
  languageFromFileName,
} from './codeExtensions'

const SHEBANG_PATTERN = /^#!\s*(?:\/usr\/bin\/env\s+)?(\S+)/
const MODELINE_PATTERN = /(?:^|\s)(?:filetype|ft|syntax)\s*=\s*(\w+)/i

const INTERPRETER_TO_LANGUAGE: Record<string, string> = {
  python: 'python',
  python3: 'python',
  node: 'javascript',
  bash: 'bash',
  sh: 'bash',
  zsh: 'bash',
  ruby: 'ruby',
  perl: 'perl',
  php: 'php',
}

export function detectShebangLanguage(content: string) {
  const firstLine = content.split(/\r?\n/, 1)[0] ?? ''
  const match = SHEBANG_PATTERN.exec(firstLine)
  if (!match?.[1]) {
    return null
  }

  const token = match[1].split('/').pop()?.toLowerCase() ?? ''
  return INTERPRETER_TO_LANGUAGE[token] ?? resolveHighlightLanguage(token)
}

export function detectModelineLanguage(content: string) {
  const tail = content.slice(-240)
  const match = MODELINE_PATTERN.exec(tail)
  if (!match?.[1]) {
    return null
  }

  return resolveHighlightLanguage(match[1])
}

export function formatLanguageLabel(language: string) {
  const labels: Record<string, string> = {
    python: 'Python',
    javascript: 'JavaScript',
    typescript: 'TypeScript',
    json: 'JSON',
    java: 'Java',
    c: 'C',
    cpp: 'C++',
    css: 'CSS',
    yaml: 'YAML',
    xml: 'XML',
    bash: 'Shell',
    go: 'Go',
    rust: 'Rust',
    kotlin: 'Kotlin',
    sql: 'SQL',
    csharp: 'C#',
    glsl: 'GLSL',
    cmake: 'CMake',
    ini: 'INI',
    diff: 'Diff',
    markdown: 'Markdown',
  }

  if (labels[language]) {
    return labels[language]
  }

  return language
    .split(/[-_]/)
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ')
}

/**
 * Pick a highlight.js language from the file name and content.
 * Extension wins when known; otherwise shebang, modeline, then auto-detect.
 */
export function detectCodeLanguage(fileName: string, content: string) {
  const fromName = languageFromFileName(fileName)
  if (fromName) {
    return fromName
  }

  const fromShebang = detectShebangLanguage(content)
  if (fromShebang) {
    return fromShebang
  }

  const fromModeline = detectModelineLanguage(content)
  if (fromModeline) {
    return fromModeline
  }

  const extension = extensionFromFileName(fileName)
  if (extension) {
    const mapped = languageFromExtension(extension)
    if (mapped) {
      return mapped
    }
  }

  return highlightCodeAuto(content).language
}
