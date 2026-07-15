import type { DocumentFormat } from './types'
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
  }

  return 'markdown'
}
