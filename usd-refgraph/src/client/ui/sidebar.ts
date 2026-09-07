/** The graph rail's arc legend. */

import type { ArcKind, Graph } from '@shared/types'
import { ARC_COLOR, ARC_HINT, ARC_LABEL, ARC_ORDER } from '../graph/theme'
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
}
