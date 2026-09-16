/**
 * Flowchart layout, ported from usd-refgraph's `graph/layout.ts`.
 *
 * Nodes flow left to right. Each gets one tree parent — the first arc that
 * reaches it from the column before — and sits inside that parent's band, so
 * a subtree occupies a contiguous run of rows. A node reached more than once
 * is drawn once, and the extra arcs are fainter cross links.
 *
 * Arcs leave a parent's right edge, run to a trunk in the gutter and turn into
 * each child; a parent's arcs of one kind share a trunk. Unlike the original,
 * this returns corner points rather than SVG, a chart may have several start
 * nodes, and the card width is chosen by the caller.
 */

import { ARC_ORDER, type ArcKind, type GraphEdge, type GraphNode } from './parse'

export const NODE_H = 46
export const GAP_X = 128
export const GAP_Y = 16
const BUS_BASE = 34
const BUS_LANE = 12
const CROSS_STANDOFF = 24
const CROSS_LIFT = 38
const SUBTREE_GAP = 14

export interface Placed {
  id: string
  x: number
  y: number
  w: number
  h: number
  column: number
}

export interface Point {
  x: number
  y: number
}

export interface Routed {
  edge: GraphEdge
  points: Point[]
  /** The arc that owns the child's place in the tree. */
  tree: boolean
}

export interface GraphLayout {
  nodes: Map<string, Placed>
  edges: Routed[]
  /** Bounds of everything drawn, which backward arcs can push above zero. */
  minX: number
  minY: number
  maxX: number
  maxY: number
}

function kindRank(kind: ArcKind): number {
  return ARC_ORDER.indexOf(kind)
}

export function layoutGraph(nodes: GraphNode[], edges: GraphEdge[], nodeWidth: number): GraphLayout {
  const ids = nodes.map((n) => n.id)
  if (!ids.length) return { nodes: new Map(), edges: [], minX: 0, minY: 0, maxX: 0, maxY: 0 }

  // Start nodes: marked roots first, then anything nothing points at, in the
  // order they were written. A chart that is one big cycle starts at its first.
  const incoming = new Set(edges.map((e) => e.to))
  const starts = [
    ...nodes.filter((n) => n.root),
    ...nodes.filter((n) => !n.root && !incoming.has(n.id)),
  ].map((n) => n.id)
  if (!starts.length) starts.push(ids[0]!)

  const columns = assignColumns(ids, edges, new Set(starts.filter((id) => nodes.find((n) => n.id === id)?.root)))
  const tree = buildTree(ids, edges, new Set(starts), columns)
  const rows = assignRows(tree, starts, ids)

  const placed = new Map<string, Placed>()
  for (const id of ids) {
    const column = columns.get(id) ?? 0
    placed.set(id, { id, x: column * (nodeWidth + GAP_X), y: rows.get(id) ?? 0, w: nodeWidth, h: NODE_H, column })
  }

  const routed = routeEdges(edges, placed, tree)
  let minX = 0
  let minY = 0
  let maxX = 0
  let maxY = 0
  for (const p of placed.values()) {
    maxX = Math.max(maxX, p.x + p.w)
    maxY = Math.max(maxY, p.y + p.h)
  }
  for (const r of routed) {
    for (const point of r.points) {
      minX = Math.min(minX, point.x)
      minY = Math.min(minY, point.y)
      maxX = Math.max(maxX, point.x)
      maxY = Math.max(maxY, point.y)
    }
  }
  return { nodes: placed, edges: routed, minX, minY, maxX, maxY }
}

/** Column per node, from the longest path to it, so arcs point rightwards. */
function assignColumns(ids: string[], edges: GraphEdge[], pinned: Set<string>): Map<string, number> {
  const column = new Map<string, number>()
  for (const id of ids) column.set(id, 0)
  // A cycle never settles, so the passes are capped; whatever still points
  // backwards afterwards is drawn as a cross link.
  for (let pass = 0; pass < Math.max(1, ids.length); pass++) {
    let changed = false
    for (const edge of edges) {
      if (pinned.has(edge.to)) continue
      const from = column.get(edge.from)!
      const to = column.get(edge.to)!
      if (to < from + 1) {
        column.set(edge.to, from + 1)
        changed = true
      }
    }
    if (!changed) break
  }
  return column
}

interface Tree {
  children: Map<string, string[]>
  parentEdge: Map<string, GraphEdge>
  treeEdges: Set<string>
}

