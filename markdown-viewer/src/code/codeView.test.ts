import { describe, expect, it } from 'vitest'
import {
  countCodeLines,
  formatCodeGutter,
  prepareCodeView,
  shouldHighlightCode,
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
    expect(view.html).not.toContain('<span')
  })

  it('formats gutter text as one block', () => {
    expect(formatCodeGutter(3)).toBe('1\n2\n3')
  })

  it('uses a lower highlight threshold for json', () => {
    const content = `${'  "key": "value",\n'.repeat(900)}  "tail": true\n`
    expect(shouldHighlightCode(content, 'json')).toBe(false)
    expect(shouldHighlightCode(content, 'python')).toBe(true)
  })
})
