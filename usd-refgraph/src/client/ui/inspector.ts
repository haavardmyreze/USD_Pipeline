/**
 * The right-hand detail panel for whichever file is selected.
 *
 * The crawl hands `customLayerData` through raw, so the panel reads it with
 * the same reader the project scan uses and presents the result the same way
 * the project pages do — a status pill, a named artist, a formatted publish
 * time. A layer should not describe itself differently depending on which part
 * of the app you are looking at it from.
 */

import type { Graph, GraphEdge, GraphNode } from '@shared/types'
import { isEmptyRecord, readRecord } from '@shared/pipeline'
import {
  ARC_LABEL,
  ARC_STROKE,
  MISSING_COLOR,
  TIER_TINT,
  arcSample,
} from '../graph/theme'
import { ICONS } from './icons'
import { dismiss, present } from './presence'
import type { SceneTree } from './scene'
import { SourceView } from './source'
import { Facts, STATUS_LABEL, countBadge, emptyState, iconButton, statusDot } from './kit'
import {
  clear,
  copyText,
  el,
  formatBytes,
  formatDate,
  formatMoment,
  icon,
  must,
} from '../util'

export interface InspectorCallbacks {
  onSelect(id: string): void
  onSetRoot(id: string): void
  onReveal(path: string): void
  onToast(message: string, kind?: 'ok' | 'error'): void
  /** The panel changed width, so whatever frames around it should re-measure. */
  onLayout(): void
  /** Switch to the Graph and crawl from this file. */
  onOpenInGraph(path: string): void
  /** The panel's own close button. */
  onClose(): void
}

/** Whether the panel describes a node in the graph, or a file from a page. */
export type PanelMode = 'graph' | 'file'

type Tab = 'details' | 'scene' | 'source'

const TABS: [Tab, string][] = [
  ['details', 'Details'],
  ['scene', 'Scene'],
  ['source', 'Source'],
]

export class Inspector {
  private readonly root = must<HTMLElement>('#inspector')
  private readonly source: SourceView
  private tab: Tab = 'details'
  private mode: PanelMode = 'graph'
  /** The node on screen, so re-showing it can keep the scroll position. */
  private shownId: string | null = null

  constructor(
    private readonly callbacks: InspectorCallbacks,
    private readonly scene: SceneTree,
  ) {
    this.source = new SourceView(this.root, {
      onSelect: (id) => callbacks.onSelect(id),
      onToast: (message, kind) => callbacks.onToast(message, kind),
    })
  }

  hide(): void {
    this.shownId = null
    dismiss(this.root, () => {
      clear(this.root)
      this.root.classList.remove('inspector--wide', 'inspector--code')
    })
  }

  /** How much of the stage's right edge the panel covers, margins included. */
  get inset(): number {
    if (this.root.hidden) return 0
    const margin = parseFloat(getComputedStyle(this.root).right) || 0
    return this.root.offsetWidth + margin * 2
  }

  /**
   * Show one node of `graph`.
   *
   * In `graph` mode the node sits in the graph on screen. In `file` mode it
   * was picked from a project page, and `graph` is a shallow crawl from that
   * file alone: enough for what it references, but blind to what references
   * it, so that section is left out and "root" means nothing.
   */
  show(graph: Graph, nodeId: string, mode: PanelMode = this.mode): void {
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) {
      this.hide()
      return
    }
    this.mode = mode

    const outgoing = graph.edges.filter((edge) => edge.from === nodeId)
    const incoming = graph.edges.filter((edge) => edge.to === nodeId)
    const isRoot = mode === 'graph' && node.id === graph.rootId
    const missing = !node.exists && !node.template

    // Only a layer that exists has a stage to show, and only a text layer has
    // source; anything else gets no tab rather than an empty one. The chosen
    // tab is kept, so stepping through a binary file and back returns to it.
    const isLayer = node.kind === 'layer' && node.exists
    const tabs = TABS.filter(([value]) => value !== 'source' || !node.binary)
    const tab = isLayer && tabs.some(([value]) => value === this.tab) ? this.tab : 'details'

