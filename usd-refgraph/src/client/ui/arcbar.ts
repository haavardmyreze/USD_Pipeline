/**
 * One chip per arc kind in the graph's toolbar, with how many of each the
 * crawl found.
 *
 * A click isolates that kind — the question is usually "just show me the
 * references" — and a second click on the isolated chip brings the rest
 * back. Shift-click switches a single kind on or off, for combinations.
 *
 * Textures are left out: the Textures toggle beside these owns them, and two
 * controls for one thing would disagree.
 */

import type { ArcKind, Graph } from '@shared/types'
import { ARC_HINT, ARC_LABEL, ARC_ORDER, ARC_STROKE, arcSample } from '../graph/theme'
import { clear, el, must } from '../util'

export interface ArcBarCallbacks {
  /** Replace the set of hidden arc kinds. */
  onChange(hidden: Set<ArcKind>): void
}

/** The kinds that are composition, which these chips filter. */
export const STRUCTURAL_ARCS = ARC_ORDER.filter((kind) => kind !== 'asset')

export class ArcBar {
  private readonly host = must<HTMLElement>('#legend')

  constructor(private readonly callbacks: ArcBarCallbacks) {}

  update(graph: Graph | null, hidden: Set<ArcKind>): void {
    clear(this.host)
    if (!graph) return

    const present = STRUCTURAL_ARCS.filter((kind) => graph.stats.byArc[kind] > 0)
    const shown = present.filter((kind) => !hidden.has(kind))
    const isolated = present.length > 1 && shown.length === 1 ? shown[0] : null

    for (const kind of present) {
      const on = !hidden.has(kind)
      const chip = el('button', `gchip gchip--arc${on ? ' is-on' : ''}${kind === isolated ? ' is-isolated' : ''}`)
      chip.setAttribute('aria-pressed', String(on))
      chip.title =
        `${ARC_HINT[kind]}\nDrawn ${ARC_STROKE[kind]}\n\n` +
        (kind === isolated ? 'Click to show every arc again' : 'Click to show only these · Shift-click to toggle')

      const sample = el('span', 'gchip__sample')
      sample.appendChild(arcSample(kind, 22))
      chip.appendChild(sample)
      chip.appendChild(el('span', undefined, ARC_LABEL[kind]))
      chip.appendChild(
        el('span', 'gchip__count', kind === isolated ? 'isolated' : String(graph.stats.byArc[kind])),
      )

      chip.addEventListener('click', (event) => {
        const next = new Set(hidden)
        if (event.shiftKey) {
          if (next.has(kind)) next.delete(kind)
          else next.add(kind)
        } else if (kind === isolated) {
          for (const other of STRUCTURAL_ARCS) next.delete(other)
        } else {
          for (const other of STRUCTURAL_ARCS) {
            if (other === kind) next.delete(other)
            else next.add(other)
          }
        }
        this.callbacks.onChange(next)
      })
      this.host.appendChild(chip)
    }
  }
}
