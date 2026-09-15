/**
 * The selected text layer's source, exactly as it sits on disk.
 *
 * Asset paths that match an arc in the graph are links: clicking one selects
 * the file it points at, the same as picking it from the Details tab.
 *
 * A layer baked out as text can run to hundreds of thousands of lines, so
 * lines are built in chunks only as they scroll near the view. Until then a
 * chunk is an empty block of the right height, which keeps the scrollbar
 * honest.
 */

import type { Graph, GraphNode, LayerSource } from '@shared/types'
import { ApiFailure, getSource } from '../api'
import { emptyState, iconButton } from './kit'
import { tokenize, type LineState } from './usda'
import { copyText, el, formatBytes } from '../util'

export interface SourceCallbacks {
  /** Select a node in the graph. */
  onSelect(id: string): void
  onToast(message: string, kind?: 'ok' | 'error'): void
}

/** Lines built together once any of them nears the view. */
const CHUNK = 200

/** Must match `--src-line` in styles.css, so placeholders take the right space. */
const LINE_HEIGHT = 18

export class SourceView {
  private readonly root = el('div', 'src')
  private readonly cache = new Map<string, LayerSource>()
  private node: GraphNode | null = null
  /** Asset path as authored, to the node it resolved to. */
  private links = new Map<string, string>()
  private wrap = false
  private observer: IntersectionObserver | null = null

  constructor(
    private readonly scroller: HTMLElement,
    private readonly callbacks: SourceCallbacks,
  ) {
    this.root.addEventListener('click', (event) => {
      const link = (event.target as HTMLElement).closest<HTMLElement>('.src__link')
      if (link?.dataset.target) this.callbacks.onSelect(link.dataset.target)
    })
  }

  show(graph: Graph, node: GraphNode): HTMLElement {
    this.node = node
    this.links = new Map(
      graph.edges.filter((edge) => edge.from === node.id).map((edge) => [edge.rawPath, edge.to]),
    )

    const cached = this.cache.get(node.id)
    if (cached) {
      this.render(cached)
    } else {
      this.observer?.disconnect()
      this.root.replaceChildren(emptyState('Reading file…', { inline: true }))
      void this.load(node)
    }
    return this.root
  }

  /** Forget every file read, after they may have changed on disk. */
  reset(): void {
    this.cache.clear()
  }

  private async load(node: GraphNode): Promise<void> {
    try {
      const source = await getSource(node.path)
      this.cache.set(node.id, source)
      if (this.node?.id === node.id) this.render(source)
    } catch (error) {
      if (this.node?.id !== node.id) return
      const failure = error instanceof ApiFailure ? error : null
      this.root.replaceChildren(
        emptyState(failure?.message ?? 'Could not read this file', {
          inline: true,
          body: failure?.detail,
        }),
      )
    }
  }

  // -- rendering ------------------------------------------------------------

  private render(source: LayerSource): void {
    this.observer?.disconnect()
    const lines = source.text.split(/\r?\n/)
    if (lines.length > 1 && lines[lines.length - 1] === '') lines.pop()

    const code = el('div', `src__code${this.wrap ? ' is-wrapped' : ''}`)
    code.style.setProperty('--src-gutter', `${String(source.totalLines).length}ch`)

    this.observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (!entry.isIntersecting) continue
          const chunk = entry.target as HTMLElement
          this.observer?.unobserve(chunk)
          this.fill(chunk, lines)
        }
      },
      { root: this.scroller, rootMargin: '1200px 0px' },
    )

    // Where each chunk starts inside a doc string, found with one cheap pass
    // rather than by tokenising everything before it.
    let inDoc = false
    for (let start = 0; start < lines.length; start += CHUNK) {
      const count = Math.min(CHUNK, lines.length - start)
      const chunk = el('div', 'src__chunk')
      chunk.dataset.start = String(start)
      chunk.dataset.doc = inDoc ? '1' : ''
      chunk.style.minHeight = `${count * LINE_HEIGHT}px`
      code.appendChild(chunk)
      this.observer.observe(chunk)

      for (let index = start; index < start + count; index++) {
        const quotes = lines[index]!.split('"""').length - 1
        if (quotes % 2) inDoc = !inDoc
      }
    }

    const children: HTMLElement[] = [this.buildBar(source, lines.length), code]
    if (source.truncated) {
      children.push(
        emptyState(`Showing ${lines.length.toLocaleString()} of ${source.totalLines.toLocaleString()} lines.`, {
          inline: true,
          body: 'The rest of the file is too long to show here. Reveal it to open it in an editor.',
        }),
      )
    }
    this.root.replaceChildren(...children)
  }

  private fill(chunk: HTMLElement, lines: string[]): void {
    const start = Number(chunk.dataset.start)
    const end = Math.min(start + CHUNK, lines.length)
    const state: LineState = { inDoc: chunk.dataset.doc === '1' }

    const fragment = document.createDocumentFragment()
    for (let index = start; index < end; index++) {
      const line = el('div', 'src__line')
      line.dataset.n = String(index + 1)
      for (const token of tokenize(lines[index]!, state)) {
        line.appendChild(this.buildToken(token.kind, token.text))
      }
      fragment.appendChild(line)
    }
    chunk.appendChild(fragment)
    chunk.style.minHeight = ''
  }

  private buildToken(kind: string, text: string): Node {
    if (kind === 'plain') return document.createTextNode(text)
    if (kind === 'asset') {
      const target = this.links.get(text.replace(/^@+|@+$/g, ''))
      if (target && target !== this.node?.id) {
        const link = el('span', 'tok tok--asset src__link', text)
        link.dataset.target = target
        link.title = 'Select this file'
        return link
      }
    }
    return el('span', `tok tok--${kind}`, text)
  }

  private buildBar(source: LayerSource, shown: number): HTMLElement {
    const bar = el('div', 'src__bar')

    const facts = el('div', 'src__facts')
    facts.appendChild(el('span', 'src__format', this.node?.format ?? 'usda'))
    facts.appendChild(
      el('span', undefined, `${source.totalLines.toLocaleString()} lines · ${formatBytes(source.size)}`),
    )
    bar.appendChild(facts)

    const tools = el('div', 'src__tools')
    const wrap = iconButton('wrap', this.wrap ? 'Stop wrapping lines' : 'Wrap long lines', () => {
      this.wrap = !this.wrap
      wrap.classList.toggle('is-on', this.wrap)
      wrap.title = this.wrap ? 'Stop wrapping lines' : 'Wrap long lines'
      this.root.querySelector('.src__code')?.classList.toggle('is-wrapped', this.wrap)
    })
    wrap.classList.toggle('is-on', this.wrap)
    wrap.setAttribute('aria-pressed', String(this.wrap))
    tools.appendChild(wrap)
    tools.appendChild(
      iconButton('copy', shown < source.totalLines ? 'Copy the lines shown' : 'Copy the file', () => void this.copy(source)),
    )
    bar.appendChild(tools)
    return bar
  }

  private async copy(source: LayerSource): Promise<void> {
    const ok = await copyText(source.text)
    this.callbacks.onToast(ok ? 'Copied to the clipboard' : 'Could not copy to the clipboard', ok ? 'ok' : 'error')
  }
}
