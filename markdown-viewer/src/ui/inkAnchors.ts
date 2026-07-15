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
}

/** Document scroll position for markdown and PDF readers. */
export function scrollInkViewport(): InkViewport {
  return { anchorX: 0, anchorY: window.scrollY }
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
