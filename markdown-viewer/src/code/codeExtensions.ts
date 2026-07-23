/** Lowercase extensions including the dot — used by the code document adapter. */
export const CODE_EXTENSIONS = [
  '.py',
  '.json',
  '.java',
  '.js',
  '.mjs',
  '.cjs',
  '.ts',
  '.tsx',
  '.jsx',
  '.c',
  '.h',
  '.cpp',
  '.hpp',
  '.cc',
  '.cxx',
  '.css',
  '.yaml',
  '.yml',
  '.xml',
  '.html',
  '.htm',
  '.sh',
  '.bash',
  '.zsh',
  '.go',
  '.rs',
  '.kt',
  '.kts',
  '.sql',
  '.cs',
  '.glsl',
  '.hlsl',
  '.cmake',
  '.ini',
  '.toml',
  '.diff',
  '.patch',
  '.vex',
] as const

const CODE_EXTENSION_SET = new Set<string>(CODE_EXTENSIONS)

export function isCodeFileName(fileName: string) {
  const lower = fileName.toLowerCase()
  for (const extension of CODE_EXTENSIONS) {
    if (lower.endsWith(extension)) {
      return true
    }
  }
  return false
}

export function extensionFromFileName(fileName: string) {
  const match = /\.([^.]+)$/i.exec(fileName)
  return match?.[1]?.toLowerCase() ?? ''
}

/** Map a file extension (no dot) to a highlight.js language id. */
export const EXTENSION_TO_LANGUAGE: Record<string, string> = {
  py: 'python',
  json: 'json',
  java: 'java',
  js: 'javascript',
  mjs: 'javascript',
  cjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  jsx: 'javascript',
  c: 'c',
  h: 'c',
  cpp: 'cpp',
  hpp: 'cpp',
  cc: 'cpp',
  cxx: 'cpp',
  css: 'css',
  yaml: 'yaml',
  yml: 'yaml',
  xml: 'xml',
  html: 'xml',
  htm: 'xml',
  sh: 'bash',
  bash: 'bash',
  zsh: 'bash',
  go: 'go',
  rs: 'rust',
  kt: 'kotlin',
  kts: 'kotlin',
  sql: 'sql',
  cs: 'csharp',
  glsl: 'glsl',
  hlsl: 'cpp',
  cmake: 'cmake',
  ini: 'ini',
  toml: 'ini',
  diff: 'diff',
  patch: 'diff',
  vex: 'c',
}

export function languageFromExtension(extension: string) {
  return EXTENSION_TO_LANGUAGE[extension.toLowerCase()] ?? null
}

export function languageFromFileName(fileName: string) {
  return languageFromExtension(extensionFromFileName(fileName))
}

export function codeExtensionsPattern() {
  return new RegExp(
    `\\.(${[...CODE_EXTENSION_SET]
      .map((extension) => extension.slice(1))
      .join('|')})$`,
    'i',
  )
}
