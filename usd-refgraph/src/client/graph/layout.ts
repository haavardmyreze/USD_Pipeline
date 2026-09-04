/**
 * Tree layout with orthogonal ("pipe") edge routing.
 *
 * Files flow left to right. Every file gets one *tree parent* — the layer that
 * first brings it in — and is placed inside that parent's vertical band, so a
 * subtree always occupies a contiguous run of rows and you can see at a glance
 * which files belong to which. A file pulled in by more than one layer is drawn
 * once, with the extra arcs shown as thinner cross links.
 *
 * Edges leave a parent's right edge, run to a shared vertical trunk in the
 * gutter, then turn into each child. Children are grouped onto one trunk per
 * arc kind, so a layer's sublayers share a trunk and its references share
 * another.
 */

import type { ArcKind, Graph, GraphEdge } from '@shared/types'
import { ARC_ORDER } from './theme'

/** Position of an arc kind in the fixed sublayer → reference → … ordering. */
function kindRank(kind: ArcKind): number {
  const index = ARC_ORDER.indexOf(kind)
  return index === -1 ? ARC_ORDER.length : index
}

export const NODE_W = 232
export const NODE_H = 54
export const GAP_X = 128
export const GAP_Y = 16

/** Distance from a parent's right edge to its first trunk. */
const BUS_BASE = 34
/** Spacing between the per-arc-kind trunks of one parent. */
const BUS_LANE = 12
/** Corner rounding on the pipe elbows. */
const CORNER = 9
/** How far a backward link stands off before it turns. */
const CROSS_STANDOFF = 24
/** Extra air after a block of siblings, separating one parent's brood. */
const SUBTREE_GAP = 14

export interface Placed {
  id: string
  x: number
  y: number
  w: number
  h: number
  column: number
}

export interface Routed {
  edge: GraphEdge
  /** SVG path data. */
  d: string
  /** True for the arc that owns the child's position in the tree. */
  tree: boolean
  /** True when the arc points back against the flow. */
  backwards: boolean
  /** Trunk offset from the parent's right edge, kept so drags can re-route. */
  bus: number
}

export interface Layout {
  nodes: Map<string, Placed>
  edges: Routed[]
  width: number
  height: number
}

// ---------------------------------------------------------------------------
// Columns
// ---------------------------------------------------------------------------

/** Column per node, from the longest path to it, so arcs point rightwards. */
function assignColumns(
  ids: string[],
  edges: GraphEdge[],
  rootId: string,
): Map<string, number> {
  const column = new Map<string, number>()
  for (const id of ids) column.set(id, 0)

  // Relax until stable. A cycle would never settle, so cap the passes; any
  // arc still pointing backwards after that is drawn as a cross link.
  for (let pass = 0; pass < Math.max(1, ids.length); pass++) {
    let changed = false
    for (const edge of edges) {
      const from = column.get(edge.from)
      const to = column.get(edge.to)
      if (from === undefined || to === undefined) continue
      if (to < from + 1) {
        column.set(edge.to, from + 1)
        changed = true
      }
    }
    if (!changed) break
  }

  column.set(rootId, 0)
  return column
}

// ---------------------------------------------------------------------------
// Spanning tree
// ---------------------------------------------------------------------------

interface Tree {
  /** Tree children of each node, in the order their arcs were authored. */
  children: Map<string, string[]>
  /** The arc that placed each node in the tree. */
  parentEdge: Map<string, GraphEdge>
  /** Ids of the arcs that form the tree. */
  treeEdges: Set<string>
}

/**
 * Choose one parent per file. Preferring a parent exactly one column to the
 * left keeps every tree edge spanning a single column, which is what makes the
 * pipes read as a tree rather than as a tangle.
 */
