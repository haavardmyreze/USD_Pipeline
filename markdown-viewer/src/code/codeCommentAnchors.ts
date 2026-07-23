import type { CodeCommentAnchor, DocumentComment } from '../documentComments'

/** Walk up from a node to the nearest addressable code line element. */
function getLineFromNode(node: Node | null) {
  let current: Node | null = node

  while (current) {
    if (current instanceof HTMLElement) {
      const lineElement = current.closest<HTMLElement>('.code-line[data-line]')
      if (lineElement?.dataset.line) {
        return {
          line: Number(lineElement.dataset.line),
          element: lineElement,
        }
      }
    }
    current = current.parentNode
  }

  return null
}

/**
 * Resolve a text selection to a whole-line comment anchor. The anchor records
 * the line index and the line's text as a quote (so it survives edits), keyed
 * to the first line the selection touches.
 */
export function resolveCodeSelectionAnchor(
  selection: Selection,
  scope: HTMLElement,
  lines: string[],
): CodeCommentAnchor | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!scope.contains(range.commonAncestorContainer)) {
    return null
  }

  const hit = getLineFromNode(range.startContainer) ?? getLineFromNode(range.commonAncestorContainer)
  if (!hit || !Number.isFinite(hit.line)) {
    return null
  }

  const lineText = lines[hit.line] ?? hit.element.textContent ?? ''
  const quote = lineText.trim() || selection.toString().trim()

  return {
    kind: 'code',
    line: hit.line,
    quote,
    globalOffset: hit.line,
  }
}

export type CodeLineHighlight = {
  className: string
  commentId: string
}

/**
 * Which comment (if any) owns a given line, and whether it's the active one.
 * Used to toggle highlight classes on line elements after render.
 */
export function getCodeLineHighlights(
  comments: DocumentComment[],
  activeCommentId: string,
): Map<number, CodeLineHighlight> {
  const byLine = new Map<number, CodeLineHighlight>()

  for (const comment of comments) {
    if (comment.anchor.kind !== 'code') {
      continue
    }

    const line = comment.anchor.line
    const isActive = comment.id === activeCommentId
    const existing = byLine.get(line)

    // Active comment wins the line's styling.
    if (!existing || isActive) {
      byLine.set(line, {
        className: isActive ? 'code-comment-hit code-comment-active' : 'code-comment-hit',
        commentId: comment.id,
      })
    }
  }

  return byLine
}
