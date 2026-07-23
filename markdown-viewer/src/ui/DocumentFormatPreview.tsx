import type { DocumentFormat } from '../documents/types'
import { formatRecentFormatLabel } from '../recentDocuments'
import {
  CodeFormatIcon,
  CsvFormatIcon,
  ImageFormatIcon,
  MarkdownFormatIcon,
  PdfFormatIcon,
} from './icons'

type DocumentFormatPreviewProps = {
  format: DocumentFormat
  title: string
}

const FORMAT_ICONS = {
  markdown: MarkdownFormatIcon,
  pdf: PdfFormatIcon,
  csv: CsvFormatIcon,
  image: ImageFormatIcon,
  code: CodeFormatIcon,
} as const

function MarkdownPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-page">
      <span className="doc-card-page-title">{title}</span>
      <span className="doc-card-page-rule" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line short" />
      <span className="doc-card-page-line" />
      <span className="doc-card-page-line short" />
    </div>
  )
}

function PdfPreviewBody({ title }: { title: string }) {
  return (
    <div className="doc-card-format-sheet doc-card-format-sheet-pdf">
      <span className="doc-card-format-sheet-title">{title}</span>
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block" />
      <span className="doc-card-format-sheet-block wide" />
      <span className="doc-card-format-sheet-block short" />
    </div>
  )
}

function CsvPreviewBody() {
  return (
    <div className="doc-card-format-grid" aria-hidden="true">
      {Array.from({ length: 12 }, (_, index) => (
        <span key={index} className="doc-card-format-grid-cell" />
      ))}
    </div>
  )
}

function ImagePreviewBody() {
  return (
    <div className="doc-card-format-frame" aria-hidden="true">
      <ImageFormatIcon size={34} strokeWidth={1.5} />
    </div>
  )
}

function CodePreviewBody() {
  return (
    <div className="doc-card-format-code" aria-hidden="true">
      <span className="doc-card-format-code-line indent" />
      <span className="doc-card-format-code-line" />
      <span className="doc-card-format-code-line short" />
      <span className="doc-card-format-code-line indent" />
      <span className="doc-card-format-code-line medium" />
    </div>
  )
}

export function DocumentFormatPreview({ format, title }: DocumentFormatPreviewProps) {
  const Icon = FORMAT_ICONS[format]

  return (
    <div className={`doc-card-preview doc-card-preview-${format}`}>
      <span className={`doc-card-format-badge doc-card-format-badge-${format}`}>
        <Icon size={14} strokeWidth={1.9} />
        {formatRecentFormatLabel(format)}
      </span>

      {format === 'markdown' ? <MarkdownPreviewBody title={title} /> : null}
      {format === 'pdf' ? <PdfPreviewBody title={title} /> : null}
      {format === 'csv' ? <CsvPreviewBody /> : null}
      {format === 'image' ? <ImagePreviewBody /> : null}
      {format === 'code' ? <CodePreviewBody /> : null}
    </div>
  )
}
