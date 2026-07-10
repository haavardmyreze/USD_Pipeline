import type { DocumentFormat } from './types'

export function detectFormatFromFileName(fileName: string): DocumentFormat {
  if (/\.pdf$/i.test(fileName)) {
    return 'pdf'
  }

  if (/\.csv$/i.test(fileName)) {
    return 'csv'
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
  } catch {
    if (/\.pdf$/i.test(src)) {
      return 'pdf'
    }
    if (/\.csv$/i.test(src)) {
      return 'csv'
    }
  }

  return 'markdown'
}
