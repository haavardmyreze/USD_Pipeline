/**
 * Renders the graph and owns every interaction inside the stage:
 * pan, zoom, hover highlighting, selection and node dragging.
 *
 * Nodes are DOM elements and edges are SVG paths, both inside one transformed
 * viewport. That keeps the cards fully styleable in CSS while the edges stay
 * crisp at any zoom.
 */

import type { Graph, GraphNode } from '@shared/types'
import { readRecord } from '@shared/pipeline'
import { statusDot } from '../ui/kit'
import { icon } from '../util'
import { MISSING_COLOR, ROOT_COLOR, TIER_TINT } from './theme'
import { ICONS } from '../ui/icons'
import { Camera, VelocityTracker, type CameraState } from './camera'
import {
  layoutGraph,
  pipePath,
  NODE_H,
  NODE_W,
  type Layout,
  type Placed,
} from './layout'

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

  /** Where the view is. Always the live, on-screen value — see camera.ts. */
  private readonly camera: Camera
  /**
   * How much of the stage's right edge the floating inspector covers, so
   * framing and centring aim at the part you can actually see.
   */
  private insetRight = 0

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
    this.camera = new Camera((state) => this.applyTransform(state))
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
      path.dataset.from = routed.edge.from
      path.dataset.to = routed.edge.to
      this.edgeLayer.appendChild(path)
      this.edgeEls.push({ path, from: routed.edge.from, to: routed.edge.to })
    }

    for (const [id, placed] of this.layout.nodes) {
      const node = graph.nodes.find((n) => n.id === id)
      if (!node) continue
      const element = this.buildNode(node, placed, graph.rootId)
      this.nodeLayer.appendChild(element)
      this.nodeEls.set(id, element)
    }

    this.applyEmphasis()
  }

  private buildNode(node: GraphNode, placed: Placed, rootId: string): HTMLElement {
    const isRoot = node.id === rootId
    const missing = !node.exists && !node.template

    const card = document.createElement('div')
    card.className = 'node'
    if (isRoot) card.classList.add('node--root')
    if (missing) card.classList.add('node--missing')
    if (node.role === 'assembly') card.classList.add('node--assembly')
    else if (node.role === 'block') card.classList.add('node--block')
    // A faint wash of the tier's colour: asset, set or shot.
    if (node.tier) card.classList.add(`node--tier-${node.tier}`)
    card.dataset.id = node.id
    card.style.transform = `translate(${placed.x}px, ${placed.y}px)`
    // What the card is highlighted with when selected or lit: its own tier,
    // so the emphasis never implies an arc kind.
    card.style.setProperty(
      '--accent',
      isRoot
        ? ROOT_COLOR
        : missing
          ? MISSING_COLOR
          : TIER_TINT[node.tier ?? ''] ?? 'var(--fg-3)',
    )

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

    const flags = document.createElement('div')
    flags.className = 'node__flags'
    if (missing) flags.appendChild(flagIcon('missing', 'File not found on disk'))
    if (node.template) flags.appendChild(flagIcon('template', 'Placeholder path'))
    if (flags.childElementCount) head.appendChild(flags)

    body.appendChild(head)

    // The publisher's own record, read the same way the project pages read it,
    // so a layer's state reads identically wherever you meet it. The path,
    // size and format live in the detail panel; the card carries only what you
    // need to tell one node from another at a glance.
    const record = readRecord(node.meta?.customLayerData)
    if (record.status !== 'unknown' || record.artist) {
      const sub = document.createElement('div')
      sub.className = 'node__sub'
      if (record.status !== 'unknown') sub.appendChild(statusDot(record.status))
      if (record.artist) {
        const badge = document.createElement('span')
        badge.className = 'node__artist'
        badge.textContent = record.artist
        badge.title = `Published by ${record.artist}`
        sub.appendChild(badge)
      }
      body.appendChild(sub)
    }

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
      // A mouse is precise, a finger is not: commit to a drag sooner for one.
      const slop = event.pointerType === 'touch' ? 10 : 4
      let dragging = false

      // Feedback on the press itself, not on release.
      card.classList.add('is-pressed')

      const move = (moveEvent: PointerEvent): void => {
        const scale = this.camera.scale
        const dx = (moveEvent.clientX - startX) / scale
        const dy = (moveEvent.clientY - startY) / scale
        if (!dragging && Math.hypot(dx, dy) * scale < slop) return
        if (!dragging) {
          dragging = true
          card.classList.remove('is-pressed')
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
        card.classList.remove('is-pressed', 'is-dragging')
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

      // Grab it mid-flight: stop wherever it is on screen and pan from there.
      this.camera.halt()
      const startX = event.clientX
      const startY = event.clientY
      const originX = this.camera.x
      const originY = this.camera.y
      const slop = event.pointerType === 'touch' ? 10 : 3
      const tracker = new VelocityTracker()
      tracker.add(startX, startY)
      let moved = false

      this.stage.classList.add('is-panning')

      const move = (moveEvent: PointerEvent): void => {
        const dx = moveEvent.clientX - startX
        const dy = moveEvent.clientY - startY
        tracker.add(moveEvent.clientX, moveEvent.clientY)
        if (!moved && Math.hypot(dx, dy) < slop) return
        moved = true
        // 1:1 with the pointer, keeping the offset from where it grabbed.
        this.camera.set({ x: originX + dx, y: originY + dy })
      }

      const up = (): void => {
        window.removeEventListener('pointermove', move)
        window.removeEventListener('pointerup', up)
        this.stage.classList.remove('is-panning')
        if (moved) {
          const velocity = tracker.velocity()
          this.camera.glide(velocity.x, velocity.y, (landing) => this.keepOnStage(landing))
        } else {
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
          this.zoomAt(px, py, this.camera.scale * factor)
        } else {
          this.camera.set({
            x: this.camera.x - event.deltaX,
            y: this.camera.y - event.deltaY,
          })
        }
      },
      { passive: false },
    )
  }

  // -- camera -------------------------------------------------------------

  /** Tell the view how much of its right edge the inspector is covering. */
  setInset(right: number): void {
    this.insetRight = right
  }

  /** Zoom about a point, instantly: the wheel tracks the hand 1:1. */
  zoomAt(px: number, py: number, target: number): void {
    this.camera.set(this.zoomedAbout(px, py, target))
  }

  /** Zoom about the centre of what you can see, springing there. */
  zoomBy(factor: number): void {
    const { cx, cy } = this.visibleCentre()
    this.camera.animateTo(this.zoomedAbout(cx, cy, this.camera.scale * factor), {
      response: 0.3,
    })
  }

  resetZoom(): void {
    const { cx, cy } = this.visibleCentre()
    this.camera.animateTo(this.zoomedAbout(cx, cy, 1), { response: 0.3 })
  }

  /** Frame the whole graph in the visible part of the stage. */
  fit(animate = true): void {
    if (!this.layout.nodes.size) return
    const rect = this.stage.getBoundingClientRect()
    const width = Math.max(rect.width - this.insetRight, 1)
    const pad = 64
    const scale = clampZoom(
      Math.min(
        (width - pad * 2) / Math.max(this.layout.width, 1),
        (rect.height - pad * 2) / Math.max(this.layout.height, 1),
        1.15,
      ),
    )
    const state: CameraState = {
      scale,
      x: (width - this.layout.width * scale) / 2,
      y: (rect.height - this.layout.height * scale) / 2,
    }
    if (animate) this.camera.animateTo(state)
    else this.camera.set(state)
  }

  /** Centre the view on one node without changing zoom. */
  focusNode(id: string): void {
    const placed = this.layout.nodes.get(id)
    if (!placed) return
    const { cx, cy } = this.visibleCentre()
    const scale = this.camera.scale
    this.camera.animateTo({
      scale,
      x: cx - (placed.x + NODE_W / 2) * scale,
      y: cy - (placed.y + NODE_H / 2) * scale,
    })
  }

  /**
   * Where a thrown pan may come to rest: anywhere that leaves a strip of the
   * graph on screen. A hard stop at the edge would read as frozen; instead the
   * throw eases to a halt against the limit, so the graph cannot be flung out
   * of sight and lost.
   */
  private keepOnStage(landing: CameraState): CameraState {
    const rect = this.stage.getBoundingClientRect()
    const width = rect.width - this.insetRight
    const keep = 96
    const graphWidth = this.layout.width * landing.scale
    const graphHeight = this.layout.height * landing.scale
    return {
      scale: landing.scale,
      x: Math.min(width - keep, Math.max(keep - graphWidth, landing.x)),
      y: Math.min(rect.height - keep, Math.max(keep - graphHeight, landing.y)),
    }
  }

  /** The camera that keeps the point (px, py) still while zooming. */
  private zoomedAbout(px: number, py: number, target: number): CameraState {
    const scale = clampZoom(target)
    const ratio = scale / this.camera.scale
    return {
      scale,
      x: px - (px - this.camera.x) * ratio,
      y: py - (py - this.camera.y) * ratio,
    }
  }

  private visibleCentre(): { cx: number; cy: number } {
    const rect = this.stage.getBoundingClientRect()
    return { cx: (rect.width - this.insetRight) / 2, cy: rect.height / 2 }
  }

  private applyTransform(state: CameraState): void {
    this.viewport.style.transform = `translate(${state.x}px, ${state.y}px) scale(${state.scale})`
    const size = 26 * state.scale
    this.grid.style.backgroundSize = `${size}px ${size}px`
    this.grid.style.backgroundPosition = `${state.x}px ${state.y}px`
    this.callbacks.onZoom(state.scale)
  }

  get zoom(): number {
    return this.camera.scale
  }
}

function clampZoom(scale: number): number {
  return Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, scale))
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