function buildTree(
  ids: string[],
  edges: GraphEdge[],
  rootId: string,
  columns: Map<string, number>,
): Tree {
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
    if (id === rootId) continue
    const candidates = incoming.get(id)
    if (!candidates?.length) continue

    const column = columns.get(id) ?? 0
    const chosen =
      candidates.find((e) => (columns.get(e.from) ?? 0) === column - 1) ??
      candidates[0]!

    parentEdge.set(id, chosen)
    treeEdges.add(chosen.id)
    children.get(chosen.from)?.push(id)
  }

  // Keep same-kind siblings together: a layer's sublayers sit above its
  // references, which sit above its payloads, and so on. Beyond reading better,
  // it means each kind's trunk spans one unbroken band, so the trunks stop
  // crossing each other's branches.
  for (const list of children.values()) {
    list.sort(
      (a, b) =>
        kindRank(parentEdge.get(a)!.kind) - kindRank(parentEdge.get(b)!.kind),
    )
  }

  return { children, parentEdge, treeEdges }
}

// ---------------------------------------------------------------------------
// Rows
// ---------------------------------------------------------------------------

/**
 * Tidy-tree row assignment: leaves take the next free row, and a parent centres
 * itself on the block its children occupy.
 */
function assignRows(
  tree: Tree,
  rootId: string,
  ids: string[],
): { rows: Map<string, number>; height: number } {
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
    // Leave a little air after a group of siblings so one parent's block
    // reads as separate from the next.
    if (kids.length > 1) cursor += SUBTREE_GAP

    const y = (Math.min(...positions) + Math.max(...positions)) / 2
    rows.set(id, y)
    return y
  }

  place(rootId, new Set())
  // Anything the root cannot reach still deserves a row.
  for (const id of ids) place(id, new Set())

  return { rows, height: Math.max(0, cursor - GAP_Y) }
}

// ---------------------------------------------------------------------------
// Public entry point
// ---------------------------------------------------------------------------

export function layoutGraph(graph: Graph, visible: Set<string>): Layout {
  const ids = graph.nodes.filter((n) => visible.has(n.id)).map((n) => n.id)
  const edges = graph.edges.filter((e) => visible.has(e.from) && visible.has(e.to))

  if (!ids.length) return { nodes: new Map(), edges: [], width: 0, height: 0 }

  const rootId = visible.has(graph.rootId) ? graph.rootId : ids[0]!
  const columns = assignColumns(ids, edges, rootId)
  const tree = buildTree(ids, edges, rootId, columns)
  const { rows, height } = assignRows(tree, rootId, ids)

  const placed = new Map<string, Placed>()
  for (const id of ids) {
    const column = columns.get(id) ?? 0
    placed.set(id, {
      id,
      x: column * (NODE_W + GAP_X),
      y: rows.get(id) ?? 0,
      w: NODE_W,
      h: NODE_H,
      column,
    })
  }

  const maxColumn = Math.max(...[...placed.values()].map((p) => p.column))

  return {
    nodes: placed,
    edges: routeEdges(edges, placed, tree),
    width: (maxColumn + 1) * (NODE_W + GAP_X) - GAP_X,
    height,
  }
}

// ---------------------------------------------------------------------------
// Routing
// ---------------------------------------------------------------------------

/**
 * Give every arc a trunk offset. Arcs of one kind leaving one parent share a
 * trunk; different kinds get their own lane so the colours stay traceable.
 */
function assignBusLanes(edges: GraphEdge[], tree: Tree): Map<string, number> {
  const lanes = new Map<string, number>()
  const byParent = new Map<string, GraphEdge[]>()
  for (const edge of edges) {
    const list = byParent.get(edge.from)
    if (list) list.push(edge)
    else byParent.set(edge.from, [edge])
  }

  const laneKey = (edge: GraphEdge): string =>
    `${tree.treeEdges.has(edge.id) ? '0' : '1'}:${edge.kind}`

  for (const [, group] of byParent) {
    // Lanes run left to right in the same order the children are stacked, so a
    // trunk never has to reach across another one. Cross links sit outermost.
    const keys = [...new Set(group.map(laneKey))].sort((a, b) => {
      const [aTree, aKind] = a.split(':') as [string, ArcKind]
      const [bTree, bKind] = b.split(':') as [string, ArcKind]
      return aTree === bTree ? kindRank(aKind) - kindRank(bKind) : Number(aTree) - Number(bTree)
    })

    const index = new Map(keys.map((key, i) => [key, i]))
    for (const edge of group) {
      lanes.set(edge.id, BUS_BASE + (index.get(laneKey(edge)) ?? 0) * BUS_LANE)
    }
  }

  return lanes
}