    // A different file starts at its top; the same file keeps its place.
    const sameNode = this.shownId === nodeId
    const scrollTop = this.root.scrollTop
    this.shownId = nodeId

    clear(this.root)
    present(this.root)
    this.root.style.setProperty(
      '--accent',
      missing ? MISSING_COLOR : TIER_TINT[node.tier ?? ''] ?? 'var(--fg-3)',
    )

    // A deep prim tree wants width, and code more still; Details reads better
    // narrow.
    const size = tab === 'source' ? 'inspector--code' : tab === 'scene' ? 'inspector--wide' : null
    const sizes = ['inspector--wide', 'inspector--code']
    const current = sizes.find((name) => this.root.classList.contains(name)) ?? null
    if (current !== size) {
      this.root.classList.remove(...sizes)
      if (size) this.root.classList.add(size)
      this.callbacks.onLayout()
    }

    this.root.appendChild(
      this.buildHead(node, isRoot, missing, mode === 'graph' ? incoming.length : 0),
    )
    if (isLayer) this.root.appendChild(this.buildTabs(graph, nodeId, tabs, tab))

    if (tab === 'scene') this.root.appendChild(this.scene.show(node))
    else if (tab === 'source') this.root.appendChild(this.source.show(graph, node))
    else this.buildDetails(graph, node, outgoing, incoming)

