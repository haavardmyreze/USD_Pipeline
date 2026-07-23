import type { DocumentFormat } from './types'
import { isCodeFileName } from '../code/codeExtensions'
import { isImageFileName } from '../image/imageFormat'

const IMAGE_EXTENSION_PATTERN =
  /\.(png|jpe?g|webp|gif|bmp|avif|tiff?|exr|hdr)$/i

export function detectFormatFromFileName(fileName: string): DocumentFormat {
  if (/\.pdf$/i.test(fileName)) {
    return 'pdf'
  }

  if (/\.csv$/i.test(fileName)) {
    return 'csv'
  }

  if (isImageFileName(fileName)) {
    return 'image'
  }

  if (isCodeFileName(fileName)) {
    return 'code'
  }

  return 'markdown'
}

function detectFormatFromDataMime(mime: string): DocumentFormat | null {
  const normalized = mime.toLowerCase().split(';')[0]?.trim() ?? ''

  if (normalized === 'application/pdf') {
    return 'pdf'
  }

  if (normalized === 'text/csv') {
    return 'csv'
  }

  if (normalized.startsWith('image/')) {
    return 'image'
  }

  if (
    normalized === 'application/json' ||
    normalized === 'application/javascript' ||
    normalized === 'text/javascript' ||
    normalized === 'application/typescript' ||
    normalized === 'text/x-python' ||
    normalized === 'application/x-python' ||
    normalized === 'text/x-java-source' ||
    normalized === 'text/x-c' ||
    normalized === 'text/x-c++' ||
    normalized === 'text/x-go' ||
    normalized === 'text/x-rust' ||
    normalized === 'text/x-kotlin' ||
    normalized === 'text/x-sql' ||
    normalized === 'text/x-csharp' ||
    normalized === 'text/x-shellscript' ||
    normalized === 'text/css' ||
    normalized === 'application/xml' ||
    normalized === 'text/xml' ||
    normalized === 'application/x-yaml' ||
    normalized === 'text/yaml'
  ) {
    return 'code'
  }

  if (
    normalized === 'text/markdown' ||
    normalized === 'text/plain' ||
    normalized === 'application/octet-stream'
  ) {
    return 'markdown'
  }

  return null
}

export function detectFormatFromSrc(src: string, fileName?: string): DocumentFormat {
  if (fileName) {
    return detectFormatFromFileName(fileName)
  }

  if (src.startsWith('data:')) {
    const mime = /^data:([^,]+)/i.exec(src)?.[1]
    if (mime) {
      const fromMime = detectFormatFromDataMime(mime)
      if (fromMime) {
        return fromMime
      }
    }
  }

  try {
    const url = new URL(src)
    if (url.protocol === 'data:') {
      const fromMime = detectFormatFromDataMime(url.pathname)
      if (fromMime) {
        return fromMime
      }
    }

    if (/\.pdf$/i.test(url.pathname)) {
      return 'pdf'
    }
    if (/\.csv$/i.test(url.pathname)) {
      return 'csv'
    }
    if (IMAGE_EXTENSION_PATTERN.test(url.pathname)) {
      return 'image'
    }
    if (isCodeFileName(url.pathname)) {
      return 'code'
    }
  } catch {
    if (/\.pdf$/i.test(src)) {
      return 'pdf'
    }
    if (/\.csv$/i.test(src)) {
      return 'csv'
    }
    if (IMAGE_EXTENSION_PATTERN.test(src)) {
      return 'image'
    }
    if (isCodeFileName(src)) {
      return 'code'
    }
  }

  return 'markdown'
}
