import { describe, expect, it } from 'vitest'
import {
  normalizeLineEndings,
  normalizePastedText,
  restoreCodeLineBreaks,
  restoreMarkdownLineBreaks,
  unescapeLiteralLineBreaks,
} from './normalizeLineBreaks'

describe('normalizeLineBreaks', () => {
  it('normalizes classic and unicode line endings', () => {
    expect(normalizeLineEndings('a\r\nb\rc')).toBe('a\nb\nc')
    expect(normalizeLineEndings('a\u2028b')).toBe('a\nb')
  })

  it('unescapes literal backslash-n when real newlines are missing', () => {
    expect(unescapeLiteralLineBreaks('line one\\nline two')).toBe('line one\nline two')
  })

  it('restores code line breaks on a single pasted line', () => {
    const input = 'import os def main(): print("hi") return 0'
    expect(restoreCodeLineBreaks(input)).toBe(
      'import os\ndef main():\nprint("hi")\nreturn 0',
    )
  })

  it('restores markdown headings and lists on one line', () => {
    const input = '# Title Intro text ## Section - one - two'
    expect(restoreMarkdownLineBreaks(input)).toBe(
      '# Title Intro text\n\n## Section\n- one\n- two',
    )
  })

  it('pretty-prints minified json', () => {
    expect(normalizePastedText('{"name":"demo","enabled":true}', 'code')).toBe(
      '{\n  "name": "demo",\n  "enabled": true\n}',
    )
  })

  it('leaves already well-formed code unchanged', () => {
    const input = 'def add(a, b):\n    return a + b'
    expect(normalizePastedText(input, 'code')).toBe(input)
  })
})
