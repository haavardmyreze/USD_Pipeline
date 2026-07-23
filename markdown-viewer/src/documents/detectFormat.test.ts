import { describe, expect, it } from 'vitest'
import { detectFormatFromSrc } from './detectFormat'

describe('detectFormatFromSrc', () => {
  it('uses the file name for data URLs', () => {
    expect(
      detectFormatFromSrc('data:application/octet-stream;base64,AAAA', 'report.pdf'),
    ).toBe('pdf')
  })

  it('detects pdf data URLs from mime type', () => {
    expect(detectFormatFromSrc('data:application/pdf;base64,AAAA')).toBe('pdf')
  })

  it('detects markdown data URLs from mime type', () => {
    expect(detectFormatFromSrc('data:text/markdown;charset=utf-8,hello')).toBe('markdown')
  })

  it('detects code files from extension', () => {
    expect(detectFormatFromSrc('file:///tmp/app.py', 'app.py')).toBe('code')
    expect(detectFormatFromSrc('file:///tmp/Main.java', 'Main.java')).toBe('code')
  })

  it('detects json data URLs as code', () => {
    expect(detectFormatFromSrc('data:application/json;charset=utf-8,{}')).toBe('code')
  })
})
