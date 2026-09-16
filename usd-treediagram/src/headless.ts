/**
 * The page the command-line renderer drives (see `scripts/render.mjs`).
 *
 * It draws with exactly the code the app uses, then hands the PNG back as
 * base64. Nothing is shown; the page only exposes `window.treeDiagram`.
 */

import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/inter/wght-italic.css'

import { readDirectives } from './directives'
import { loadIcons } from './icons'
import { parse } from './parse'
import { embed, extract } from './png'
import { DEFAULT_OPTIONS, draw, layout, type Options } from './render'

export interface RenderRequest {
  name: string
  source: string
  /** Settings from the command line; they win over the file's own. */
  options: Partial<Options>
  scale?: number
}

export interface RenderResult {
  png: string
  width: number
  height: number
  scale: number
  prims: number
  problems: { line: number; message: string }[]
}

async function render(request: RenderRequest): Promise<RenderResult> {
  const directives = readDirectives(request.source)
  const options: Options = { ...DEFAULT_OPTIONS, ...directives.options, ...request.options }
  const scale = request.scale ?? directives.scale ?? 2
  const parsed = parse(request.source)

  const measure = document.createElement('canvas').getContext('2d')!
  const tree = layout(measure, parsed.roots, options)
  const canvas = document.createElement('canvas')
  draw(canvas, tree, options, scale)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode the PNG'))), 'image/png'),
  )
  const png = await embed(blob, { name: request.name, source: request.source, options })
  return {
    png: toBase64(new Uint8Array(await png.arrayBuffer())),
    width: canvas.width,
    height: canvas.height,
    scale,
    prims: tree.prims,
    problems: [...directives.problems, ...parsed.problems].sort((a, b) => a.line - b.line),
  }
}

/** The outline stored in a PNG this tool saved, or null. */
async function outlineOf(base64: string): Promise<{ name?: string; source: string; options?: Partial<Options> } | null> {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0))
  const data = (await extract(new Blob([bytes]))) as { source?: unknown } | null
  return data && typeof data.source === 'string' ? (data as { source: string }) : null
}

function toBase64(bytes: Uint8Array): string {
  let text = ''
  for (let i = 0; i < bytes.length; i += 0x8000) text += String.fromCharCode(...bytes.subarray(i, i + 0x8000))
  return btoa(text)
}

declare global {
  interface Window {
    treeDiagram?: { render: typeof render; outlineOf: typeof outlineOf }
  }
}

void (async () => {
  await Promise.all([
    loadIcons(),
    document.fonts.load(`400 12px "Inter Variable"`, 'Aa←…'),
    document.fonts.load(`italic 400 12px "Inter Variable"`, 'Aa'),
  ])
  window.treeDiagram = { render, outlineOf }
})()
