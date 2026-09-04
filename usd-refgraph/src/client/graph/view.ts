/**
 * Renders the graph and owns every interaction inside the stage:
 * pan, zoom, hover highlighting, selection and node dragging.
 *
 * Nodes are DOM elements and edges are SVG paths, both inside one transformed
 * viewport. That keeps the cards fully styleable in CSS while the edges stay
 * crisp at any zoom.
 */

import type { Graph, GraphNode } from '@shared/types'
import { icon, truncateStart } from '../util'
import { ARC_COLOR, ICONS, MISSING_COLOR, ROOT_COLOR } from './theme'
import {
  layoutGraph,
  pipePath,
  NODE_H,
  NODE_W,
  type Layout,
  type Placed,
} from './layout'
import { formatBytes } from '../util'

const MIN_ZOOM = 0.12
const MAX_ZOOM = 2.6
const SVG_NS = 'http://www.w3.org/2000/svg'

export interface ViewCallbacks {
  onSelect(id: string | null): void
  onSetRoot(id: string): void
  onZoom(scale: number): void
}

interface Adjacency {
  out: Map<string, string[]>
  in: Map<string, string[]>
}

export class GraphView {
  private graph: Graph | null = null
  private layout: Layout = { nodes: new Map(), edges: [], width: 0, height: 0 }
  private adjacency: Adjacency = { out: new Map(), in: new Map() }

  private nodeEls = new Map<string, HTMLElement>()
  private edgeEls: { path: SVGPathElement; from: string; to: string }[] = []
  /** Tree children per node, so a drag can take a whole subtree with it. */
  private treeChildren = new Map<string, string[]>()

  private tx = 0
  private ty = 0
  private scale = 1

  private selected: string | null = null
  private hovered: string | null = null
  /** Ids matching the current filter box; empty means "no filter". */
  private highlighted = new Set<string>()

  constructor(
    private readonly stage: HTMLElement,
    private readonly viewport: HTMLElement,
    private readonly grid: HTMLElement,
    private readonly svg: SVGSVGElement,
    private readonly edgeLayer: SVGGElement,
    private readonly nodeLayer: HTMLElement,
    private readonly callbacks: ViewCallbacks,
  ) {
    this.bindStage()
  }

  // -- rendering ----------------------------------------------------------

  render(graph: Graph, visible: Set<string>): void {
    this.graph = graph
    this.layout = layoutGraph(graph, visible)
    this.adjacency = buildAdjacency(graph, visible)

    this.edgeLayer.replaceChildren()
    this.nodeLayer.replaceChildren()
    this.nodeEls.clear()
    this.edgeEls = []

    this.treeChildren.clear()
    for (const routed of this.layout.edges) {
      if (!routed.tree) continue
      const list = this.treeChildren.get(routed.edge.from)
      if (list) list.push(routed.edge.to)
      else this.treeChildren.set(routed.edge.from, [routed.edge.to])
    }

    for (const routed of this.layout.edges) {
      const path = document.createElementNS(SVG_NS, 'path')
      path.setAttribute('d', routed.d)
      const target = graph.nodes.find((n) => n.id === routed.edge.to)
      const missing = target ? !target.exists && !target.template : false
      path.setAttribute(
        'class',
        `edge edge--${routed.edge.kind}` +
          (missing ? ' edge--missing' : '') +
          (routed.tree ? '' : ' edge--cross'),
      )
      path.style.stroke = missing ? MISSING_COLOR : ARC_COLOR[routed.edge.kind]
      path.dataset.from = routed.edge.from
      path.dataset.to = routed.edge.to
      this.edgeLayer.appendChild(path)
      this.edgeEls.push({ path, from: routed.edge.from, to: routed.edge.to })
    }

    const incoming = new Map<string, string>()
    for (const routed of this.layout.edges) {
      if (!incoming.has(routed.edge.to)) incoming.set(routed.edge.to, routed.edge.kind)
    }

    for (const [id, placed] of this.layout.nodes) {
      const node = graph.nodes.find((n) => n.id === id)
      if (!node) continue
      const element = this.buildNode(node, placed, graph.rootId, incoming.get(id))
      this.nodeLayer.appendChild(element)
      this.nodeEls.set(id, element)
    }

    this.applyEmphasis()
  }

