function hashString(value: string) {
  let hash = 0
  for (let index = 0; index < value.length; index += 1) {
    hash = (hash << 5) - hash + value.charCodeAt(index)
    hash |= 0
  }
  return Math.abs(hash).toString(36)
}

export function hashArrayBuffer(buffer: ArrayBuffer) {
  const bytes = new Uint8Array(buffer)
  let hash = 0
  const step = Math.max(1, Math.floor(bytes.length / 4096))

  for (let index = 0; index < bytes.length; index += step) {
    hash = (hash << 5) - hash + bytes[index]
    hash |= 0
  }

  return `${bytes.length.toString(36)}:${Math.abs(hash).toString(36)}`
}

export function makeDocumentKey(
  libraryId: string,
  fileName: string,
  fingerprint: string,
) {
  if (libraryId) {
    return libraryId
  }

  return `import:${fileName}:${hashString(fingerprint)}`
}