export type ViewportAnchor = {
  id: string
  x: number
  y: number
  documentOrder: number
  inViewport: boolean
}

export type ViewportConnector = {
  id: string
  d: string
}

export type FixedCardPosition = {
  top: number
  zIndex: number
}

const CARD_GAP = 10
const ESTIMATED_CARD_HEIGHT = 128
const VIEWPORT_PAD = 12
const CONNECTOR_STUB = 24
const CONNECTOR_CARD_INSET = 10

export function getViewportVerticalBounds() {
  const topbar = parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--topbar-total'),
  )
  const top = (Number.isFinite(topbar) ? topbar : 72) + VIEWPORT_PAD
  const bottom = window.innerHeight - VIEWPORT_PAD
  return { top, bottom }
}

export function isRectInViewport(rect: DOMRect) {
  return rect.bottom > 0 && rect.top < window.innerHeight && rect.width + rect.height > 0
}

export function stackFixedCardTops(
  items: ViewportAnchor[],
  heights: Map<string, number>,
): Map<string, FixedCardPosition> {
  const { top: minTop } = getViewportVerticalBounds()
  const sorted = [...items].sort((left, right) => left.documentOrder - right.documentOrder)
  let nextTop = minTop
  const tops = new Map<string, FixedCardPosition>()

  sorted.forEach((item, index) => {
    const height = heights.get(item.id) ?? ESTIMATED_CARD_HEIGHT
    tops.set(item.id, {
      top: nextTop,
      zIndex: index + 1,
    })
    nextTop += height + CARD_GAP
  })

  return tops
}

export function measureHighlightAnchor(element: HTMLElement, documentOrder: number): ViewportAnchor | null {
  const rect = element.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return null
  }

  return {
    id: element.dataset.commentId ?? '',
    x: rect.right,
    y: rect.top + rect.height / 2,
    documentOrder,
    inViewport: isRectInViewport(rect),
  }
}

export function measureRangeAnchor(range: Range, documentOrder: number): ViewportAnchor | null {
  const rect = range.getBoundingClientRect()
  if (rect.width === 0 && rect.height === 0) {
    return null
  }

  return {
    id: 'draft',
    x: rect.right,
    y: rect.top + rect.height / 2,
    documentOrder,
    inViewport: isRectInViewport(rect),
  }
}

export function buildViewportConnector(
  id: string,
  highlightRect: DOMRect,
  card: HTMLElement,
): ViewportConnector {
  const cardRect = card.getBoundingClientRect()
  const anchorX = highlightRect.right
  const anchorY = highlightRect.top + highlightRect.height / 2
  const cardLeft = cardRect.left
  const cardCenterY = cardRect.top + cardRect.height / 2

  // Long horizontal from the highlight, then vertical just beside the comment box.
  const elbowX = Math.max(anchorX + CONNECTOR_STUB, cardLeft - CONNECTOR_CARD_INSET)

  const d = `M ${anchorX} ${anchorY} L ${elbowX} ${anchorY} L ${elbowX} ${cardCenterY} L ${cardLeft} ${cardCenterY}`

  return { id, d }
}

export { CARD_GAP, ESTIMATED_CARD_HEIGHT }
