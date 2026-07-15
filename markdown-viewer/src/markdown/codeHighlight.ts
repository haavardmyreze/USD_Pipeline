// Quiet, theme-adaptive syntax highlighting. highlight.js core with a
// curated language set (token colors come from theme variables in CSS).

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cmake from 'highlight.js/lib/languages/cmake'
import cpp from 'highlight.js/lib/languages/cpp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import glsl from 'highlight.js/lib/languages/glsl'
import ini from 'highlight.js/lib/languages/ini'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cmake', cmake)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('glsl', glsl)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('typescript', typescript)
hljs.registerLanguage('xml', xml)
hljs.registerLanguage('yaml', yaml)

const ALIASES: Record<string, string> = {
  js: 'javascript',
  jsx: 'javascript',
  mjs: 'javascript',
  ts: 'typescript',
  tsx: 'typescript',
  py: 'python',
  sh: 'bash',
  shell: 'bash',
  zsh: 'bash',
  console: 'bash',
  yml: 'yaml',
  html: 'xml',
  vex: 'c',
  hlsl: 'cpp',
  toml: 'ini',
  md: 'markdown',
}

/**
 * Highlight `code` for `language`; returns HTML or null when the language is
 * unknown (caller falls back to plain text — e.g. usda stays unhighlighted).
 */
export function highlightCode(code: string, language: string): string | null {
  const resolved = hljs.getLanguage(language)
    ? language
    : ALIASES[language.toLowerCase()]

  if (!resolved || !hljs.getLanguage(resolved)) {
    return null
  }

  try {
    return hljs.highlight(code, { language: resolved }).value
  } catch {
    return null
  }
}
