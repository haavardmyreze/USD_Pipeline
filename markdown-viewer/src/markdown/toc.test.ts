import { describe, expect, it } from 'vitest'
import { extractToc, shouldShowTocEntry } from './toc'

describe('extractToc', () => {
  it('extracts h1–h3 with levels', () => {
    const toc = extractToc('# One\n\n## Two\n\n### Three\n\n#### Four')
    expect(toc.map((entry) => entry.level)).toEqual([1, 2, 3])
  })

  it('gives duplicate headings unique ids', () => {
    const toc = extractToc('## Setup\n\ntext\n\n## Setup')
    expect(toc[0].id).not.toBe(toc[1].id)
    expect(toc[1].id).toBe(`${toc[0].id}-2`)
  })

  it('assigns chapters from h1 when present', () => {
    const toc = extractToc('# A\n\n## A1\n\n# B\n\n## B1')
    const b1 = toc.find((entry) => entry.text === 'B1')
    const b = toc.find((entry) => entry.text === 'B')
    expect(b1?.chapterId).toBe(b?.id)
  })

  it('promotes h2 to chapters when there is no h1', () => {
    const toc = extractToc('## A\n\n### A1\n\n## B')
    const a1 = toc.find((entry) => entry.text === 'A1')
    const a = toc.find((entry) => entry.text === 'A')
    expect(a1?.chapterId).toBe(a?.id)
  })

  it('resolves link syntax to text', () => {
    const toc = extractToc('## See [the docs](https://example.com)')
    expect(toc[0].text).toBe('See the docs')
  })

  it('ignores headings inside code fences', () => {
    const toc = extractToc('```\n# not a heading\n```\n\n## Real')
    expect(toc).toHaveLength(1)
    expect(toc[0].text).toBe('Real')
  })
})

describe('shouldShowTocEntry', () => {
  const toc = extractToc('# A\n\n## A1\n\n### A1a\n\n# B\n\n## B1')
  const byText = (text: string) => toc.find((entry) => entry.text === text)!

  it('always shows chapters', () => {
    expect(shouldShowTocEntry(byText('B'), byText('A').id, '', true)).toBe(true)
  })

  it('shows h2 only inside the active chapter', () => {
    expect(
      shouldShowTocEntry(byText('A1'), byText('A').id, byText('A1').id, true),
    ).toBe(true)
    expect(
      shouldShowTocEntry(byText('B1'), byText('A').id, byText('A1').id, true),
    ).toBe(false)
  })

  it('shows h3 only inside the active section', () => {
    expect(
      shouldShowTocEntry(byText('A1a'), byText('A').id, byText('A1').id, true),
    ).toBe(true)
    expect(
      shouldShowTocEntry(byText('A1a'), byText('B').id, byText('B1').id, true),
    ).toBe(false)
  })
})
