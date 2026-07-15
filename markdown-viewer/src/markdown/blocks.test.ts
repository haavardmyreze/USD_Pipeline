import { describe, expect, it } from 'vitest'
import {
  computeBlockMeta,
  splitMarkdownBlocks,
  splitMarkdownIntoCards,
} from './blocks'

describe('splitMarkdownBlocks', () => {
  it('splits on blank lines', () => {
    const blocks = splitMarkdownBlocks('one\n\ntwo\n\nthree')
    expect(blocks).toEqual(['one', 'two', 'three'])
  })

  it('keeps fenced code together even with blank lines inside', () => {
    const source = '```js\nconst a = 1\n\nconst b = 2\n```\n\nafter'
    const blocks = splitMarkdownBlocks(source)
    expect(blocks).toHaveLength(2)
    expect(blocks[0]).toContain('const a = 1\n\nconst b = 2')
    expect(blocks[1]).toBe('after')
  })

  it('handles tilde fences', () => {
    const source = '~~~\ncode\n\nmore\n~~~'
    expect(splitMarkdownBlocks(source)).toHaveLength(1)
  })

  it('drops empty blocks', () => {
    expect(splitMarkdownBlocks('\n\n\na\n\n\n')).toEqual(['a'])
  })
})

describe('computeBlockMeta', () => {
  it('marks h2 as break + subheader, h3 as subheader only', () => {
    const meta = computeBlockMeta(['# Title', 'text', '## Section', '### Sub'])
    expect(meta[0]).toMatchObject({ isBreak: false, isSubHeader: false })
    expect(meta[2]).toMatchObject({ isBreak: true, isSubHeader: true })
    expect(meta[3]).toMatchObject({ isBreak: false, isSubHeader: true })
  })

  it('tracks the running header (h2 wins over h1)', () => {
    const meta = computeBlockMeta(['# Doc', 'a', '## One', 'b', '# Two', 'c'])
    expect(meta[1].header).toBe('Doc')
    expect(meta[3].header).toBe('One')
    expect(meta[5].header).toBe('Two')
  })

  it('strips inline markup from headers', () => {
    const meta = computeBlockMeta(['## `code` and *em*'])
    expect(meta[0].header).toBe('code and em')
  })
})

describe('splitMarkdownIntoCards', () => {
  it('starts a new card at every h2', () => {
    const cards = splitMarkdownIntoCards('# T\n\nintro\n\n## A\n\na\n\n## B\n\nb')
    expect(cards).toHaveLength(3)
    expect(cards[0].content).toContain('intro')
    expect(cards[1].content).toContain('## A')
    expect(cards[2].content).toContain('## B')
  })

  it('returns the whole source as one card when there are no breaks', () => {
    const cards = splitMarkdownIntoCards('just text\n\nmore text')
    expect(cards).toHaveLength(1)
  })

  it('labels cards with their running header', () => {
    const cards = splitMarkdownIntoCards('# T\n\nintro\n\n## A\n\na')
    expect(cards[1].header).toBe('A')
  })
})
