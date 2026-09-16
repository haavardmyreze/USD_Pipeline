/**
 * Tree lines in the editor's indentation, echoing the diagram's connectors.
 *
 * Each parent drops a line from under the first letter of its name to its
 * last child, with a short branch across to every child. They are laid out
 * in `ch`, which in a monospace font is exactly one character, so they sit in
 * the whitespace the outline already has and never touch the text.
 */

import type { TreeNode } from './parse'

export function guideMarkup(roots: TreeNode[]): string {
  const out: string[] = []
  const walk = (nodes: TreeNode[]): void => {
    for (const node of nodes) {
      const children = node.children
      if (!children.length) continue
      const x = node.column + 0.5
      const last = children[children.length - 1]!
      out.push(`<span class="guide guide--v" style="--x:${x};--from:${node.line + 1};--to:${last.line}"></span>`)
      for (const child of children) {
        const width = child.column - x - 0.35
        if (width > 0) {
          out.push(`<span class="guide guide--h" style="--x:${x};--line:${child.line};--w:${width}"></span>`)
        }
      }
      walk(children)
    }
  }
  walk(roots)
  return out.join('')
}
