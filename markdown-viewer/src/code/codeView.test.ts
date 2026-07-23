import { describe, expect, it } from 'vitest'
import {
  countCodeLines,
  prepareCodeView,
  shouldHighlightCode,
  splitHighlightedLines,
  wrapCodeLines,
} from './codeView'

describe('codeView', () => {
  it('counts lines without splitting the whole file', () => {
    expect(countCodeLines('a\nb\nc')).toBe(3)
    expect(countCodeLines('single')).toBe(1)
  })

  it('skips highlighting for large content', () => {
    const content = 'x'.repeat(120_001)
    expect(shouldHighlightCode(content)).toBe(false)
    const view = prepareCodeView(content, 'json')
    expect(view.highlighted).toBe(false)
    // Lines are still chunked (so virtualization applies), but no highlight
    // tokens are emitted for oversized content.
    expect(view.html).not.toContain('hljs-')
    expect(view.html).toContain('class="code-chunk"')
  })

  it('highlights json on the same line threshold as other code', () => {
    // Punctuation spans are stripped before render, so JSON no longer needs a
    // lower ceiling — it highlights like any other language under the caps.
    const content = `${'  "key": "value",\n'.repeat(900)}  "tail": true\n`
    expect(shouldHighlightCode(content, 'json')).toBe(true)
    expect(shouldHighlightCode(content, 'python')).toBe(true)
  })

  it('still skips json highlighting past the character cap', () => {
    const content = `{"data":"${'x'.repeat(120_001)}"}`
    expect(shouldHighlightCode(content, 'json')).toBe(false)
  })

  it('splits plain text into one entry per line', () => {
    expect(splitHighlightedLines('a\nb\nc')).toEqual(['a', 'b', 'c'])
    expect(splitHighlightedLines('only')).toEqual(['only'])
    expect(splitHighlightedLines('a\n\nb')).toEqual(['a', '', 'b'])
  })

  it('keeps spans balanced when a token spans a newline', () => {
    const html = '<span class="hljs-comment">/* line one\nline two */</span>'
    const lines = splitHighlightedLines(html)
    expect(lines).toEqual([
      '<span class="hljs-comment">/* line one</span>',
      '<span class="hljs-comment">line two */</span>',
    ])
    // Every produced line has matching open/close counts.
    for (const line of lines) {
      const opens = (line.match(/<span\b/g) ?? []).length
      const closes = (line.match(/<\/span>/g) ?? []).length
      expect(opens).toBe(closes)
    }
  })

  it('wraps each line as an addressable block inside one chunk when small', () => {
    const wrapped = wrapCodeLines('a\nb')
    expect(wrapped).toBe(
      '<span class="code-chunk" style="--chunk-lines:2">' +
        '<span class="code-line" id="code-line-0" data-line="0" data-ln="1">a</span>' +
        '<span class="code-line" id="code-line-1" data-line="1" data-ln="2">b</span>' +
        '</span>',
    )
  })

  it('splits into multiple chunks past the chunk size', () => {
    const wrapped = wrapCodeLines(Array.from({ length: 120 }, (_, i) => `l${i}`).join('\n'))
    const chunks = wrapped.match(/class="code-chunk"/g) ?? []
    expect(chunks).toHaveLength(3) // 50 + 50 + 20
    expect(wrapped).toContain('style="--chunk-lines:20"')
    // Line ids are globally sequential across chunks.
    expect(wrapped).toContain('data-line="0"')
    expect(wrapped).toContain('data-line="119"')
    expect((wrapped.match(/class="code-line"/g) ?? []).length).toBe(120)
  })

  it('wraps highlighted output into code-chunk blocks', () => {
    const view = prepareCodeView('{"a": 1}\n', 'json')
    expect(view.highlighted).toBe(true)
    expect(view.html.startsWith('<span class="code-chunk"')).toBe(true)
    // hljs punctuation spans are stripped upstream, so none leak through.
    expect(view.html).not.toContain('hljs-punctuation')
  })
})
