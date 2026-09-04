/** The left rail: crawl summary, arc legend and the list of problems. */

import type { ArcKind, Graph } from '@shared/types'
import { ARC_COLOR, ARC_HINT, ARC_LABEL, ARC_ORDER, ICONS } from '../graph/theme'
import { clear, el, formatBytes, formatMs, icon, must, truncateStart } from '../util'

export interface RecentFile {
  path: string
  name: string
  dir: string
}

export interface SidebarCallbacks {
  onToggleArc(kind: ArcKind): void
  onFocusNode(id: string): void
  onOpenRecent(path: string): void
}

export class Sidebar {
  private readonly statsEl = must<HTMLElement>('#stats')
  private readonly legendEl = must<HTMLElement>('#legend')
  private readonly warningsEl = must<HTMLElement>('#warnings')
  private readonly warningCount = must<HTMLElement>('#warning-count')
  private readonly recentPanel = must<HTMLElement>('#recent-panel')
  private readonly recentEl = must<HTMLElement>('#recent')

  constructor(private readonly callbacks: SidebarCallbacks) {}

  update(graph: Graph | null, hiddenArcs: Set<ArcKind>): void {
    this.renderStats(graph)
    this.renderLegend(graph, hiddenArcs)
    this.renderWarnings(graph)
  }

  private renderStats(graph: Graph | null): void {
    clear(this.statsEl)
    if (!graph) {
      this.statsEl.appendChild(el('div', 'empty-note', 'No file loaded.'))
      return
    }

    const { stats } = graph
    this.statsEl.appendChild(stat(String(stats.layers), 'Layers'))
    this.statsEl.appendChild(stat(String(stats.assets), 'Assets'))
    this.statsEl.appendChild(
      stat(String(stats.missing), stats.missing === 1 ? 'Missing' : 'Missing', stats.missing > 0),
    )
    this.statsEl.appendChild(stat(String(stats.maxDepth), 'Depth'))

    const size = el('div', 'stat stat--wide')
    size.appendChild(el('span', 'stat__value', formatBytes(stats.totalBytes)))
    size.appendChild(el('span', 'stat__label', 'on disk'))
    this.statsEl.appendChild(size)

    const timing = el('div', 'stat stat--wide')
    timing.appendChild(el('span', 'stat__value', formatMs(stats.elapsedMs)))
    timing.appendChild(
      el('span', 'stat__label', `to crawl ${stats.edges} arcs`),
    )
    this.statsEl.appendChild(timing)

    if (graph.cycles.length) {
      const cycles = el('div', 'stat stat--wide stat--alert')
      cycles.appendChild(el('span', 'stat__value', String(graph.cycles.length)))
      cycles.appendChild(
        el('span', 'stat__label', graph.cycles.length === 1 ? 'cycle found' : 'cycles found'),
      )
      this.statsEl.appendChild(cycles)
    }
  }

  private renderLegend(graph: Graph | null, hidden: Set<ArcKind>): void {
    clear(this.legendEl)
    for (const kind of ARC_ORDER) {
      const count = graph?.stats.byArc[kind] ?? 0
      if (!count && graph) continue

      const row = el('button', 'legend__row')
      if (hidden.has(kind)) row.classList.add('is-off')
      row.title = ARC_HINT[kind]

      const swatch = el('span', 'legend__swatch')
      swatch.style.setProperty('--swatch', ARC_COLOR[kind])
      row.appendChild(swatch)
      row.appendChild(el('span', 'legend__name', ARC_LABEL[kind]))
      row.appendChild(el('span', 'legend__count', String(count)))

      row.addEventListener('click', () => this.callbacks.onToggleArc(kind))
      this.legendEl.appendChild(row)
    }

    if (!this.legendEl.childElementCount) {
      this.legendEl.appendChild(el('div', 'empty-note', 'No arcs yet.'))
    }
  }

  private renderWarnings(graph: Graph | null): void {
    clear(this.warningsEl)
    const warnings = graph?.warnings ?? []
    this.warningCount.textContent = String(warnings.length)
    this.warningCount.className = warnings.length ? 'badge badge--alert' : 'badge badge--muted'

    if (!warnings.length) {
      const note = el('div', 'empty-note')
      note.appendChild(icon(ICONS.check))
      note.appendChild(
        el('span', undefined, graph ? 'Every path resolves.' : 'Nothing scanned yet.'),
      )
      this.warningsEl.appendChild(note)
      return
    }

    for (const warning of warnings) {
      const row = el('button', `warn-row warn-row--${warning.severity}`)
      const glyph = icon(warning.severity === 'info' ? ICONS.alert : ICONS.missing)
      glyph.setAttribute('class', 'warn-row__icon')
      row.appendChild(glyph)

      const text = el('div', 'warn-row__text')
      text.textContent = warning.message
      row.appendChild(text)

      if (warning.nodeId) {
        const id = warning.nodeId
        row.addEventListener('click', () => this.callbacks.onFocusNode(id))
      } else {
        row.style.cursor = 'default'
      }
      this.warningsEl.appendChild(row)
    }
  }

  setRecent(files: RecentFile[]): void {
    this.recentPanel.hidden = files.length === 0
    clear(this.recentEl)
    for (const file of files) {
      const row = el('button', 'recent__row')
      row.appendChild(el('span', 'recent__name', file.name))
      row.appendChild(el('span', 'recent__dir', truncateStart(file.dir, 34)))
      row.title = file.path
      row.addEventListener('click', () => this.callbacks.onOpenRecent(file.path))
      this.recentEl.appendChild(row)
    }
  }
}

function stat(value: string, label: string, alert = false): HTMLElement {
  const box = el('div', `stat${alert ? ' stat--alert' : ''}`)
  box.appendChild(el('div', 'stat__value', value))
  box.appendChild(el('div', 'stat__label', label))
  return box
}
