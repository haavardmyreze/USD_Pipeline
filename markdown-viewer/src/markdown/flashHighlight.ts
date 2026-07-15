// Temporary in-document highlight of search matches, plus heading/viewport
// anchor helpers shared by the markdown reader.

import { escapeRegExp } from '../ui/highlight'

export function createSearchRegex(query: string): RegExp | null {
  const tokens = query
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length >= 2)

  if (tokens.length === 0) {
    return null
  }

  return new RegExp(`(${tokens.map(escapeRegExp).join('|')})`, 'gi')
}

export function getHeadingElement(id: string, scope?: ParentNode | null) {
  const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const root = scope ?? document
  return root.querySelector<HTMLElement>(`#${escapedId}`)
}

export function captureAnchorFromViewport(
  scope: ParentNode | null,
  headingIds: string[],
): string {
  if (headingIds.length === 0) {
    return ''
  }

  const activationLine = Math.max(160, window.innerHeight * 0.35)
  let anchorId = headingIds[0]

  for (const id of headingIds) {
    const element = getHeadingElement(id, scope)
    if (!element) {
      continue
    }

    if (element.getBoundingClientRect().top - activationLine <= 0) {
      anchorId = id
    } else {
      break
    }
  }

  return anchorId
}

function getSectionRange(scope: HTMLElement, sectionId: string) {
  const heading = scope.querySelector<HTMLElement>(`#${CSS.escape(sectionId)}`)
  if (!heading) {
    return null
  }

  const levelMatch = /^H([1-3])$/i.exec(heading.tagName)
  if (!levelMatch) {
    return null
  }
  const level = Number(levelMatch[1])

  const headings = Array.from(
    scope.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'),
  )
  const currentIndex = headings.findIndex((item) => item.id === sectionId)
  if (currentIndex === -1) {
    return null
  }

  let endBoundary: HTMLElement | null = null
  for (let index = currentIndex + 1; index < headings.length; index += 1) {
    const candidate = headings[index]
    const candidateLevel = Number(candidate.tagName.slice(1))
    if (candidateLevel <= level) {
      endBoundary = candidate
      break
    }
  }

  const range = document.createRange()
  range.setStartBefore(heading)
  if (endBoundary) {
    range.setEndBefore(endBoundary)
  } else {
    range.setEnd(scope, scope.childNodes.length)
  }

  return range
}

const MAX_FLASH_MATCHES = 180

export function flashHighlightInDocument(
  scope: HTMLElement,
  query: string,
  sectionId = '',
  autoScrollToFirstMatch = false,
): () => void {
  const pattern = createSearchRegex(query)
  if (!pattern) {
    return () => {}
  }

  const sectionRange = sectionId ? getSectionRange(scope, sectionId) : null
  const walker = document.createTreeWalker(scope, NodeFilter.SHOW_TEXT)
  const edited: HTMLElement[] = []
  let totalMatches = 0

  while (walker.nextNode()) {
    const node = walker.currentNode as Text
    const value = node.nodeValue ?? ''
    if (!value.trim()) {
      continue
    }

    const parent = node.parentElement
    if (!parent) {
      continue
    }

    if (sectionRange && !sectionRange.intersectsNode(node)) {
      continue
    }

    if (
      parent.closest(
        'pre, code, mark, .page-running-header, .page-number, .comment-rail-fixed, .assistant-panel, .search-panel',
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
      const index = match.index ?? 0
      const found = match[0]

      if (index > lastIndex) {
        fragment.appendChild(document.createTextNode(value.slice(lastIndex, index)))
      }

      const marker = document.createElement('mark')
      marker.className = 'search-flash-highlight'
      marker.textContent = found
      fragment.appendChild(marker)
      edited.push(marker)

      totalMatches += 1
      lastIndex = index + found.length
      if (totalMatches >= MAX_FLASH_MATCHES) {
        break
      }
    }

    if (lastIndex < value.length) {
      fragment.appendChild(document.createTextNode(value.slice(lastIndex)))
    }

    node.parentNode?.replaceChild(fragment, node)

    if (totalMatches >= MAX_FLASH_MATCHES) {
      break
    }
  }

  if (autoScrollToFirstMatch && edited.length > 0) {
    const first = edited[0]
    const rect = first.getBoundingClientRect()
    if (rect.top < 120 || rect.bottom > window.innerHeight - 120) {
      first.scrollIntoView({ behavior: 'smooth', block: 'center' })
    }
  }

  return () => {
    edited.forEach((marker) => {
      const parent = marker.parentNode
      if (!parent) {
        return
      }
      parent.replaceChild(document.createTextNode(marker.textContent ?? ''), marker)
      parent.normalize()
    })
  }
}
