import { describe, expect, it } from 'vitest'
import type { BlockMeta } from './blocks'
import { packBlocksIntoPages, pageContentHeightPx } from './paginate'

const plain = (header = ''): BlockMeta => ({
  isBreak: false,
  isSubHeader: false,
  header,
})
const sectionStart = (header: string): BlockMeta => ({
  isBreak: true,
  isSubHeader: true,
  header,
})
const subHeader = (header = ''): BlockMeta => ({
  isBreak: false,
  isSubHeader: true,
  header,
})

// Stacked measurements: each block `height` tall, laid out consecutively.
function stack(heights: number[]) {
  let top = 0
  return heights.map((height) => {
    const box = { top, height }
    top += height
    return box
  })
}

describe('packBlocksIntoPages', () => {
  it('returns one page when everything fits', () => {
    const pages = packBlocksIntoPages({
      blocks: ['a', 'b'],
      meta: [plain(), plain()],
      measurements: stack([100, 100]),
      contentHeightPx: 500,
      widowThresholdPx: 100,
    })
    expect(pages).toHaveLength(1)
    expect(pages[0].content).toBe('a\n\nb')
  })

  it('breaks when content exceeds the page height', () => {
    const pages = packBlocksIntoPages({
      blocks: ['a', 'b', 'c'],
      meta: [plain(), plain(), plain()],
      measurements: stack([300, 300, 300]),
      contentHeightPx: 500,
      widowThresholdPx: 100,
    })
    expect(pages).toHaveLength(3)
  })

  it('always breaks before a section start (h2)', () => {
    const pages = packBlocksIntoPages({
      blocks: ['intro', '## A', 'body'],
      meta: [plain('Doc'), sectionStart('A'), plain('A')],
      measurements: stack([50, 40, 50]),
      contentHeightPx: 1000,
      widowThresholdPx: 100,
    })
    expect(pages).toHaveLength(2)
    expect(pages[1].content).toContain('## A')
    expect(pages[1].header).toBe('A')
  })

  it('pushes a widowed sub-header to the next page', () => {
    // Sub-header lands with only 60px left on a 500px page; threshold 100px.
    const pages = packBlocksIntoPages({
      blocks: ['long', '### Sub', 'body'],
      meta: [plain(), subHeader(), plain()],
      measurements: stack([440, 30, 200]),
      contentHeightPx: 500,
      widowThresholdPx: 100,
    })
    expect(pages).toHaveLength(2)
    expect(pages[1].content).toContain('### Sub')
  })

  it('keeps a sub-header in place when there is room', () => {
    const pages = packBlocksIntoPages({
      blocks: ['short', '### Sub', 'body'],
      meta: [plain(), subHeader(), plain()],
      measurements: stack([100, 30, 200]),
      contentHeightPx: 500,
      widowThresholdPx: 100,
    })
    expect(pages).toHaveLength(1)
  })

  it('returns no pages for empty input', () => {
    expect(
      packBlocksIntoPages({
        blocks: [],
        meta: [],
        measurements: [],
        contentHeightPx: 500,
        widowThresholdPx: 100,
      }),
    ).toEqual([])
  })
})

describe('pageContentHeightPx', () => {
  it('is positive and ordered by page size', () => {
    expect(pageContentHeightPx('A5')).toBeGreaterThan(0)
    expect(pageContentHeightPx('A4')).toBeGreaterThan(pageContentHeightPx('A5'))
    expect(pageContentHeightPx('A3')).toBeGreaterThan(pageContentHeightPx('A4'))
  })
})
