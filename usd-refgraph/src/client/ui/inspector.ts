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
  ROOT_COLOR,
  TIER_TINT,
  arcSample,
} from '../graph/theme'
import { ICONS } from './icons'
import {
  Facts,
  button,
  countBadge,
  emptyState,
  iconButton,
  statusPill,
  truncated,
} from './kit'
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
}

export class Inspector {
  private readonly root = must<HTMLElement>('#inspector')

  constructor(private readonly callbacks: InspectorCallbacks) {}

  hide(): void {
    this.root.hidden = true
    clear(this.root)
  }

  show(graph: Graph, nodeId: string): void {
    const node = graph.nodes.find((n) => n.id === nodeId)
    if (!node) {
      this.hide()
      return
    }

    const outgoing = graph.edges.filter((edge) => edge.from === nodeId)
    const incoming = graph.edges.filter((edge) => edge.to === nodeId)
    const isRoot = node.id === graph.rootId
    const missing = !node.exists && !node.template

    clear(this.root)
    this.root.hidden = false
    this.root.style.setProperty(
      '--accent',
      isRoot ? ROOT_COLOR : missing ? MISSING_COLOR : TIER_TINT[node.tier ?? ''] ?? 'var(--fg-3)',
    )

    this.root.appendChild(this.buildHead(node, isRoot, missing))

    const record = readRecord(node.meta?.customLayerData)
    if (!isEmptyRecord(record)) this.root.appendChild(this.buildPublish(record))
    if (node.meta) this.root.appendChild(this.buildLayer(node))

    this.root.appendChild(this.buildArcs('References out', outgoing, graph, (e) => e.to))
    this.root.appendChild(this.buildArcs('Referenced by', incoming, graph, (e) => e.from))
  }

  // -- head ---------------------------------------------------------------

  private buildHead(node: GraphNode, isRoot: boolean, missing: boolean): HTMLElement {
    const head = el('div', 'insp__head')

    const top = el('div', 'insp__top')
    const title = el('h2', 'insp__title', node.name)
    title.title = node.name
    top.appendChild(title)
    head.appendChild(top)

    const tags = el('div', 'insp__tags')
    if (isRoot) tags.appendChild(tag('root', 'accent'))
    if (node.role === 'assembly') tags.appendChild(tag(node.roleLabel, 'role'))
    else if (node.role === 'block') tags.appendChild(tag(node.roleLabel))
    tags.appendChild(tag(node.kind === 'layer' ? node.format : node.ext || 'file'))
    if (node.binary) tags.appendChild(tag('binary'))
    if (node.template) tags.appendChild(tag('template', 'warn'))
    if (missing) tags.appendChild(tag('missing', 'danger'))
    if (node.exists) tags.appendChild(tag(formatBytes(node.size)))
    head.appendChild(tags)

    // One line, ellipsised from the left so the filename stays visible, with
    // the full path in the tooltip and on the clipboard.
    const pathRow = el('div', 'insp__path')
    pathRow.appendChild(truncated(node.path, 'insp__pathText'))
    pathRow.appendChild(
      iconButton('copy', 'Copy path', () => void this.copy(node.path)),
    )
    head.appendChild(pathRow)

    if (node.error) {
      const error = el('div', 'insp__error')
      const glyph = icon(ICONS.alert)
      glyph.setAttribute('class', 'insp__errorIcon')
      error.appendChild(glyph)
      error.appendChild(el('span', undefined, node.error))
      head.appendChild(error)
    }

    const actions = el('div', 'insp__actions')
    if (node.exists) {
      actions.appendChild(
        button('Reveal', {
          icon: 'external',
          small: true,
          title: 'Show this file in the file manager',
          onClick: () => this.callbacks.onReveal(node.path),
        }),
      )
    }
    if (!isRoot && node.kind === 'layer' && node.exists) {
      actions.appendChild(
        button('Set as root', {
          icon: 'target',
          small: true,
          variant: 'primary',
          title: 'Re-crawl from this file',
          onClick: () => this.callbacks.onSetRoot(node.id),
        }),
      )
    }
    if (actions.childElementCount) head.appendChild(actions)
    return head
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

    const heading = el('h3', undefined, 'Publish')
    if (record.status !== 'unknown' || record.statusRaw) {
      heading.appendChild(statusPill(record.status, true))
    }
    section.appendChild(heading)

    const facts = new Facts()
    facts.add('Artist', record.artist)
    facts.add('Published', record.exportedAt ? formatMoment(record.exportedAt) : null)
    facts.add('Workfile', record.hipFile)
    facts.add('ROP', record.ropPath)
    if (record.status === 'unknown' && record.statusRaw) {
      facts.add('Status as written', record.statusRaw)
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
    facts.add('Default prim', meta.defaultPrim)
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

function tag(text: string, variant?: 'accent' | 'danger' | 'warn' | 'role'): HTMLElement {
  return el('span', `tag${variant ? ` tag--${variant}` : ''}`, text)
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