    this.root.scrollTop = sameNode ? scrollTop : 0
  }

  private buildDetails(
    graph: Graph,
    node: GraphNode,
    outgoing: GraphEdge[],
    incoming: GraphEdge[],
  ): void {

    const record = readRecord(node.meta?.customLayerData)
    if (!isEmptyRecord(record)) this.root.appendChild(this.buildPublish(record))
    if (node.meta) this.root.appendChild(this.buildLayer(node))

    this.root.appendChild(this.buildArcs('References out', outgoing, graph, (e) => e.to))
    if (this.mode === 'graph') {
      this.root.appendChild(this.buildArcs('Referenced by', incoming, graph, (e) => e.from))
    }
  }

  /** Forget cached scene trees and file text, after a rescan. */
  reset(): void {
    this.scene.reset()
    this.source.reset()
  }

  // -- head ---------------------------------------------------------------

  private buildHead(
    node: GraphNode,
    isRoot: boolean,
    missing: boolean,
    usedBy: number,
  ): HTMLElement {
    // Two quiet lines rather than a row of chips and a row of buttons: the
    // name with every action beside it as one small cluster, then what the
    // file is, in words.
    const head = el('div', 'insp__head')

    const top = el('div', 'insp__top')
    // Non-breaking hyphens: `set-landscape.usda` should wrap as a whole name,
    // never as `set-` over `landscape.usda`.
    const title = el('h2', 'insp__title', node.name.replace(/-/g, '‑'))
    title.title = node.name
    title.title = node.path
    top.appendChild(title)

    const tools = el('div', 'insp__tools')
    const primary = this.primaryAction(node, isRoot)
    if (primary) tools.appendChild(primary)
    tools.appendChild(iconButton('copy', 'Copy path', () => void this.copy(node.path)))
    if (node.exists) {
      tools.appendChild(
        iconButton('external', 'Show in the file manager', () => this.callbacks.onReveal(node.path)),
      )
    }
    tools.appendChild(el('span', 'insp__toolSep'))
    tools.appendChild(iconButton('close', 'Close (Esc)', () => this.callbacks.onClose()))
    top.appendChild(tools)
    head.appendChild(top)

    const facts = el('p', 'insp__facts')
    const fact = (text: string, variant?: string): void => {
      facts.appendChild(el('span', `insp__fact${variant ? ` insp__fact--${variant}` : ''}`, text))
    }

    const record = readRecord(node.meta?.customLayerData)
    if (record.status !== 'unknown') {
      const status = el('span', `insp__fact insp__status insp__status--${record.status}`)
      status.appendChild(statusDot(record.status))
      status.appendChild(el('span', undefined, STATUS_LABEL[record.status]))
      facts.appendChild(status)
    }
    if (missing) fact('missing on disk', 'danger')
    if (node.template) fact('placeholder path', 'warn')
    if (isRoot) fact('root')
    if (node.role === 'assembly' || node.role === 'block') fact(node.roleLabel)
    fact(node.kind === 'layer' ? node.format : node.ext || 'file')
    if (node.binary) fact('binary')
    if (node.exists) fact(formatBytes(node.size))
    // Pulled in from more than one place: worth knowing before changing it.
    if (usedBy > 1) fact(`used ${usedBy}×`)
    head.appendChild(facts)

    if (node.error) {
      const error = el('div', 'insp__error')
      const glyph = icon(ICONS.alert)
      glyph.setAttribute('class', 'insp__errorIcon')
      error.appendChild(glyph)
      error.appendChild(el('span', undefined, node.error))
      head.appendChild(error)
    }
    return head
  }

  /**
   * The next step for this file, when there is one — graph from it — as the
   * first, accented button in the header's cluster.
   */
  private primaryAction(node: GraphNode, isRoot: boolean): HTMLElement | null {
    if (node.kind !== 'layer' || !node.exists) return null
    const action =
      this.mode === 'file'
        ? iconButton('graph', 'Open in graph — draw the reference graph from this file', () =>
            this.callbacks.onOpenInGraph(node.path),
          )
        : isRoot
          ? null
          : iconButton('target', 'Set as root — re-crawl the graph from this file', () =>
              this.callbacks.onSetRoot(node.id),
            )
    action?.classList.add('insp__primary')
    return action
  }

  /** Details, Scene or Source. The choice sticks as the selection moves. */
  private buildTabs(graph: Graph, nodeId: string, tabs: [Tab, string][], active: Tab): HTMLElement {
    const bar = el('div', 'insp__tabs')
    const seg = el('div', 'seg')
    seg.setAttribute('role', 'tablist')
    for (const [value, label] of tabs) {
      const on = active === value
      const tab = el('button', `seg__btn${on ? ' is-on' : ''}`, label)
      tab.setAttribute('role', 'tab')
      tab.setAttribute('aria-selected', String(on))
      tab.addEventListener('click', () => {
        if (on) return
        this.tab = value
        this.show(graph, nodeId)
      })
      seg.appendChild(tab)
    }
    bar.appendChild(seg)
    return bar
  }

  private async copy(path: string): Promise<void> {
    const ok = await copyText(path)
    this.callbacks.onToast(
      ok ? 'Path copied' : 'Could not copy to the clipboard',
      ok ? 'ok' : 'error',
    )
  }

  // -- sections -----------------------------------------------------------

  /** The publisher's own record, shown the way the project pages show it. */
  private buildPublish(record: ReturnType<typeof readRecord>): HTMLElement {
    const section = el('div', 'insp__section')

    section.appendChild(el('h3', undefined, 'Publish'))

    const facts = new Facts()
    facts.add('Artist', record.artist)
    facts.add('Published', record.exportedAt ? formatMoment(record.exportedAt) : null)
    facts.add('Workfile', record.hipFile, true)
    facts.add('ROP', record.ropPath, true)
    if (record.status === 'unknown' && record.statusRaw) {
      facts.add('Status as written', record.statusRaw, true)
    }
    for (const [key, value] of Object.entries(record.extra ?? {})) facts.add(key, value)
    if (!facts.isEmpty) section.appendChild(facts.root)

    if (record.comment) {
      section.appendChild(el('p', 'insp__comment', record.comment))
    }
    return section
  }

  /** What USD itself says about the layer. */
  private buildLayer(node: GraphNode): HTMLElement {
    const meta = node.meta!
    const section = el('div', 'insp__section')
    section.appendChild(el('h3', undefined, 'Layer'))

    const facts = new Facts()
    facts.add('Default prim', meta.defaultPrim, true)
    facts.add('Up axis', meta.upAxis)
    facts.add(
      'Metres/unit',
      meta.metersPerUnit === undefined ? undefined : String(meta.metersPerUnit),
    )
    if (meta.startTimeCode !== undefined || meta.endTimeCode !== undefined) {
      const fps = meta.framesPerSecond ? ` @ ${meta.framesPerSecond}fps` : ''
      facts.add('Frame range', `${meta.startTimeCode ?? '?'} – ${meta.endTimeCode ?? '?'}${fps}`)
    }
    facts.add('Root prims', meta.primCount === undefined ? undefined : String(meta.primCount))
    facts.add('Modified', node.mtime ? formatDate(node.mtime) : null)

    if (facts.isEmpty) {
      section.appendChild(emptyState('Nothing authored in layer metadata.', { inline: true }))
    } else {
      section.appendChild(facts.root)
    }
    return section
  }

  private buildArcs(
    title: string,
    edges: GraphEdge[],
    graph: Graph,
    pick: (edge: GraphEdge) => string,
  ): HTMLElement {
    const section = el('div', 'insp__section')
    const heading = el('h3', undefined, title)
    heading.appendChild(countBadge(edges.length))
    section.appendChild(heading)

    if (!edges.length) {
      section.appendChild(emptyState('Nothing.', { inline: true }))
      return section
    }

    const list = el('div', 'arc-list')
    for (const edge of edges) {
      const otherId = pick(edge)
      const other = graph.nodes.find((node) => node.id === otherId)
      if (!other) continue
      const missing = !other.exists && !other.template

      const row = el('button', `arc${missing ? ' arc--missing' : ''}`)
      const pip = el('span', 'arc__pip')
      pip.appendChild(arcSample(edge.kind, 26))
      pip.title = `Drawn ${ARC_STROKE[edge.kind]}`
      row.appendChild(pip)

      const main = el('div', 'arc__main')
      main.appendChild(el('div', 'arc__name', other.name))

      const details: string[] = []
      if (edge.via?.length) {
        // A collapsed arc: say which blocks it actually went through, so the
        // simplified view never hides where a dependency really comes from.
        details.push(`via ${edge.via.join(' → ')}`)
      }
      if (edge.primPath) details.push(edge.primPath)
      if (edge.targetPrim) details.push(`→ ${edge.targetPrim}`)
      if (edge.attribute) details.push(edge.attribute)
      if (edge.variants?.length) {
        details.push(edge.variants.map((variant) => `${variant.set}=${variant.variant}`).join(' / '))
      }
      if (!details.length) details.push(edge.rawPath)
      main.appendChild(el('div', 'arc__meta', details.join('  ·  ')))
      row.appendChild(main)

      row.appendChild(
        el('span', 'arc__kind', ARC_LABEL[edge.kind].split(' ')[0] ?? edge.kind),
      )

      row.title = edge.rawPath
      row.addEventListener('click', () => this.callbacks.onSelect(otherId))
      list.appendChild(row)
    }

    section.appendChild(list)
    return section
  }
}

export function toast(
  message: string,
  kind: 'ok' | 'error' = 'ok',
  host = must<HTMLElement>('#toasts'),
): void {
  const node = el('div', `toast toast--${kind}`)
  node.appendChild(icon(kind === 'ok' ? ICONS.check : ICONS.alert))
  node.appendChild(el('span', undefined, message))
  host.appendChild(node)
  window.setTimeout(() => {
    node.classList.add('is-leaving')
    window.setTimeout(() => node.remove(), 200)
  }, 2600)
}