  private buildNode(
    node: GraphNode,
    placed: Placed,
    rootId: string,
    incomingKind: string | undefined,
  ): HTMLElement {
    const isRoot = node.id === rootId
    const missing = !node.exists && !node.template

    const card = document.createElement('div')
    card.className = 'node'
    if (isRoot) card.classList.add('node--root')
    if (missing) card.classList.add('node--missing')
    if (node.role === 'assembly') card.classList.add('node--assembly')
    else if (node.role === 'block') card.classList.add('node--block')
    card.dataset.id = node.id
    card.style.transform = `translate(${placed.x}px, ${placed.y}px)`
    card.style.setProperty(
      '--accent',
      isRoot
        ? ROOT_COLOR
        : missing
          ? MISSING_COLOR
          : ARC_COLOR[(incomingKind as keyof typeof ARC_COLOR) ?? 'unknown'] ??
            'var(--arc-unknown)',
    )

    const accent = document.createElement('div')
    accent.className = 'node__accent'
    card.appendChild(accent)

    const body = document.createElement('div')
    body.className = 'node__body'

    const head = document.createElement('div')
    head.className = 'node__head'

    // Assemblies are what downstream work points at, so they carry a mark and
    // the blocks between them stay quieter.
    if (node.role === 'assembly') {
      const mark = icon(ICONS.assembly)
      mark.setAttribute('class', 'node__role')
      const label = document.createElementNS(SVG_NS, 'title')
      label.textContent = node.roleLabel
      mark.appendChild(label)
      head.appendChild(mark)
    }

    const name = document.createElement('span')
    name.className = 'node__name'
    name.textContent = node.name
    name.title = node.roleLabel ? `${node.path}\n${node.roleLabel}` : node.path
    head.appendChild(name)

    if (isRoot) {
      const pill = document.createElement('span')
      pill.className = 'node__pill'
      pill.textContent = 'root'
      head.appendChild(pill)
    }

    // The extension is a fact about the file, not about the arc that reached
    // it, so it is deliberately not tinted with the arc colour.
    const chip = document.createElement('span')
    chip.className = 'node__chip'
    chip.textContent = node.ext || node.kind
    head.appendChild(chip)

    const flags = document.createElement('div')
    flags.className = 'node__flags'
    if (missing) flags.appendChild(flagIcon('missing', 'File not found on disk'))
    if (node.template) flags.appendChild(flagIcon('template', 'Placeholder path'))
    if (node.binary && !missing) flags.appendChild(flagIcon('binary', 'Binary layer'))
    if (flags.childElementCount) head.appendChild(flags)

    body.appendChild(head)

    const sub = document.createElement('div')
    sub.className = 'node__sub'
    const dir = document.createElement('span')
    dir.className = 'node__dir'
    dir.textContent =
      node.relDir === '.' ? './' : truncateStart(node.relDir, 30)
    dir.title = node.dir
    sub.appendChild(dir)

    const size = document.createElement('span')
    size.className = 'node__size'
    size.textContent = node.exists ? formatBytes(node.size) : missing ? 'missing' : '—'
    sub.appendChild(size)
    body.appendChild(sub)

    card.appendChild(body)

    const fanIn = (this.adjacency.in.get(node.id) ?? []).length
    if (fanIn > 1) {
      const fan = document.createElement('div')
      fan.className = 'node__fan'
      fan.textContent = `${fanIn}×`
      fan.title = `Pulled in by ${fanIn} layers`
      card.appendChild(fan)
    }

    this.bindNode(card, node.id)
    return card
  }

  // -- emphasis -----------------------------------------------------------

  /** Ids to keep bright; everything else dims. Empty set clears the filter. */
  setHighlight(ids: Set<string>): void {
    this.highlighted = ids
    this.applyEmphasis()
  }

  select(id: string | null): void {
    this.selected = id
    this.applyEmphasis()
  }

  private applyEmphasis(): void {
    const focus = this.hovered ?? this.selected
    const connected = focus ? this.connectedTo(focus) : null
    const filtering = this.highlighted.size > 0

    for (const [id, element] of this.nodeEls) {
      const inFilter = !filtering || this.highlighted.has(id)
      const inFocus = !connected || connected.has(id)
      element.classList.toggle('is-dim', !(inFilter && inFocus))
      element.classList.toggle('is-lit', Boolean(connected?.has(id)) && id !== focus)
      element.classList.toggle('is-selected', id === this.selected)
    }

    for (const { path, from, to } of this.edgeEls) {
      const inFocus = !connected || (connected.has(from) && connected.has(to))
      const inFilter = !filtering || (this.highlighted.has(from) && this.highlighted.has(to))
      path.classList.toggle('is-dim', !(inFocus && inFilter))
      path.classList.toggle('is-lit', Boolean(connected) && inFocus)
    }
  }

