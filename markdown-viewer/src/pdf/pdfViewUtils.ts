import type { SectionRef } from '../headings'
import { pageNumberFromSectionId } from './pdfDocument'

export function findActiveSectionForPage(sections: SectionRef[], pageNumber: number) {
  if (sections.length === 0) {
    return `pdf-page-${pageNumber}`
  }

  let active = sections[0].id
  for (const section of sections) {
    const sectionPage = pageNumberFromSectionId(section.id)
    if (sectionPage <= pageNumber) {
      active = section.id
    }
  }

  return active
}

export function computeFitZoom(
  basePageWidth: number,
  basePageHeight: number,
  containerWidth: number,
  containerHeight: number,
  mode: 'width' | 'height',
) {
  const horizontalPadding = 32
  const verticalPadding = 48
  const availableWidth = Math.max(240, containerWidth - horizontalPadding)
  const availableHeight = Math.max(240, containerHeight - verticalPadding)

  const scale =
    mode === 'width'
      ? availableWidth / basePageWidth
      : availableHeight / basePageHeight

  return Math.max(0.5, Math.min(3, scale))
}
