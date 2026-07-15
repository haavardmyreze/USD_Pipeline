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

export function detectFormatFromSrc(src: string): DocumentFormat {
  try {
    const url = new URL(src)
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
