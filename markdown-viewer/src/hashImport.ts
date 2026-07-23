import { detectFormatFromFileName } from './documents/detectFormat'
import { detectCodeLanguage } from './code/detectLanguage'
import type { DocumentFormat } from './documents/types'
import type { OpenDocument } from './documentState'
import { hashArrayBuffer } from './documentKey'

export type HashImportPayload = {
  name: string
  mime: string
  text?: string
  base64?: string
}

function decodeBase64(base64: string) {
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

function formatFromPayload(payload: HashImportPayload): DocumentFormat {
  return detectFormatFromFileName(payload.name)
}

export function parseHashImport(hash: string): OpenDocument | null {
  const match = /^#import=(.+)$/i.exec(hash)
  if (!match?.[1]) {
    return null
  }

  try {
    const payload = JSON.parse(decodeURIComponent(match[1])) as HashImportPayload
    if (!payload?.name || !payload.mime) {
      return null
    }

    const format = formatFromPayload(payload)

    if (payload.text != null) {
      if (format === 'csv') {
        return {
          source: { format: 'csv', content: payload.text },
          fileName: payload.name,
          libraryId: '',
          fingerprint: payload.text,
        }
      }

      if (format === 'code') {
        const language = detectCodeLanguage(payload.name, payload.text)
        return {
          source: { format: 'code', content: payload.text, language },
          fileName: payload.name,
          libraryId: '',
          fingerprint: payload.text,
        }
      }

      return {
        source: { format: 'markdown', content: payload.text },
        fileName: payload.name,
        libraryId: '',
        fingerprint: payload.text,
      }
    }

    if (payload.base64) {
      const data = decodeBase64(payload.base64)

      if (format === 'pdf') {
        return {
          source: { format: 'pdf', data },
          fileName: payload.name,
          libraryId: '',
          fingerprint: hashArrayBuffer(data),
        }
      }

      if (format === 'image') {
        return {
          source: { format: 'image', data, fileName: payload.name },
          fileName: payload.name,
          libraryId: '',
          fingerprint: hashArrayBuffer(data),
        }
      }

      if (format === 'csv') {
        const content = new TextDecoder().decode(data)
        return {
          source: { format: 'csv', content },
          fileName: payload.name,
          libraryId: '',
          fingerprint: content,
        }
      }

      if (format === 'code') {
        const content = new TextDecoder().decode(data)
        const language = detectCodeLanguage(payload.name, content)
        return {
          source: { format: 'code', content, language },
          fileName: payload.name,
          libraryId: '',
          fingerprint: content,
        }
      }

      const content = new TextDecoder().decode(data)
      return {
        source: { format: 'markdown', content },
        fileName: payload.name,
        libraryId: '',
        fingerprint: content,
      }
    }
  } catch {
    return null
  }

  return null
}

export function clearHashImportFromUrl() {
  const url = new URL(window.location.href)
  if (!url.hash.startsWith('#import=')) {
    return
  }

  url.hash = ''
  window.history.replaceState(null, '', url)
}
