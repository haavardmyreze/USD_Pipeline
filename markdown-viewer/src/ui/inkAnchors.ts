import type { RefObject } from 'react'

function viewportBucketHeight() {
  const topbar = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--topbar-total'),
  )
  return Math.max(window.innerHeight - (Number.isFinite(topbar) ? topbar : 72), 320)
}

export type InkViewport = {
  anchorX: number
  anchorY: number
  /** Pan/zoom viewport origin in ink-overlay coordinates (0 when unset). */
  contentOffsetX?: number
  contentOffsetY?: number
}

function inkOverlayTop() {
  const topbar = Number.parseFloat(
    getComputedStyle(document.documentElement).getPropertyValue('--topbar-total'),
  )
  return Number.isFinite(topbar) ? topbar : 72
}

/** Zoomed document root inside `.doc-col` (paper stack, not the column wrapper). */
export function scrollInkContentRoot(docColRef: RefObject<HTMLElement | null>): HTMLElement | null {
  const column = docColRef.current
  if (!column) {
    return null
  }

  return (
    column.querySelector<HTMLElement>(':scope > .page-stack') ??
    column.querySelector<HTMLElement>(':scope > .card-stack') ??
    column.querySelector<HTMLElement>(':scope > .paper-scroll') ??
    column.querySelector<HTMLElement>(':scope > .pdf-page-stack') ??
    column
  )
}

export function scrollDocumentInkViewportFromRect(
  rect: Pick<DOMRect, 'left' | 'top'> | null | undefined,
  inkOverlayOriginY = inkOverlayTop(),
): InkViewport {
  const contentTop = rect?.top ?? inkOverlayOriginY

  return {
    anchorX: 0,
    anchorY: 0,
    contentOffsetX: rect?.left ?? 0,
    contentOffsetY: contentTop - inkOverlayOriginY,
  }
}

/** Map a pan/zoom content viewport to ink-overlay coordinates. */
export function panZoomInkContentOffset(
  viewportElement: HTMLElement | null,
  inkOverlayOriginY = inkOverlayTop(),
): Pick<InkViewport, 'contentOffsetX' | 'contentOffsetY'> {
  if (!viewportElement) {
    return { contentOffsetX: 0, contentOffsetY: 0 }
  }

  const rect = viewportElement.getBoundingClientRect()
  return {
    contentOffsetX: rect.left,
    contentOffsetY: rect.top - inkOverlayOriginY,
  }
}

/** Document scroll position for markdown and PDF readers. */
export function scrollInkViewport(): InkViewport {
  return { anchorX: 0, anchorY: window.scrollY }
}

/** Scroll readers: store ink in unscaled document space so page zoom does not drift. */
export function scrollDocumentInkViewport(
  docColRef: RefObject<HTMLElement | null>,
  inkOverlayOriginY = inkOverlayTop(),
): InkViewport {
  const contentRoot = scrollInkContentRoot(docColRef)
  return scrollDocumentInkViewportFromRect(contentRoot?.getBoundingClientRect(), inkOverlayOriginY)
}

/** One layer per viewport-height scroll segment in code documents. */
export function codeInkLayerKey() {
  const bucket = Math.floor(window.scrollY / viewportBucketHeight())
  return `code-${bucket}`
}

/** One layer per viewport-height scroll segment in markdown. */
export function markdownInkLayerKey() {
  const bucket = Math.floor(window.scrollY / viewportBucketHeight())
  return `md-${bucket}`
}

/** One layer per visible PDF page. */
export function pdfInkLayerKey(docColRef: RefObject<HTMLElement | null>) {
  const root = docColRef.current
  if (!root) {
    return `pdf-${Math.floor(window.scrollY / viewportBucketHeight())}`
  }

  let bestPage = 0
  let bestVisible = 0

  for (const page of root.querySelectorAll<HTMLElement>('.pdf-page[data-pdf-page]')) {
    const rect = page.getBoundingClientRect()
    const visible = Math.min(rect.bottom, window.innerHeight) - Math.max(rect.top, 0)
    if (visible > bestVisible) {
      bestVisible = visible
      bestPage = Number(page.dataset.pdfPage) || 0
    }
  }

  if (bestPage > 0) {
    return `pdf-page-${bestPage}`
  }

  return `pdf-${Math.floor(window.scrollY / viewportBucketHeight())}`
}

/** One layer per pan segment in the CSV viewport. */
export function csvInkLayerKey(anchorX: number, anchorY: number) {
  const bucket = viewportBucketHeight()
  return `csv-${Math.floor(anchorX / bucket)}-${Math.floor(anchorY / bucket)}`
}

/** @deprecated Use scrollInkViewport().anchorY */
export function inkScrollAnchor() {
  return window.scrollY
}
