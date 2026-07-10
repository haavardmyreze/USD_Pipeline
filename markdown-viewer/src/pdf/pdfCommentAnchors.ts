import type { PdfCommentAnchor } from '../documentComments'
import type { PdfPageIndex } from './pdfDocument'

function getPageNumberFromNode(node: Node | null) {
  let current: Node | null = node

  while (current) {
    if (current instanceof HTMLElement) {
      const page = current.closest<HTMLElement>('[data-pdf-page]')
      if (page?.dataset.pdfPage) {
        return Number(page.dataset.pdfPage)
      }
    }
    current = current.parentNode
  }

  return 0
}

function getTextLayerFromNode(node: Node | null) {
  let current: Node | null = node

  while (current) {
    if (current instanceof HTMLElement) {
      const textLayer = current.closest<HTMLElement>('.pdf-text-layer')
      if (textLayer) {
        return textLayer
      }
    }
    current = current.parentNode
  }

  return null
}

function getOffsetInTextLayer(textLayer: HTMLElement, container: Node, offset: number) {
  const measure = document.createRange()
  measure.selectNodeContents(textLayer)
  measure.setEnd(container, offset)
  return measure.toString().length
}

export function resolvePdfSelectionAnchor(
  selection: Selection,
  scope: HTMLElement,
  pages: PdfPageIndex[],
): PdfCommentAnchor | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!scope.contains(range.commonAncestorContainer)) {
    return null
  }

  const quote = selection.toString().trim()
  if (!quote) {
    return null
  }

  const page = getPageNumberFromNode(range.commonAncestorContainer)
  if (!page) {
    return null
  }

  const textLayer = getTextLayerFromNode(range.commonAncestorContainer)
  if (!textLayer) {
    return null
  }

  const pageIndex = pages.find((entry) => entry.pageNumber === page)
  if (!pageIndex) {
    return null
  }

  const charOffset = getOffsetInTextLayer(textLayer, range.startContainer, range.startOffset)
  const charEnd = getOffsetInTextLayer(textLayer, range.endContainer, range.endOffset)

  return {
    kind: 'pdf',
    page,
    quote,
    charOffset,
    charEnd: Math.max(charEnd, charOffset + 1),
    globalOffset: pageIndex.globalOffset + charOffset,
  }
}
