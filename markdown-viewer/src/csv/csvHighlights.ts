import type { DocumentComment } from '../documentComments'
import { isCsvCommentAnchor } from '../documents/commentAnchorUtils'

export function getCsvCellHighlight(
  row: number,
  col: number,
  comments: DocumentComment[],
  activeCommentId: string,
) {
  let className = ''
  let commentId = ''

  for (const comment of comments) {
    if (!isCsvCommentAnchor(comment.anchor)) {
      continue
    }

    if (comment.anchor.row !== row || comment.anchor.col !== col) {
      continue
    }

    className =
      comment.id === activeCommentId
        ? 'csv-comment-hit csv-comment-hit-active'
        : 'csv-comment-hit'
    commentId = comment.id
  }

  return { className, commentId }
}
