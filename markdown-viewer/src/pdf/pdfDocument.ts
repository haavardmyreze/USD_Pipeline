import './pdfjs'
import { getDocument, type PDFDocumentProxy, type PDFPageProxy } from 'pdfjs-dist'
import { headingId } from '../headings'
import type { SectionRef } from '../headings'

export type PdfPageIndex = {
  pageNumber: number
  text: string
  globalOffset: number
}

export type PdfDocumentIndex = {
  numPages: number
  pages: PdfPageIndex[]
  sections: SectionRef[]
  fullText: string
  basePageWidth: number
  basePageHeight: number
}

type OutlineItem = {
  title: string
  dest?: unknown
  items?: OutlineItem[]
}

async function resolveDestToPage(pdf: PDFDocumentProxy, dest: unknown) {
  try {
    const explicitDest = typeof dest === 'string' ? await pdf.getDestination(dest) : dest
    if (!Array.isArray(explicitDest) || !explicitDest[0]) {
      return 1
    }

    const pageIndex = await pdf.getPageIndex(explicitDest[0])
    return pageIndex + 1
  } catch {
    return 1
  }
}

async function flattenOutline(
  pdf: PDFDocumentProxy,
  items: OutlineItem[],
  level = 1,
  acc: SectionRef[] = [],
) {
  for (const [index, item] of items.entries()) {
    const page = item.dest ? await resolveDestToPage(pdf, item.dest) : 1
    const title = item.title?.trim() || `Section ${acc.length + 1}`
    const id = `pdf-outline-${headingId(title)}-${acc.length}-${index}`

    acc.push({
      id,
      text: title,
      level,
    })

    if (item.items?.length) {
      await flattenOutline(pdf, item.items, Math.min(level + 1, 3), acc)
    } else {
      // Keep a page target on leaf nodes via synthetic metadata in text for navigation.
      acc[acc.length - 1] = {
        ...acc[acc.length - 1],
        text: `${title}`,
      }
    }

    // Store page on id suffix for navigation lookup
    acc[acc.length - 1] = {
      ...acc[acc.length - 1],
      id: `${id}@p${page}`,
    }
  }

  return acc
}

export function pageNumberFromSectionId(sectionId: string) {
  const match = /@p(\d+)$/.exec(sectionId)
  if (match) {
    return Number(match[1])
  }

  const pageMatch = /^pdf-page-(\d+)$/.exec(sectionId)
  if (pageMatch) {
    return Number(pageMatch[1])
  }

  return 1
}

async function extractPageText(page: PDFPageProxy) {
  const textContent = await page.getTextContent()
  return textContent.items
    .map((item) => ('str' in item ? item.str : ''))
    .join(' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export async function loadPdfDocument(source: ArrayBuffer | string) {
  const loadingTask =
    typeof source === 'string'
      ? getDocument({ url: source, withCredentials: true })
      : getDocument({ data: source.slice(0) })

  return loadingTask.promise
}

export async function buildPdfDocumentIndex(pdf: PDFDocumentProxy): Promise<PdfDocumentIndex> {
  const pages: PdfPageIndex[] = []
  let globalOffset = 0

  for (let pageNumber = 1; pageNumber <= pdf.numPages; pageNumber += 1) {
    const page = await pdf.getPage(pageNumber)
    const text = await extractPageText(page)
    pages.push({
      pageNumber,
      text,
      globalOffset,
    })
    globalOffset += text.length + 1
  }

  const outline = await pdf.getOutline()
  let sections: SectionRef[] = []

  if (outline?.length) {
    sections = await flattenOutline(pdf, outline as OutlineItem[])
  } else {
    sections = pages.map((page) => ({
      id: `pdf-page-${page.pageNumber}`,
      text: `Page ${page.pageNumber}`,
      level: 1,
    }))
  }

  const fullText = pages.map((page) => `### Page ${page.pageNumber}\n${page.text}`).join('\n\n')
  const firstPage = await pdf.getPage(1)
  const baseViewport = firstPage.getViewport({ scale: 1 })

  return {
    numPages: pdf.numPages,
    pages,
    sections,
    fullText,
    basePageWidth: baseViewport.width,
    basePageHeight: baseViewport.height,
  }
}