  /** Everything upstream and downstream of a node, inclusive. */
  private connectedTo(id: string): Set<string> {
    const found = new Set<string>([id])
    const walk = (start: string, map: Map<string, string[]>): void => {
      const queue = [start]
      while (queue.length) {
        const current = queue.shift()!
        for (const next of map.get(current) ?? []) {
          if (found.has(next)) continue
          found.add(next)
          queue.push(next)
        }
      }
    }
    walk(id, this.adjacency.out)
    walk(id, this.adjacency.in)
    return found
  }

  // -- interaction --------------------------------------------------------

  private bindNode(card: HTMLElement, id: string): void {
    card.addEventListener('pointerenter', () => {
      this.hovered = id
      this.applyEmphasis()
    })
    card.addEventListener('pointerleave', () => {
      if (this.hovered === id) {
        this.hovered = null
        this.applyEmphasis()
      }
    })
    card.addEventListener('dblclick', (event) => {
      event.stopPropagation()
      this.callbacks.onSetRoot(id)
    })

    card.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.stopPropagation()

      if (!this.layout.nodes.has(id)) return

      // Dragging a layer carries everything hanging off it, so a subtree keeps
      // its shape and stays legible. Hold Alt to move the one card instead.
      const moving = event.altKey ? [id] : this.subtreeOf(id)
      const movingSet = new Set(moving)
      const origins = moving.flatMap((other) => {
        const placed = this.layout.nodes.get(other)
        return placed ? [{ id: other, x: placed.x, y: placed.y }] : []
      })

      const startX = event.clientX
      const startY = event.clientY
      let dragging = false

      const move = (moveEvent: PointerEvent): void => {
        const dx = (moveEvent.clientX - startX) / this.scale
        const dy = (moveEvent.clientY - startY) / this.scale
        if (!dragging && Math.hypot(dx, dy) * this.scale < 4) return
        if (!dragging) {
          dragging = true
          card.classList.add('is-dragging')
          for (const other of moving) {
            if (other !== id) this.nodeEls.get(other)?.classList.add('is-following')
          }
          // Capture keeps the drag alive if the cursor outruns the card, but
          // it must never be what stops the drag from happening.
          try {
            card.setPointerCapture(moveEvent.pointerId)
          } catch {
            /* pointer already gone, or not capturable */
          }
        }

        for (const origin of origins) {
          const placed = this.layout.nodes.get(origin.id)
          const element = this.nodeEls.get(origin.id)
          if (!placed || !element) continue
          placed.x = origin.x + dx
          placed.y = origin.y + dy
          element.style.transform = `translate(${placed.x}px, ${placed.y}px)`
        }
        this.reroute(movingSet)
      }

      const up = (upEvent: PointerEvent): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        card.classList.remove('is-dragging')
        for (const other of moving) {
          this.nodeEls.get(other)?.classList.remove('is-following')
        }
        if (!dragging) {
          this.selected = this.selected === id ? null : id
          this.callbacks.onSelect(this.selected)
          this.applyEmphasis()
        } else {
          try {
            if (card.hasPointerCapture(upEvent.pointerId)) {
              card.releasePointerCapture(upEvent.pointerId)
            }
          } catch {
            /* nothing to release */
          }
        }
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })
  }

  /** A node plus everything hanging off it in the tree. */
  private subtreeOf(id: string): string[] {
    const found: string[] = []
    const seen = new Set<string>()
    const queue = [id]
    while (queue.length) {
      const current = queue.shift()!
      if (seen.has(current)) continue
      seen.add(current)
      found.push(current)
      for (const child of this.treeChildren.get(current) ?? []) queue.push(child)
    }
    return found
  }

  /** Recompute the paths of every edge touching a node that just moved. */
  private reroute(moved: Set<string>): void {
    for (let i = 0; i < this.layout.edges.length; i++) {
      const routed = this.layout.edges[i]!
      if (!moved.has(routed.edge.from) && !moved.has(routed.edge.to)) continue
      const a = this.layout.nodes.get(routed.edge.from)
      const b = this.layout.nodes.get(routed.edge.to)
      if (!a || !b) continue
      routed.d = pipePath(a, b, routed.bus)
      this.edgeEls[i]?.path.setAttribute('d', routed.d)
    }
  }

  private bindStage(): void {
    this.stage.addEventListener('pointerdown', (event) => {
      if (event.button !== 0 && event.button !== 1) return
      const startX = event.clientX
      const startY = event.clientY
      const originX = this.tx
      const originY = this.ty
      let moved = false

      this.stage.classList.add('is-panning')

      const move = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        if (!moved && Math.hypot(dx, dy) < 3) return
        moved = true
        this.tx = originX + dx
        this.ty = originY + dy
        this.applyTransform()
      }

      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        this.stage.classList.remove('is-panning')
        if (!moved) {
          this.selected = null
          this.callbacks.onSelect(null)
          this.applyEmphasis()
        }
      }

      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', up)
    })

    this.stage.addEventListener(
      'wheel',
      (event) => {
        event.preventDefault()
        const rect = this.stage.getBoundingClientRect()
        const px = event.clientX - rect.left
        const py = event.clientY - rect.top

        if (event.ctrlKey || !event.shiftKey) {
          const factor = Math.exp(-event.deltaY * 0.0016)
          this.zoomAt(px, py, this.scale * factor)
        } else {
          this.tx -= event.deltaX
          this.ty -= event.deltaY
          this.applyTransform()
        }
      },
      { passive: false },
    )
  }

  // -- camera -------------------------------------------------------------

  zoomAt(px: number, py: number, target: number): void {
    const next = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, target))
    const ratio = next / this.scale
    this.tx = px - (px - this.tx) * ratio
    this.ty = py - (py - this.ty) * ratio
    this.scale = next
    this.applyTransform()
  }

  zoomBy(factor: number): void {
    const rect = this.stage.getBoundingClientRect()
    this.zoomAt(rect.width / 2, rect.height / 2, this.scale * factor)
  }

  resetZoom(): void {
    const rect = this.stage.getBoundingClientRect()
    this.zoomAt(rect.width / 2, rect.height / 2, 1)
  }

  /** Frame the whole graph with a comfortable margin. */
  fit(animate = true): void {
    if (!this.layout.nodes.size) return
    const rect = this.stage.getBoundingClientRect()
    const pad = 64
    const scale = Math.min(
      (rect.width - pad * 2) / Math.max(this.layout.width, 1),
      (rect.height - pad * 2) / Math.max(this.layout.height, 1),
      1.15,
    )
    this.scale = Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
    this.tx = (rect.width - this.layout.width * this.scale) / 2
    this.ty = (rect.height - this.layout.height * this.scale) / 2

    if (animate) {
      this.viewport.style.transition = 'transform 0.36s cubic-bezier(0.16, 1, 0.3, 1)'
      window.setTimeout(() => {
        this.viewport.style.transition = ''
      }, 400)
    }
    this.applyTransform()
  }

  /** Centre the view on one node without changing zoom. */
  focusNode(id: string): void {
    const placed = this.layout.nodes.get(id)
    if (!placed) return
    const rect = this.stage.getBoundingClientRect()
    this.tx = rect.width / 2 - (placed.x + NODE_W / 2) * this.scale
    this.ty = rect.height / 2 - (placed.y + NODE_H / 2) * this.scale
    this.viewport.style.transition = 'transform 0.32s cubic-bezier(0.16, 1, 0.3, 1)'
    window.setTimeout(() => {
      this.viewport.style.transition = ''
    }, 360)
    this.applyTransform()
  }

  private applyTransform(): void {
    this.viewport.style.transform = `translate(${this.tx}px, ${this.ty}px) scale(${this.scale})`
    const size = 26 * this.scale
    this.grid.style.backgroundSize = `${size}px ${size}px`
    this.grid.style.backgroundPosition = `${this.tx}px ${this.ty}px`
    this.callbacks.onZoom(this.scale)
  }

  get zoom(): number {
    return this.scale
  }
}

function flagIcon(name: keyof typeof ICONS, title: string): SVGSVGElement {
  const svg = icon(ICONS[name])
  svg.setAttribute('class', `node__flag node__flag--${name}`)
  const label = document.createElementNS(SVG_NS, 'title')
  label.textContent = title
  svg.appendChild(label)
  return svg
}

function buildAdjacency(graph: Graph, visible: Set<string>): Adjacency {
  const out = new Map<string, string[]>()
  const incoming = new Map<string, string[]>()
  for (const edge of graph.edges) {
    if (!visible.has(edge.from) || !visible.has(edge.to)) continue
    const forward = out.get(edge.from)
    if (forward) {
      if (!forward.includes(edge.to)) forward.push(edge.to)
    } else {
      out.set(edge.from, [edge.to])
    }
    const back = incoming.get(edge.to)
    if (back) {
      if (!back.includes(edge.from)) back.push(edge.from)
    } else {
      incoming.set(edge.to, [edge.from])
    }
  }
  return { out, in: incoming }
}