function routeEdges(
  edges: GraphEdge[],
  placed: Map<string, Placed>,
  tree: Tree,
): Routed[] {
  const lanes = assignBusLanes(edges, tree)
  const routed: Routed[] = []

  for (const edge of edges) {
    const a = placed.get(edge.from)
    const b = placed.get(edge.to)
    if (!a || !b) continue

    const bus = lanes.get(edge.id) ?? BUS_BASE
    const backwards = b.x <= a.x
    routed.push({
      edge,
      d: pipePath(a, b, bus),
      tree: tree.treeEdges.has(edge.id),
      backwards,
      bus,
    })
  }

  return routed
}

/**
 * The orthogonal path from one card to another: out of the right edge, along to
 * the trunk, up or down, then into the left edge. Backward links stand off and
 * travel over the top instead.
 */
export function pipePath(a: Placed, b: Placed, bus: number): string {
  const x1 = a.x + a.w
  const y1 = a.y + a.h / 2
  const x2 = b.x
  const y2 = b.y + b.h / 2

  if (b.x > a.x) {
    if (Math.abs(y1 - y2) < 0.5) return `M ${round(x1)} ${round(y1)} L ${round(x2)} ${round(y2)}`
    const busX = Math.min(x1 + bus, x2 - 12)
    return roundedPath(
      [
        { x: x1, y: y1 },
        { x: busX, y: y1 },
        { x: busX, y: y2 },
        { x: x2, y: y2 },
      ],
      CORNER,
    )
  }

  // Backward or same-column: leave to the right, run over the top, come back.
  const laneY = Math.min(a.y, b.y) - 38
  return roundedPath(
    [
      { x: x1, y: y1 },
      { x: x1 + CROSS_STANDOFF, y: y1 },
      { x: x1 + CROSS_STANDOFF, y: laneY },
      { x: x2 - CROSS_STANDOFF, y: laneY },
      { x: x2 - CROSS_STANDOFF, y: y2 },
      { x: x2, y: y2 },
    ],
    CORNER,
  )
}

interface Point {
  x: number
  y: number
}

/** A polyline with rounded corners, as SVG path data. */
function roundedPath(points: Point[], radius: number): string {
  const pts = points.filter(
    (p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 0.5,
  )
  if (pts.length < 2) return ''

  let d = `M ${round(pts[0]!.x)} ${round(pts[0]!.y)}`
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const here = pts[i]!
    const next = pts[i + 1]!

    const inLen = Math.hypot(here.x - prev.x, here.y - prev.y) || 1
    const outLen = Math.hypot(next.x - here.x, next.y - here.y) || 1
    const r = Math.min(radius, inLen / 2, outLen / 2)

    const ix = here.x - ((here.x - prev.x) / inLen) * r
    const iy = here.y - ((here.y - prev.y) / inLen) * r
    const ox = here.x + ((next.x - here.x) / outLen) * r
    const oy = here.y + ((next.y - here.y) / outLen) * r

    d += ` L ${round(ix)} ${round(iy)} Q ${round(here.x)} ${round(here.y)} ${round(ox)} ${round(oy)}`
  }
  const last = pts[pts.length - 1]!
  return `${d} L ${round(last.x)} ${round(last.y)}`
}

function round(value: number): number {
  return Math.round(value * 10) / 10
}
