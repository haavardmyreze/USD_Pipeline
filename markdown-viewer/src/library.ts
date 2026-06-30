const libraryModules = import.meta.glob<string>('../library/**/*.md', {
  query: '?raw',
  import: 'default',
  eager: true,
})

export type LibraryDoc = {
  id: string
  title: string
  fileName: string
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

export const libraryDocs: LibraryDoc[] = Object.entries(libraryModules)
  .filter(([path]) => isLibraryDocument(path))
  .map(([path, content]) => {
    const fileName = pathToFileName(path)
    const fallbackTitle = filenameToTitle(fileName)
    return {
      id: pathToId(path),
      title: titleFromContent(content, fallbackTitle),
      fileName,
    }
  })
  .sort((left, right) => left.title.localeCompare(right.title, undefined, { sensitivity: 'base' }))

const contentById = new Map(
  Object.entries(libraryModules)
    .filter(([path]) => isLibraryDocument(path))
    .map(([path, content]) => [pathToId(path), content]),
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
