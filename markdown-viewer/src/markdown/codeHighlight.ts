// Quiet, theme-adaptive syntax highlighting. highlight.js core with a
// curated language set (token colors come from theme variables in CSS).

import hljs from 'highlight.js/lib/core'
import bash from 'highlight.js/lib/languages/bash'
import c from 'highlight.js/lib/languages/c'
import cmake from 'highlight.js/lib/languages/cmake'
import cpp from 'highlight.js/lib/languages/cpp'
import csharp from 'highlight.js/lib/languages/csharp'
import css from 'highlight.js/lib/languages/css'
import diff from 'highlight.js/lib/languages/diff'
import glsl from 'highlight.js/lib/languages/glsl'
import go from 'highlight.js/lib/languages/go'
import ini from 'highlight.js/lib/languages/ini'
import java from 'highlight.js/lib/languages/java'
import javascript from 'highlight.js/lib/languages/javascript'
import json from 'highlight.js/lib/languages/json'
import kotlin from 'highlight.js/lib/languages/kotlin'
import markdown from 'highlight.js/lib/languages/markdown'
import python from 'highlight.js/lib/languages/python'
import rust from 'highlight.js/lib/languages/rust'
import sql from 'highlight.js/lib/languages/sql'
import typescript from 'highlight.js/lib/languages/typescript'
import xml from 'highlight.js/lib/languages/xml'
import yaml from 'highlight.js/lib/languages/yaml'

hljs.registerLanguage('bash', bash)
hljs.registerLanguage('c', c)
hljs.registerLanguage('cmake', cmake)
hljs.registerLanguage('cpp', cpp)
hljs.registerLanguage('csharp', csharp)
hljs.registerLanguage('css', css)
hljs.registerLanguage('diff', diff)
hljs.registerLanguage('glsl', glsl)
hljs.registerLanguage('go', go)
hljs.registerLanguage('ini', ini)
hljs.registerLanguage('java', java)
hljs.registerLanguage('javascript', javascript)
hljs.registerLanguage('json', json)
hljs.registerLanguage('kotlin', kotlin)
hljs.registerLanguage('markdown', markdown)
hljs.registerLanguage('python', python)
hljs.registerLanguage('rust', rust)
hljs.registerLanguage('sql', sql)
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
  cs: 'csharp',
  h: 'c',
  hpp: 'cpp',
}

export function resolveHighlightLanguage(language: string) {
  const normalized = language.toLowerCase()
  if (hljs.getLanguage(normalized)) {
    return normalized
  }

  const alias = ALIASES[normalized]
  if (alias && hljs.getLanguage(alias)) {
    return alias
  }

  return null
}

/**
 * Punctuation carries no colour in our palette, but highlight.js still wraps
 * every brace/colon/comma in a span — which dominates the DOM for JSON. Strip
 * those wrappers (text is preserved) so JSON stays light enough to highlight.
 */
function stripPunctuationSpans(html: string): string {
  return html.replace(/<span class="hljs-punctuation">([^<]*)<\/span>/g, '$1')
}

/**
 * Highlight `code` for `language`; returns HTML or null when the language is
 * unknown (caller falls back to plain text — e.g. usda stays unhighlighted).
 */
export function highlightCode(code: string, language: string): string | null {
  const resolved = resolveHighlightLanguage(language)
  if (!resolved) {
    return null
  }

  try {
    return stripPunctuationSpans(hljs.highlight(code, { language: resolved }).value)
  } catch {
    return null
  }
}

export function autoDetectLanguage(content: string) {
  try {
    const result = hljs.highlightAuto(content)
    const resolved = resolveHighlightLanguage(result.language ?? '')
    const language = resolved ?? result.language ?? 'text'
    return {
      language,
      relevance: result.relevance ?? 0,
      secondBest: result.secondBest
        ? {
            language:
              resolveHighlightLanguage(result.secondBest.language ?? '') ??
              result.secondBest.language ??
              'text',
            relevance: result.secondBest.relevance ?? 0,
          }
        : null,
    }
  } catch {
    return { language: 'text', relevance: 0, secondBest: null }
  }
}

export function highlightCodeAuto(content: string, languageHint?: string) {
  const hinted = languageHint ? resolveHighlightLanguage(languageHint) : null

  if (hinted) {
    try {
      return {
        language: hinted,
        html: stripPunctuationSpans(hljs.highlight(content, { language: hinted }).value),
      }
    } catch {
      // fall through to auto-detect
    }
  }

  try {
    const result = hljs.highlightAuto(content)
    const language = resolveHighlightLanguage(result.language ?? '') ?? 'plaintext'
    return {
      language: language === 'plaintext' ? result.language || 'text' : language,
      html: stripPunctuationSpans(result.value),
    }
  } catch {
    return {
      language: hinted ?? 'text',
      html: escapeHtml(content),
    }
  }
}

function escapeHtml(text: string) {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}
