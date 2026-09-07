/** The graph rail's arc legend. */

import type { ArcKind, Graph } from '@shared/types'
import { ARC_HINT, ARC_LABEL, ARC_ORDER, ARC_STROKE, arcSample } from '../graph/theme'
import { emptyState } from './kit'
import { clear, el, must } from '../util'

export interface SidebarCallbacks {
  onToggleArc(kind: ArcKind): void
}

export class Sidebar {
  private readonly legendEl = must<HTMLElement>('#legend')

  constructor(private readonly callbacks: SidebarCallbacks) {}

  update(graph: Graph | null, hiddenArcs: Set<ArcKind>): void {
    clear(this.legendEl)

    for (const kind of ARC_ORDER) {
      const count = graph?.stats.byArc[kind] ?? 0
      if (!count && graph) continue

      const row = el('button', 'legend__row')
      if (hiddenArcs.has(kind)) row.classList.add('is-off')
      // Say how it is drawn as well as what it means: the line style is the
      // only thing telling one arc from another on the graph.
      row.title = `${ARC_HINT[kind]}\nDrawn ${ARC_STROKE[kind]}`
      row.setAttribute('aria-pressed', String(!hiddenArcs.has(kind)))

      const swatch = el('span', 'legend__swatch')
      swatch.appendChild(arcSample(kind))
      row.appendChild(swatch)
      row.appendChild(el('span', 'legend__name', ARC_LABEL[kind]))
      row.appendChild(el('span', 'legend__count', String(count)))

      row.addEventListener('click', () => this.callbacks.onToggleArc(kind))
      this.legendEl.appendChild(row)
    }

    if (!this.legendEl.childElementCount) {
      this.legendEl.appendChild(emptyState('No arcs yet.', { inline: true }))
    }
  }
}
