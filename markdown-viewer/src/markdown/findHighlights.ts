// Persistent find-in-document: wraps every match in a <mark> that stays
// until the query changes or the panel closes. Unlike the section flash,
// matches inside code blocks count — pipeline docs live in code.

import { createSearchRegex } from './flashHighlight'

const MAX_FIND_MATCHES = 400

export type FindHighlights = {
  marks: HTMLElement[]
  clear: () => void
}

const EMPTY: FindHighlights = { marks: [], clear: () => {} }

export function applyFindHighlights(
  scope: HTMLElement,
  query: string,
): FindHighlights {
  const pattern = createSearchRegex(query)
  if (!pattern) {
    return EMPTY
  }

  // Snapshot text nodes first — we mutate the tree while marking.
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const textNodes: Text[] = []
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text)
  }

  const marks: HTMLElement[] = []

  for (const node of textNodes) {
    if (marks.length >= MAX_FIND_MATCHES) {
      break
    }

    const value = node.nodeValue ?? ''
    if (!value.trim()) {
      continue
    }

    const parent = node.parentElement
    if (!parent) {
      continue
    }

    if (
      parent.closest(
        'mark, .page-running-header, .page-number, .comment-rail-fixed, .assistant-panel, .search-panel',
      )
    ) {
      continue
    }

    const matches = [...value.matchAll(pattern)]
    if (matches.length === 0) {
      continue
    }

    const fragment = document.createDocumentFragment()
    let lastIndex = 0

    for (const match of matches) {
      if (marks.length >= MAX_FIND_MATCHES) {
        break
      }

      const index = match.index ?? 0
      const found = match[0]

      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)))
      }

      const marker = document.createElement('mark')
      marker.className = 'find-highlight'
      marker.textContent = found
      fragment.appendChild(marker)
      marks.push(marker)
      lastIndex = index + found.length
    }

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)))
    }

    node.parentNode?.replaceChild(fragment, node)
  }

  return {
    marks,
    clear: () => {
      for (const marker of marks) {
        const parent = marker.parentNode
        if (!parent) {
          continue
        }
        parent.replaceChild(
          document.createTextNode(marker.textContent ?? ''),
          marker,
        )
        parent.normalize()
      }
    },
  }
}
