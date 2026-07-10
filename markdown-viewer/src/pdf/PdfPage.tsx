import { useEffect, useRef, useState } from 'react'
import { TextLayer } from 'pdfjs-dist'
import type { PDFDocumentProxy } from 'pdfjs-dist'
import type { DocumentComment } from '../documentComments'
import {
  applyHighlightsToTextLayer,
  buildHighlightRangesFromTextLayer,
} from './pdfTextHighlights'

type PdfPageProps = {
  pdf: PDFDocumentProxy
  pageNumber: number
  scale: number
  searchQuery: string
  comments: DocumentComment[]
  activeCommentId: string
  commentsOpen: boolean
}

export default function PdfPage({
  pdf,
  pageNumber,
  scale,
  searchQuery,
  comments,
  activeCommentId,
  commentsOpen,
}: PdfPageProps) {
  const hostRef = useRef<HTMLDivElement | null>(null)
  const textLayerRef = useRef<HTMLDivElement | null>(null)
  const [error, setError] = useState('')

  useEffect(() => {
    const host = hostRef.current
    if (!host) {
      return
    }

    let cancelled = false
    let textLayer: TextLayer | null = null

    const renderPage = async () => {
      try {
        setError('')
        host.replaceChildren()
        textLayerRef.current = null

        const page = await pdf.getPage(pageNumber)
        if (cancelled) {
          return
        }

        const viewport = page.getViewport({ scale })
        const canvas = document.createElement('canvas')
        const context = canvas.getContext('2d')

        if (!context) {
          throw new Error('Canvas is not available')
        }

        canvas.width = viewport.width
        canvas.height = viewport.height
        canvas.className = 'pdf-page-canvas'

        const textLayerHost = document.createElement('div')
        textLayerHost.className = 'pdf-text-layer'
        textLayerHost.style.width = `${viewport.width}px`
        textLayerHost.style.height = `${viewport.height}px`
        textLayerRef.current = textLayerHost

        const pageShell = document.createElement('div')
        pageShell.className = 'pdf-page-shell'
        pageShell.style.width = `${viewport.width}px`
        pageShell.style.height = `${viewport.height}px`
        pageShell.append(canvas, textLayerHost)
        host.append(pageShell)

        await page.render({
          canvas,
          canvasContext: context,
          viewport,
        }).promise

        if (cancelled) {
          return
        }

        const textContent = await page.getTextContent()
        textLayer = new TextLayer({
          textContentSource: textContent,
          container: textLayerHost,
          viewport,
        })
        await textLayer.render()

        if (!cancelled && textLayerRef.current) {
          const ranges = buildHighlightRangesFromTextLayer(textLayerRef.current, pageNumber, {
            searchQuery,
            comments,
            activeCommentId,
          })
          applyHighlightsToTextLayer(textLayerRef.current, ranges)
        }
      } catch (renderError) {
        if (!cancelled) {
          setError(
            renderError instanceof Error ? renderError.message : 'Could not render page.',
          )
        }
      }
    }

    void renderPage()

    return () => {
      cancelled = true
      textLayer?.cancel()
      host.replaceChildren()
      textLayerRef.current = null
    }
  }, [activeCommentId, comments, pageNumber, pdf, scale, searchQuery])

  useEffect(() => {
    if (!textLayerRef.current) {
      return
    }

    const ranges = buildHighlightRangesFromTextLayer(textLayerRef.current, pageNumber, {
      searchQuery,
      comments,
      activeCommentId,
    })
    applyHighlightsToTextLayer(textLayerRef.current, ranges)
  }, [activeCommentId, comments, commentsOpen, pageNumber, searchQuery])

  return (
    <article
      className="pdf-page"
      id={`pdf-page-${pageNumber}`}
      data-pdf-page={pageNumber}
      ref={hostRef}
    >
      {error ? <p className="pdf-page-error">{error}</p> : null}
    </article>
  )
}
