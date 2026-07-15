// TOC extraction from markdown source (mdast-based) and the visibility rules
// for the progressive-disclosure contents panel.

import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import { headingId } from '../headings'

export type TocEntry = {
  id: string
  text: string
  level: number
  chapterId: string
  sectionId: string
}

type MdastNode = { type: string; value?: string; children?: MdastNode[] }

function mdastText(node: MdastNode): string {
  if (typeof node.value === 'string') {
    return node.value
  }
  if (Array.isArray(node.children)) {
    return node.children.map(mdastText).join('')
  }
  return ''
}

export function extractToc(markdown: string): TocEntry[] {
  const entries: TocEntry[] = []
  let currentChapterId = ''
  let currentSectionId = ''
  const headingCounts = new Map<string, number>()
  const tree = unified().use(remarkParse).parse(markdown)
  let hasH1 = false

  visit(tree, 'heading', (node: MdastNode & { depth: number }) => {
    if (node.depth === 1) {
      hasH1 = true
    }
  })

  visit(tree, 'heading', (node: MdastNode & { depth: number }) => {
    if (node.depth < 1 || node.depth > 3) {
      return
    }

    const text = mdastText(node).trim()

    if (!text) {
      return
    }

    const baseId = headingId(text)
    const seenCount = headingCounts.get(baseId) ?? 0
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`
    headingCounts.set(baseId, seenCount + 1)
    if (node.depth === 1) {
      currentChapterId = id
      currentSectionId = id
    } else if (node.depth === 2) {
      if (!hasH1) {
        currentChapterId = id
      }
      currentSectionId = id
    }

    entries.push({
      id,
      text,
      level: node.depth,
      chapterId: currentChapterId || id,
      sectionId: currentSectionId || id,
    })
  })

  return entries
}

export function shouldShowTocEntry(
  entry: TocEntry,
  activeChapterId: string,
  activeSectionId: string,
  hasTopLevelChapters: boolean,
): boolean {
  if (entry.level === 1) {
    return true
  }

  if (entry.level === 2) {
    return hasTopLevelChapters ? entry.chapterId === activeChapterId : true
  }

  if (entry.level === 3) {
    return hasTopLevelChapters
      ? entry.chapterId === activeChapterId && entry.sectionId === activeSectionId
      : entry.sectionId === activeSectionId
  }

  return false
}
