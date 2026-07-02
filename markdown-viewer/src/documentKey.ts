function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function makeDocumentKey(
  libraryId: string,
  fileName: string,
  markdown: string,
) {
  if (libraryId) {
    return libraryId
  }

  return `import:${fileName}:${hashString(markdown)}`
}
