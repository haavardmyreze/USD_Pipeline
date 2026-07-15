// Pure markdown block utilities: splitting source into blocks, deriving
// per-block metadata (section breaks, running headers), and card grouping.

export type PageData = {
  content: string
  header: string
}

export type BlockMeta = {
  isBreak: boolean
  isSubHeader: boolean
  header: string
}

export function splitMarkdownBlocks(source: string): string[] {
  const lines = source.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let fenceToken = ''

  const flush = () => {
    if (current.length > 0) {
      const text = current.join('\n').trim()
      if (text) {
        blocks.push(text)
      }
      current = []
    }
  }

  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)

    if (fenceMatch) {
      const token = fenceMatch[1]
      if (!fenceToken) {
        fenceToken = token.slice(0, 3)
      } else if (line.trim().startsWith(fenceToken)) {
        fenceToken = ''
      }
      current.push(line)
      continue
    }

    if (!fenceToken && line.trim() === '') {
      flush()
    } else {
      current.push(line)
    }
  }

  flush()
  return blocks
}

export function cleanInline(text: string): string {
  return text.replace(/[`*_]/g, '').trim()
}

export function computeBlockMeta(sourceBlocks: string[]): BlockMeta[] {
  let h1 = ''
  let h2 = ''
  return sourceBlocks.map((block) => {
    const firstLine = block.split('\n', 1)[0]?.trim() ?? ''
    const h1Match = /^#(?!#)\s+(.+)$/.exec(firstLine)
    const h2Match = /^##(?!#)\s+(.+)$/.exec(firstLine)
    const h3Match = /^###(?!#)\s+(.+)$/.exec(firstLine)

    let isBreak = false
    let isSubHeader = false
    if (h1Match) {
      h1 = cleanInline(h1Match[1])
      h2 = ''
    } else if (h2Match) {
      h2 = cleanInline(h2Match[1])
      isBreak = true
      isSubHeader = true
    } else if (h3Match) {
      isSubHeader = true
    }

    return { isBreak, isSubHeader, header: h2 || h1 }
  })
}

export function splitMarkdownIntoCards(source: string): PageData[] {
  const sourceBlocks = splitMarkdownBlocks(source)
  const meta = computeBlockMeta(sourceBlocks)
  const cards: PageData[] = []
  let startIndex = 0

  const pushCard = (endIndex: number) => {
    const content = sourceBlocks.slice(startIndex, endIndex).join('\n\n').trim()
    if (content) {
      cards.push({
        content,
        header: meta[startIndex]?.header ?? '',
      })
    }
  }

  for (let index = 0; index < sourceBlocks.length; index += 1) {
    if (index > startIndex && meta[index]?.isBreak) {
      pushCard(index)
      startIndex = index
    }
  }

  pushCard(sourceBlocks.length)

  return cards.length > 0 ? cards : [{ content: source, header: '' }]
}