function buildTree(ids: string[], edges: GraphEdge[], starts: Set<string>, columns: Map<string, number>): Tree {
  const incoming = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const list = incoming.get(edge.to)
    if (list) list.push(edge)
    else incoming.set(edge.to, [edge])
  }

  const parentEdge = new Map<string, GraphEdge>()
  const treeEdges = new Set<string>()
  const children = new Map<string, string[]>()
  for (const id of ids) children.set(id, [])

  for (const id of ids) {
    if (starts.has(id)) continue
    const candidates = incoming.get(id)?.filter((e) => e.from !== id)
    if (!candidates?.length) continue
    const column = columns.get(id) ?? 0
    const chosen = candidates.find((e) => (columns.get(e.from) ?? 0) === column - 1) ?? candidates[0]!
    parentEdge.set(id, chosen)
    treeEdges.add(chosen.id)
    children.get(chosen.from)!.push(id)
  }

  // Same-kind siblings together, so each kind's trunk spans one band, and
  // within a kind in the order the arcs were written: for sublayers that is
  // the strength order, which a chart of them should show top to bottom.
  const order = new Map(edges.map((edge, index) => [edge.id, index]))
  const rank = (id: string): [number, number] => {
    const edge = parentEdge.get(id)!
    return [kindRank(edge.kind), order.get(edge.id)!]
  }
  for (const list of children.values()) {
    list.sort((a, b) => {
      const [ak, ai] = rank(a)
      const [bk, bi] = rank(b)
      return ak - bk || ai - bi
    })
  }
  return { children, parentEdge, treeEdges }
}

/** Tidy rows: leaves take the next free row, parents centre on their children. */
function assignRows(tree: Tree, starts: string[], ids: string[]): Map<string, number> {
  const rows = new Map<string, number>()
  let cursor = 0

  const place = (id: string, guard: Set<string>): number => {
    if (rows.has(id)) return rows.get(id)!
    if (guard.has(id)) return cursor
    guard.add(id)
    const kids = tree.children.get(id) ?? []
    if (!kids.length) {
      const y = cursor
      cursor += NODE_H + GAP_Y
      rows.set(id, y)
      return y
    }
    const positions = kids.map((kid) => place(kid, guard))
    if (kids.length > 1) cursor += SUBTREE_GAP
    const y = (Math.min(...positions) + Math.max(...positions)) / 2
    rows.set(id, y)
    return y
  }

  for (const id of starts) place(id, new Set())
  for (const id of ids) place(id, new Set())
  return rows
}

function assignBusLanes(edges: GraphEdge[], tree: Tree): Map<string, number> {
  const lanes = new Map<string, number>()
  const byParent = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const list = byParent.get(edge.from)
    if (list) list.push(edge)
    else byParent.set(edge.from, [edge])
  }
  const laneKey = (edge: GraphEdge): string => `${tree.treeEdges.has(edge.id) ? '0' : '1'}:${edge.kind}`

  for (const group of byParent.values()) {
    const keys = [...new Set(group.map(laneKey))].sort((a, b) => {
      const [aTree, aKind] = a.split(':') as [string, ArcKind]
      const [bTree, bKind] = b.split(':') as [string, ArcKind]
      return aTree === bTree ? kindRank(aKind) - kindRank(bKind) : Number(aTree) - Number(bTree)
    })
    const index = new Map(keys.map((key, i) => [key, i]))
    for (const edge of group) lanes.set(edge.id, BUS_BASE + (index.get(laneKey(edge)) ?? 0) * BUS_LANE)
  }
  return lanes
}

function routeEdges(edges: GraphEdge[], placed: Map<string, Placed>, tree: Tree): Routed[] {
  const lanes = assignBusLanes(edges, tree)
  const routed: Routed[] = []
  for (const edge of edges) {
    const a = placed.get(edge.from)
    const b = placed.get(edge.to)
    if (!a || !b) continue
    routed.push({ edge, points: pipe(a, b, lanes.get(edge.id) ?? BUS_BASE), tree: tree.treeEdges.has(edge.id) })
  }
  return routed
}

/** Out of the right edge, along to the trunk, up or down, into the left edge. */
function pipe(a: Placed, b: Placed, bus: number): Point[] {
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2

  if (b.x > a.x) {
    if (Math.abs(y1 - y2) < 0.5) return [{ x: x1, y: y1 }, { x: x2, y: y2 }]
    const busX = Math.min(x1 + bus, x2 - 12)
    return [
      { x: x1, y: y1 },
      { x: busX, y: y1 },
      { x: busX, y: y2 },
      { x: x2, y: y2 },
    ]
  }

  // Backwards or within a column: stand off, run over the top, come back.
  const laneY = Math.min(a.y, b.y) - CROSS_LIFT
  return [
    { x: x1, y: y1 },
    { x: x1 + CROSS_STANDOFF, y: y1 },
    { x: x1 + CROSS_STANDOFF, y: laneY },
    { x: x2 - CROSS_STANDOFF, y: laneY },
    { x: x2 - CROSS_STANDOFF, y: y2 },
    { x: x2, y: y2 },
  ]
}
