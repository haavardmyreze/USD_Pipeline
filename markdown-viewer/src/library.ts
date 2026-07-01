const libraryModules = import.meta.glob<string>('../library/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export type LibraryDoc = {
  id: string
  title: string
  fileName: string
  folder: string
  excerpt: string
  wordCount: number
  readingMinutes: number
  headingCount: number
}

function isLibraryDocument(path: string) {
  const name = path.split('/').pop() ?? ''
  return name !== 'README.md' && !name.startsWith('_')
}

function pathToId(path: string) {
  return path.replace(/^\.\.\/library\//, '').replace(/\.md$/i, '')
}

function pathToFileName(path: string) {
  return path.split('/').pop() ?? path
}

function idToFolder(id: string) {
  const slash = id.lastIndexOf('/')
  return slash === -1 ? '' : id.slice(0, slash)
}

function filenameToTitle(fileName: string) {
  return fileName
    .replace(/\.md$/i, '')
    .replace(/[-_]/g, ' ')
    .replace(/\b\w/g, (char) => char.toUpperCase())
}

function titleFromContent(content: string, fallback: string) {
  const match = /^#\s+(.+)$/m.exec(content)
  return match?.[1]?.trim() || fallback
}

// Strip the most common inline markdown so previews read as clean prose.
function stripInline(text: string) {
  return text
    .replace(/`([^`]+)`/g, '$1')
    .replace(/\*\*([^*]+)\*\*/g, '$1')
    .replace(/\*([^*]+)\*/g, '$1')
    .replace(/__([^_]+)__/g, '$1')
    .replace(/_([^_]+)_/g, '$1')
    .replace(/~~([^~]+)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

// First real paragraph of prose — skips headings, fences, tables, quotes, lists,
// and horizontal rules — used as the card preview snippet.
function excerptFromContent(content: string) {
  const lines = content.split('\n')
  let inFence = false
  const collected: string[] = []

  for (const rawLine of lines) {
    const line = rawLine.trim()

    if (/^(```+|~~~+)/.test(line)) {
      inFence = !inFence
      continue
    }
    if (inFence) {
      continue
    }
    if (line === '') {
      if (collected.length > 0) {
        break
      }
      continue
    }
    if (
      line.startsWith('#') ||
      line.startsWith('>') ||
      line.startsWith('|') ||
      line.startsWith('- ') ||
      line.startsWith('* ') ||
      /^\d+\.\s/.test(line) ||
      /^[-*_]{3,}$/.test(line) ||
      line.startsWith('<')
    ) {
      if (collected.length > 0) {
        break
      }
      continue
    }
    collected.push(line)
  }

  const text = stripInline(collected.join(' '))
  if (text.length <= 180) {
    return text
  }
  return `${text.slice(0, 177).trimEnd()}…`
}

function countWords(content: string) {
  const withoutFences = content.replace(/```[\s\S]*?```/g, ' ')
  const matches = withoutFences.match(/\S+/g)
  return matches ? matches.length : 0
}

function countHeadings(content: string) {
  const matches = content.match(/^#{1,3}\s+\S/gm)
  return matches ? matches.length : 0
}

const documentEntries = Object.entries(libraryModules).filter(([path]) =>
  isLibraryDocument(path),
)

export const libraryDocs: LibraryDoc[] = documentEntries
  .map(([path, content]) => {
    const fileName = pathToFileName(path)
    const id = pathToId(path)
    const wordCount = countWords(content)
    return {
      id,
      title: titleFromContent(content, filenameToTitle(fileName)),
      fileName,
      folder: idToFolder(id),
      excerpt: excerptFromContent(content),
      wordCount,
      readingMinutes: Math.max(1, Math.round(wordCount / 200)),
      headingCount: countHeadings(content),
    }
  })
  .sort((left, right) =>
    left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }),
  )

const contentById = new Map(
  documentEntries.map(([path, content]) => [pathToId(path), content]),
)

export function getLibraryContent(id: string) {
  return contentById.get(id) ?? null
}

export function getLibraryDoc(id: string) {
  return libraryDocs.find((doc) => doc.id === id) ?? null
}

export function getDocIdFromUrl() {
  return new URLSearchParams(window.location.search).get('doc')
}
