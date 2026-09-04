/** The right-hand detail panel for whichever file is selected. */

import type { Graph, GraphEdge, GraphNode } from '@shared/types'
import { ARC_COLOR, ARC_LABEL, ICONS, MISSING_COLOR, ROOT_COLOR } from '../graph/theme'
import { clear, copyText, el, formatBytes, formatDate, icon, must } from '../util'

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

    const outgoing = graph.edges.filter((e) => e.from === nodeId)
    const incoming = graph.edges.filter((e) => e.to === nodeId)
    const isRoot = node.id === graph.rootId
    const missing = !node.exists && !node.template

    clear(this.root)
    this.root.hidden = false
    this.root.style.setProperty(
      '--accent',
      isRoot ? ROOT_COLOR : missing ? MISSING_COLOR : ARC_COLOR[incoming[0]?.kind ?? 'unknown'],
    )

    this.root.appendChild(this.buildHead(node, isRoot, missing))
    if (node.meta) this.root.appendChild(this.buildMeta(node))
    this.root.appendChild(
      this.buildArcs('References out', outgoing, graph, (e) => e.to),
    )
    this.root.appendChild(
      this.buildArcs('Referenced by', incoming, graph, (e) => e.from),
    )
  }

  private buildHead(node: GraphNode, isRoot: boolean, missing: boolean): HTMLElement {
    const head = el('div', 'insp__head')

    const top = el('div', 'insp__top')
    top.appendChild(el('h2', 'insp__title', node.name))
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

    const pathRow = el('div', 'insp__path')
    const code = el('code', undefined, node.path)
    pathRow.appendChild(code)
    head.appendChild(pathRow)

    if (node.error) {
      const error = el('div', 'insp__path')
      error.style.borderColor = 'color-mix(in srgb, var(--danger) 35%, transparent)'
      const errorCode = el('code', undefined, node.error)
      errorCode.style.color = 'var(--danger)'
      error.appendChild(errorCode)
      head.appendChild(error)
    }

    const actions = el('div', 'insp__actions')

    const copy = el('button', 'btn', 'Copy path')
    copy.addEventListener('click', async () => {
      const ok = await copyText(node.path)
      this.callbacks.onToast(
        ok ? 'Path copied' : 'Could not copy to the clipboard',
        ok ? 'ok' : 'error',
      )
    })
    actions.appendChild(copy)

    if (node.exists) {
      const revealBtn = el('button', 'btn', 'Reveal')
      revealBtn.addEventListener('click', () => this.callbacks.onReveal(node.path))
      actions.appendChild(revealBtn)
    }

    if (!isRoot && node.kind === 'layer' && node.exists) {
      const rootBtn = el('button', 'btn', 'Set as root')
      rootBtn.addEventListener('click', () => this.callbacks.onSetRoot(node.id))
      actions.appendChild(rootBtn)
    }

    head.appendChild(actions)
    return head
  }

  private buildMeta(node: GraphNode): HTMLElement {
    const meta = node.meta!
    const section = el('div', 'insp__section')
    section.appendChild(el('h3', undefined, 'Layer'))

    const list = el('dl', 'kv')
    const row = (key: string, value: string | undefined | null): void => {
      if (value === undefined || value === null || value === '') return
      list.appendChild(el('dt', undefined, key))
      list.appendChild(el('dd', undefined, value))
    }

    row('Default prim', meta.defaultPrim)
    row('Up axis', meta.upAxis)
    row(
      'Metres/unit',
      meta.metersPerUnit === undefined ? undefined : String(meta.metersPerUnit),
    )
    if (meta.startTimeCode !== undefined || meta.endTimeCode !== undefined) {
      const fps = meta.framesPerSecond ? ` @ ${meta.framesPerSecond}fps` : ''
      row('Frame range', `${meta.startTimeCode ?? '?'} – ${meta.endTimeCode ?? '?'}${fps}`)
    }
    row('Root prims', meta.primCount === undefined ? undefined : String(meta.primCount))
    row('Modified', formatDate(node.mtime))

    for (const [key, value] of Object.entries(meta.customLayerData ?? {})) {
      row(key, value)
    }

    section.appendChild(list)
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
    const count = el('span', 'badge badge--muted', String(edges.length))
    count.style.marginLeft = 'auto'
    heading.appendChild(count)
    section.appendChild(heading)

    if (!edges.length) {
      section.appendChild(el('div', 'empty-note', 'Nothing.'))
      return section
    }

    const list = el('div', 'arc-list')
    for (const edge of edges) {
      const otherId = pick(edge)
      const other = graph.nodes.find((n) => n.id === otherId)
      if (!other) continue
      const missing = !other.exists && !other.template

      const row = el('button', `arc${missing ? ' arc--missing' : ''}`)
      const pip = el('span', 'arc__pip')
      pip.style.setProperty('--accent', missing ? MISSING_COLOR : ARC_COLOR[edge.kind])
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
        details.push(edge.variants.map((v) => `${v.set}=${v.variant}`).join(' / '))
      }
      if (!details.length) details.push(edge.rawPath)
      main.appendChild(el('div', 'arc__meta', details.join('  ·  ')))
      row.appendChild(main)

      const kind = el('span', 'arc__kind', ARC_LABEL[edge.kind].split(' ')[0] ?? edge.kind)
      kind.style.setProperty('--accent', missing ? MISSING_COLOR : ARC_COLOR[edge.kind])
      row.appendChild(kind)

      row.title = edge.rawPath
      row.addEventListener('click', () => this.callbacks.onSelect(otherId))
      list.appendChild(row)
    }

    section.appendChild(list)
    return section
  }
}

function tag(
  text: string,
  variant?: 'accent' | 'danger' | 'warn' | 'role',
): HTMLElement {
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
