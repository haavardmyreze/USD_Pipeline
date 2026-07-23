import { describe, expect, it } from 'vitest'
import { isCodeFileName, languageFromFileName } from './codeExtensions'
import { detectCodeLanguage, formatLanguageLabel } from './detectLanguage'

describe('codeExtensions', () => {
  it('recognizes common source extensions', () => {
    expect(isCodeFileName('script.py')).toBe(true)
    expect(isCodeFileName('data.json')).toBe(true)
    expect(isCodeFileName('Main.java')).toBe(true)
    expect(isCodeFileName('notes.md')).toBe(false)
  })

  it('maps extensions to highlight.js languages', () => {
    expect(languageFromFileName('app.ts')).toBe('typescript')
    expect(languageFromFileName('shader.glsl')).toBe('glsl')
    expect(languageFromFileName('readme.txt')).toBeNull()
  })
})

describe('detectCodeLanguage', () => {
  it('uses the file extension first', () => {
    expect(detectCodeLanguage('example.py', 'const x = 1')).toBe('python')
    expect(detectCodeLanguage('config.json', 'print("hi")')).toBe('json')
  })

  it('reads shebang interpreters', () => {
    expect(detectCodeLanguage('run', '#!/usr/bin/env python3\nprint(1)')).toBe('python')
  })

  it('reads vim modelines', () => {
    expect(
      detectCodeLanguage(
        'snippet',
        'print("hi")\n# vim: ft=python',
      ),
    ).toBe('python')
  })
})

describe('formatLanguageLabel', () => {
  it('formats known languages', () => {
    expect(formatLanguageLabel('python')).toBe('Python')
    expect(formatLanguageLabel('csharp')).toBe('C#')
  })
})
