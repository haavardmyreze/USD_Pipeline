import { describe, expect, it } from 'vitest'
import type { DocumentComment } from '../documentComments'
import { getCodeLineHighlights } from './codeCommentAnchors'

function codeComment(id: string, line: number): DocumentComment {
  return {
    id,
    anchor: { kind: 'code', line, quote: `line ${line}`, globalOffset: line },
    body: 'note',
    createdAt: 0,
    updatedAt: 0,
  }
}

describe('getCodeLineHighlights', () => {
  it('maps comments to their lines', () => {
    const map = getCodeLineHighlights([codeComment('a', 2), codeComment('b', 5)], '')
    expect(map.get(2)?.commentId).toBe('a')
    expect(map.get(5)?.commentId).toBe('b')
    expect(map.get(2)?.className).toBe('code-comment-hit')
  })

  it('marks the active comment and lets it win a shared line', () => {
    const map = getCodeLineHighlights([codeComment('a', 2), codeComment('b', 2)], 'b')
    expect(map.get(2)?.commentId).toBe('b')
    expect(map.get(2)?.className).toContain('code-comment-active')
  })

  it('ignores non-code anchors', () => {
    const markdownComment: DocumentComment = {
      id: 'm',
      anchor: { kind: 'markdown', start: 0, end: 4, quote: 'text', headingId: '' },
      body: 'x',
      createdAt: 0,
      updatedAt: 0,
    }
    expect(getCodeLineHighlights([markdownComment], '').size).toBe(0)
  })
})
