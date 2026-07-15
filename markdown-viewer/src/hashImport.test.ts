import { describe, expect, it } from 'vitest'
import { parseHashImport } from './hashImport'

describe('parseHashImport', () => {
  it('parses markdown text payloads', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        name: 'note.md',
        mime: 'text/markdown',
        text: '# Hello',
      }),
    )

    const doc = parseHashImport(`#import=${payload}`)
    expect(doc?.fileName).toBe('note.md')
    expect(doc?.source.format).toBe('markdown')
    if (doc?.source.format === 'markdown') {
      expect(doc.source.content).toBe('# Hello')
    }
  })

  it('parses pdf base64 payloads', () => {
    const payload = encodeURIComponent(
      JSON.stringify({
        name: 'report.pdf',
        mime: 'application/pdf',
        base64: btoa('%PDF-1.4'),
      }),
    )

    const doc = parseHashImport(`#import=${payload}`)
    expect(doc?.fileName).toBe('report.pdf')
    expect(doc?.source.format).toBe('pdf')
  })
})
