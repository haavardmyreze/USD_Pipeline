export type ImageKind = 'standard' | 'tiff' | 'exr' | 'hdr'

const IMAGE_EXTENSIONS = new Map<string, ImageKind>([
  ['.png', 'standard'],
  ['.jpg', 'standard'],
  ['.jpeg', 'standard'],
  ['.webp', 'standard'],
  ['.gif', 'standard'],
  ['.bmp', 'standard'],
  ['.avif', 'standard'],
  ['.tif', 'tiff'],
  ['.tiff', 'tiff'],
  ['.exr', 'exr'],
  ['.hdr', 'hdr'],
])

export function imageKindFromFileName(fileName: string): ImageKind | null {
  const lower = fileName.toLowerCase()
  for (const [extension, kind] of IMAGE_EXTENSIONS) {
    if (lower.endsWith(extension)) {
      return kind
    }
  }
  return null
}

export function isImageFileName(fileName: string) {
  return imageKindFromFileName(fileName) !== null
}

export function imageKindFromBytes(data: ArrayBuffer): ImageKind | null {
  const bytes = new Uint8Array(data, 0, Math.min(data.byteLength, 16))

  if (
    bytes.length >= 3 &&
    bytes[0] === 0xff &&
    bytes[1] === 0xd8 &&
    bytes[2] === 0xff
  ) {
    return 'standard'
  }

  if (
    bytes.length >= 8 &&
    bytes[0] === 0x89 &&
    bytes[1] === 0x50 &&
    bytes[2] === 0x4e &&
    bytes[3] === 0x47
  ) {
    return 'standard'
  }

  if (bytes.length >= 6 && bytes[0] === 0x47 && bytes[1] === 0x49 && bytes[2] === 0x46) {
    return 'standard'
  }

  if (
    bytes.length >= 12 &&
    bytes[0] === 0x52 &&
    bytes[1] === 0x49 &&
    bytes[2] === 0x46 &&
    bytes[3] === 0x46 &&
    bytes[8] === 0x57 &&
    bytes[9] === 0x45 &&
    bytes[10] === 0x42 &&
    bytes[11] === 0x50
  ) {
    return 'standard'
  }

  if (bytes.length >= 2 && bytes[0] === 0x42 && bytes[1] === 0x4d) {
    return 'standard'
  }

  if (
    (bytes.length >= 4 && bytes[0] === 0x49 && bytes[1] === 0x49 && bytes[2] === 0x2a && bytes[3] === 0x00) ||
    (bytes.length >= 4 && bytes[0] === 0x4d && bytes[1] === 0x4d && bytes[2] === 0x00 && bytes[3] === 0x2a)
  ) {
    return 'tiff'
  }

  if (bytes.length >= 4 && bytes[0] === 0x76 && bytes[1] === 0x2f && bytes[2] === 0x31 && bytes[3] === 0x01) {
    return 'exr'
  }

  if (
    bytes.length >= 10 &&
    bytes[0] === 0x23 &&
    bytes[1] === 0x3f &&
    bytes[2] === 0x52 &&
    bytes[3] === 0x41 &&
    bytes[4] === 0x44 &&
    bytes[5] === 0x49 &&
    bytes[6] === 0x41 &&
    bytes[7] === 0x4e &&
    bytes[8] === 0x43 &&
    bytes[9] === 0x45
  ) {
    return 'hdr'
  }

  return null
}

export function resolveImageKind(fileName: string, data: ArrayBuffer): ImageKind {
  return imageKindFromFileName(fileName) ?? imageKindFromBytes(data) ?? 'standard'
}

export const IMAGE_EXTENSIONS_LIST = [...IMAGE_EXTENSIONS.keys()]
