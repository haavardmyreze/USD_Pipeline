import { describe, expect, it } from 'vitest'
import { detectClipboardPaste } from './detectClipboardPaste'

describe('detectClipboardPaste', () => {
  it('keeps markdown documents as markdown', () => {
    const result = detectClipboardPaste('# Notes\n\n- one\n- two')
    expect(result.format).toBe('markdown')
    expect(result.fileName).toBe('clipboard.md')
  })

  it('detects python snippets as code', () => {
    const result = detectClipboardPaste('def add(a, b):\n    return a + b')
    expect(result.format).toBe('code')
    expect(result.fileName).toBe('clipboard.py')
    if (result.format === 'code') {
      expect(result.language).toBe('python')
    }
  })

  it('detects json payloads as code', () => {
    const result = detectClipboardPaste('{\n  "name": "demo"\n}')
    expect(result.format).toBe('code')
    expect(result.fileName).toBe('clipboard.json')
  })

  it('detects java snippets as code', () => {
    const result = detectClipboardPaste('public class Main {\n  public static void main(String[] args) {}\n}')
    expect(result.format).toBe('code')
    expect(result.fileName).toBe('clipboard.java')
    if (result.format === 'code') {
      expect(result.language).toBe('java')
    }
  })

  it('treats plain prose as markdown', () => {
    const result = detectClipboardPaste(
      'This is a longer note pasted from another app with several words in it.',
    )
    expect(result.format).toBe('markdown')
    expect(result.fileName).toBe('clipboard.md')
  })

  it('detects shebang scripts as code', () => {
    const result = detectClipboardPaste('#!/usr/bin/env python3\nprint("hi")')
    expect(result.format).toBe('code')
    expect(result.fileName).toBe('clipboard.py')
  })

  it('normalizes single-line pasted code during detection', () => {
    const result = detectClipboardPaste('import os def main(): print("hi") return 0')
    expect(result.format).toBe('code')
    if (result.format === 'code') {
      expect(result.content).toContain('\n')
      expect(result.content).toMatch(/^import os\ndef main/m)
    }
  })
})
