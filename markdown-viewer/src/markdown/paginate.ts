// Layout-aware pagination, split into a pure packing algorithm (testable with
// synthetic measurements) and the page-geometry constants it needs.

import type { BlockMeta, PageData } from './blocks'
import type { PageSize } from '../readerConfig'

export const PAGE_SIZES: Record<
  PageSize,
  {
    widthMm: number
    heightMm: number
    paddingTopMm: number
    paddingHorizontalMm: number
  }
> = {
  A3: { widthMm: 297, heightMm: 420, paddingTopMm: 24, paddingHorizontalMm: 20 },
  A4: { widthMm: 210, heightMm: 297, paddingTopMm: 22, paddingHorizontalMm: 18 },
  A5: { widthMm: 148, heightMm: 210, paddingTopMm: 16, paddingHorizontalMm: 13 },
}

export const MM_TO_PX = 3.7795275591

// Small safety margin: pages have a fixed height with overflow hidden, so err
// toward breaking a hair early rather than clipping the last block.
const SAFETY_PX = 6

export function pageContentHeightPx(pageSize: PageSize): number {
  const page = PAGE_SIZES[pageSize]
  return (page.heightMm - page.paddingTopMm * 2) * MM_TO_PX - SAFETY_PX
}

export type BlockMeasurement = {
  top: number
  height: number
}

export type PackOptions = {
  blocks: string[]
  meta: BlockMeta[]
  measurements: BlockMeasurement[]
  contentHeightPx: number
  /** Minimum space (px) a sub-header needs at the bottom of a page before we
   *  push it to the next page instead of leaving it widowed. */
  widowThresholdPx: number
}

/**
 * Pack measured blocks into pages. Breaks before every section start (h2),
 * avoids widowed sub-headers, and otherwise fills pages to contentHeightPx.
 */
export function packBlocksIntoPages({
  blocks,
  meta,
  measurements,
  contentHeightPx,
  widowThresholdPx,
}: PackOptions): PageData[] {
  if (measurements.length === 0) {
    return []
  }

  const pages: PageData[] = []
  let startIndex = 0
  let pageTop = measurements[0].top

  const pushPage = (endIndex: number) => {
    const content = blocks.slice(startIndex, endIndex).join('\n\n').trim()
    if (content) {
      pages.push({
        content,
        header: meta[startIndex]?.header ?? '',
      })
    }
  }

  for (let index = 0; index < measurements.length; index += 1) {
    const box = measurements[index]
    const isSectionStart = meta[index]?.isBreak ?? false
    const isSubHeader = meta[index]?.isSubHeader ?? false

    if (index > startIndex && isSectionStart) {
      pushPage(index)
      startIndex = index
      pageTop = box.top
      continue
    }

    // Avoid sub-headers (h2/h3) sitting alone at the bottom of a page with
    // only a few lines of space — break to the next page instead.
    if (index > startIndex && isSubHeader) {
      const spaceLeft = contentHeightPx - (box.top - pageTop)
      if (spaceLeft < widowThresholdPx) {
        pushPage(index)
        startIndex = index
        pageTop = box.top
        continue
      }
    }

    const blockBottom = box.top + box.height
    if (index > startIndex && blockBottom - pageTop > contentHeightPx) {
      pushPage(index)
      startIndex = index
      pageTop = box.top
    }
  }

  pushPage(measurements.length)

  return pages
}
