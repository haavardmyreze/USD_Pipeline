import { describe, expect, it } from 'vitest'
import { lineMatchesQuery, searchCode } from './codeSearch'

describe('codeSearch', () => {
  const sample = ['const total = sum(a, b)', '', 'function sum(a, b) {', '  return a + b', '}'].join(
    '\n',
  )

  it('returns matching lines in document order', () => {
    const results = searchCode(sample, 'sum')
    expect(results.map((result) => result.line)).toEqual([0, 2])
    expect(results[0].id).toBe('code-line-0')
    expect(results[0].lineNumber).toBe(1)
  })

  it('ignores blank and non-matching lines', () => {
    expect(searchCode(sample, 'return').map((r) => r.line)).toEqual([3])
    expect(searchCode(sample, 'nonexistent')).toEqual([])
  })

  it('returns nothing for an empty query', () => {
    expect(searchCode(sample, '   ')).toEqual([])
  })

  it('builds a trimmed snippet around the match', () => {
    const [result] = searchCode('        deeply.indented.match.here()', 'match')
    expect(result.snippet).toContain('match')
    expect(result.snippet.startsWith(' ')).toBe(false)
  })

  it('lineMatchesQuery matches substrings case-insensitively', () => {
    expect(lineMatchesQuery('const Sum = 1', 'sum')).toBe(true)
    expect(lineMatchesQuery('const total', 'sum')).toBe(false)
    expect(lineMatchesQuery('', 'sum')).toBe(false)
  })
})
