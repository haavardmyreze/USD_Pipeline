// Format-adapter registry: everything the app needs to support a document
// format lives in one adapter entry. Adding a new format (docx, epub, …)
// means adding one adapter here — no new shells, no App.tsx surgery.

import type { ComponentType } from 'react'
import type { DocumentFormat, DocumentSource } from './types'
import type { Theme, ThemePreference } from '../theme'
import type { LibraryDoc } from '../library'
import { hashArrayBuffer } from '../documentKey'
import MarkdownReader from '../Reader'
import PdfReader from '../pdf/PdfReader'
import CsvReader from '../csv/CsvReader'

export type ReaderProps = {
  source: DocumentSource
  fileName: string
  docKey: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
}

export type ReadResult = {
  source: DocumentSource
  fingerprint: string
}

export type DocumentAdapter = {
  format: DocumentFormat
  label: string
  /** Lowercase extensions including the dot, e.g. ['.md', '.markdown']. */
  extensions: string[]
  mimeTypes: string[]
  readFile: (file: File) => Promise<ReadResult>
  readResponse: (response: Response) => Promise<ReadResult>
  Reader: ComponentType<ReaderProps>
}

function MarkdownAdapterReader(props: ReaderProps) {
  if (props.source.format !== 'markdown') {
    return null
  }
  return (
    <MarkdownReader
      markdown={props.source.content}
      fileName={props.fileName}
      docKey={props.docKey}
      theme={props.theme}
      themePreference={props.themePreference}
      onSelectTheme={props.onSelectTheme}
      onHome={props.onHome}
      onOpenLibrary={props.onOpenLibrary}
    />
  )
}

function PdfAdapterReader(props: ReaderProps) {
  if (props.source.format !== 'pdf') {
    return null
  }
  return (
    <PdfReader
      pdfSource={props.source.data}
      fileName={props.fileName}
      docKey={props.docKey}
      theme={props.theme}
      themePreference={props.themePreference}
      onSelectTheme={props.onSelectTheme}
      onHome={props.onHome}
      onOpenLibrary={props.onOpenLibrary}
    />
  )
}

function CsvAdapterReader(props: ReaderProps) {
  if (props.source.format !== 'csv') {
    return null
  }
  return (
    <CsvReader
      csvContent={props.source.content}
      fileName={props.fileName}
      docKey={props.docKey}
      theme={props.theme}
      themePreference={props.themePreference}
      onSelectTheme={props.onSelectTheme}
      onHome={props.onHome}
      onOpenLibrary={props.onOpenLibrary}
    />
  )
}

const markdownAdapter: DocumentAdapter = {
  format: 'markdown',
  label: 'Markdown',
  extensions: ['.md', '.markdown'],
  mimeTypes: ['text/markdown', 'text/plain'],
  readFile: async (file) => {
    const content = await file.text()
    return { source: { format: 'markdown', content }, fingerprint: content }
  },
  readResponse: async (response) => {
    const content = await response.text()
    return { source: { format: 'markdown', content }, fingerprint: content }
  },
  Reader: MarkdownAdapterReader,
}

const pdfAdapter: DocumentAdapter = {
  format: 'pdf',
  label: 'PDF',
  extensions: ['.pdf'],
  mimeTypes: ['application/pdf'],
  readFile: async (file) => {
    const data = await file.arrayBuffer()
    return { source: { format: 'pdf', data }, fingerprint: hashArrayBuffer(data) }
  },
  readResponse: async (response) => {
    const data = await response.arrayBuffer()
    return { source: { format: 'pdf', data }, fingerprint: hashArrayBuffer(data) }
  },
  Reader: PdfAdapterReader,
}

const csvAdapter: DocumentAdapter = {
  format: 'csv',
  label: 'CSV',
  extensions: ['.csv'],
  mimeTypes: ['text/csv'],
  readFile: async (file) => {
    const content = await file.text()
    return { source: { format: 'csv', content }, fingerprint: content }
  },
  readResponse: async (response) => {
    const content = await response.text()
    return { source: { format: 'csv', content }, fingerprint: content }
  },
  Reader: CsvAdapterReader,
}

export const DOCUMENT_ADAPTERS: DocumentAdapter[] = [
  markdownAdapter,
  pdfAdapter,
  csvAdapter,
]

const FALLBACK_ADAPTER = markdownAdapter

export function adapterForFormat(format: DocumentFormat): DocumentAdapter {
  return (
    DOCUMENT_ADAPTERS.find((adapter) => adapter.format === format) ??
    FALLBACK_ADAPTER
  )
}

export function adapterForFileName(fileName: string): DocumentAdapter {
  const lower = fileName.toLowerCase()
  return (
    DOCUMENT_ADAPTERS.find((adapter) =>
      adapter.extensions.some((extension) => lower.endsWith(extension)),
    ) ?? FALLBACK_ADAPTER
  )
}

/** Value for <input accept="…"> covering every supported format. */
export function importAcceptString(): string {
  const parts = new Set<string>()
  for (const adapter of DOCUMENT_ADAPTERS) {
    adapter.extensions.forEach((extension) => parts.add(extension))
    adapter.mimeTypes.forEach((mime) => parts.add(mime))
  }
  return [...parts].join(',')
}
