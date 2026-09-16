/**
 * Draws a flowchart in usd-refgraph's graph style: tinted cards, grey wires
 * told apart by their dash pattern, and trunks shared per arc kind.
 *
 * The card and wire rules mirror usd-refgraph's `.node` and `.edge` styles.
 * Where the app is interactive (hover, dim, drag) the picture keeps only what
 * reads on paper; cross links are a little stronger than on screen, since a
 * document cannot hover to reveal them.
 */

import { iconImage, primIcon } from '../icons'
import {
  FAMILY,
  HEADER,
  HEADER_GAP,
  PANEL_PAD,
  baseline,
  frameClip,
  headerWidth,
  paintFrame,
  type Options,
} from '../render'
import { THEMES, type Theme } from '../theme'
import { NODE_H, layoutGraph, type GraphLayout, type Point } from './layout'
import { ARC_LABEL, ARC_ORDER, type ArcKind, type GraphNode, type ParsedGraph } from './parse'

const FONT_NAME = `400 12px ${FAMILY}`
const FONT_NAME_BOLD = `600 12px ${FAMILY}`
const FONT_SUB = `400 10px ${FAMILY}`
const FONT_BADGE = `600 10px ${FAMILY}`
const FONT_LEGEND = `400 11px ${FAMILY}`

const PAD_X = 8
const RADIUS = 9
const CORNER = 9
const MIN_NODE_W = 150
const MAX_NODE_W = 360
const LEGEND_GAP = 24
const LEGEND_H = 16
const SAMPLE_W = 34
const GRID = 18

/** `.edge--<kind>` in usd-refgraph. */
const WIRE: Record<ArcKind, { width: number; dash: number[]; alpha: number }> = {
  sublayer: { width: 2.4, dash: [], alpha: 0.9 },
  reference: { width: 1.6, dash: [11, 5], alpha: 0.8 },
  payload: { width: 1.6, dash: [4, 4], alpha: 0.8 },
  clip: { width: 1.8, dash: [9, 3, 1.5, 3], alpha: 0.8 },
  asset: { width: 1, dash: [1, 3.5], alpha: 0.55 },
  unknown: { width: 1.3, dash: [2, 2], alpha: 0.75 },
}
const CROSS_ALPHA = 0.45

/** usd-refgraph's line icons, in a 16-unit box. */
const LAYERS_ICON = ['M8 1.8 14.2 5 8 8.2 1.8 5z', 'm1.8 8 6.2 3.2L14.2 8', 'm1.8 11 6.2 3.2L14.2 11']
const MISSING_ICON = ['M8 2.6 14.4 13H1.6z', 'M8 6.4v3.1M8 11.3v.1']
const TEMPLATE_ICON = ['M6.2 2.6 4.4 13.4M11.6 2.6 9.8 13.4M2.8 5.8h10.4M2.2 10.2h10.4']

export interface NodeBox {
  node: GraphNode
  x: number
  y: number
  w: number
  h: number
}

export interface GraphDrawing {
  width: number
  height: number
  boxes: NodeBox[]
  count: number
  paint(canvas: HTMLCanvasElement, scale: number): void
}

export function buildGraph(ctx: CanvasRenderingContext2D, graph: ParsedGraph, options: Options): GraphDrawing {
  const theme = THEMES[options.theme]
  const nodeWidth = Math.ceil(
    Math.min(MAX_NODE_W, Math.max(MIN_NODE_W, ...graph.nodes.map((n) => measureNode(ctx, n)))),
  )
  const layout = layoutGraph(graph.nodes, graph.edges, nodeWidth)

  const inset = options.padding + (options.frame === 'panel' ? PANEL_PAD + 4 : 0)
  const top = inset + (options.title ? HEADER + HEADER_GAP : 0)
  // Room for a fan-in badge, which pokes out above a card's corner.
  const badgeRoom = graph.edges.length ? 8 : 0
  const originX = inset - layout.minX
  const originY = top + badgeRoom - layout.minY

  const kinds = ARC_ORDER.filter((kind) => graph.edges.some((e) => e.kind === kind))
  const legend = options.legend && kinds.length ? legendWidth(ctx, kinds) : 0
  const chartW = layout.maxX - layout.minX
  const chartH = graph.nodes.length ? layout.maxY - layout.minY : NODE_H
  const legendY = originY + layout.maxY + LEGEND_GAP

  let content = Math.max(chartW, legend)
  if (options.title) content = Math.max(content, headerWidth(ctx, options, graph.nodes.length))
  content = Math.max(content, options.minWidth - inset * 2)
  const width = Math.ceil(content + inset * 2)
  const height = Math.ceil(top + badgeRoom + chartH + (legend ? LEGEND_GAP + LEGEND_H : 0) + inset)

  const fanIn = new Map<string, number>()
  for (const edge of graph.edges) fanIn.set(edge.to, (fanIn.get(edge.to) ?? 0) + 1)

  const boxes: NodeBox[] = graph.nodes.map((node) => {
    const p = layout.nodes.get(node.id)!
    return { node, x: originX + p.x, y: originY + p.y, w: p.w, h: p.h }
  })

  return {
    width,
    height,
    boxes,
    count: graph.nodes.length,
    paint(canvas, scale) {
      canvas.width = Math.round(width * scale)
      canvas.height = Math.round(height * scale)
      const c = canvas.getContext('2d')!
      c.setTransform(scale, 0, 0, scale, 0, 0)
      c.clearRect(0, 0, width, height)
      c.imageSmoothingQuality = 'high'

      paintFrame(c, theme, options, width, height)
      if (options.grid) paintGrid(c, theme, options, width, height)
      if (options.title) headerWidth(c, options, graph.nodes.length, { theme, x: inset, y: inset })

      if (!graph.nodes.length) {
        c.font = FONT_SUB
        c.fillStyle = theme.fg3
        c.fillText('An empty chart. Write an arc such as  a -> b  on the left.', inset, baseline(c, top + NODE_H / 2))
        return
      }

      paintWires(c, theme, layout, graph, originX, originY)
      for (const box of boxes) paintCard(c, theme, box, fanIn.get(box.node.id) ?? 0)
      if (legend) paintLegend(c, theme, kinds, inset, legendY)
    },
  }
}

// ---------------------------------------------------------------------------
// Measuring
// ---------------------------------------------------------------------------

/** The width a card needs to show its name and second line unclipped. */
function measureNode(ctx: CanvasRenderingContext2D, node: GraphNode): number {
  ctx.font = node.role === 'assembly' ? FONT_NAME_BOLD : FONT_NAME
  let head = ctx.measureText(node.name).width
  if (node.icon) head += 16 + 6
  if (node.role === 'assembly') head += 12 + 6
  const flags = Number(node.missing) + Number(node.template)
  if (flags) head += 6 + flags * 12 + (flags - 1) * 4

  ctx.font = FONT_SUB
  let sub = ctx.measureText(subText(node)).width
  if (node.status) sub += 7 + 6
  return Math.max(head, sub) + PAD_X * 2 + 2
}

function subText(node: GraphNode): string {
  return [node.label, node.artist].filter(Boolean).join('  ·  ')
}

function legendWidth(ctx: CanvasRenderingContext2D, kinds: ArcKind[]): number {
  ctx.font = FONT_LEGEND
  return kinds.reduce((sum, kind, i) => sum + SAMPLE_W + 8 + ctx.measureText(ARC_LABEL[kind]).width + (i ? 20 : 0), 0)
}

// ---------------------------------------------------------------------------
// Painting
// ---------------------------------------------------------------------------

function paintGrid(ctx: CanvasRenderingContext2D, theme: Theme, options: Options, width: number, height: number): void {
  ctx.save()
  frameClip(ctx, options, width, height)
  ctx.fillStyle = theme.grid
  for (let y = GRID / 2; y < height; y += GRID) {
    for (let x = GRID / 2; x < width; x += GRID) {
      ctx.fillRect(x - 0.5, y - 0.5, 1, 1)
    }
  }
  ctx.restore()
}

function paintWires(
  ctx: CanvasRenderingContext2D,
  theme: Theme,
  layout: GraphLayout,
  graph: ParsedGraph,
  ox: number,
  oy: number,
): void {
  const missing = new Set(graph.nodes.filter((n) => n.missing).map((n) => n.id))
  // Cross links first, so the tree's own wires sit on top of them.
  const ordered = [...layout.edges].sort((a, b) => Number(a.tree) - Number(b.tree))
  for (const routed of ordered) {
    const style = WIRE[routed.edge.kind]
    ctx.save()
    ctx.strokeStyle = missing.has(routed.edge.to) ? theme.danger : theme.wire
    ctx.globalAlpha = routed.tree ? style.alpha : CROSS_ALPHA
    ctx.lineWidth = style.width
    ctx.setLineDash(style.dash)
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'
    roundedPolyline(ctx, routed.points.map((p) => ({ x: p.x + ox, y: p.y + oy })), CORNER)
    ctx.stroke()
    ctx.restore()
  }
}

function roundedPolyline(ctx: CanvasRenderingContext2D, points: Point[], radius: number): void {
  const pts = points.filter((p, i) => i === 0 || Math.hypot(p.x - points[i - 1]!.x, p.y - points[i - 1]!.y) > 0.5)
  ctx.beginPath()
  if (pts.length < 2) return
  ctx.moveTo(pts[0]!.x, pts[0]!.y)
  for (let i = 1; i < pts.length - 1; i++) {
    const prev = pts[i - 1]!
    const here = pts[i]!
    const next = pts[i + 1]!
    const r = Math.min(
      radius,
      Math.hypot(here.x - prev.x, here.y - prev.y) / 2,
      Math.hypot(next.x - here.x, next.y - here.y) / 2,
    )
    ctx.arcTo(here.x, here.y, next.x, next.y, r)
  }
  const last = pts[pts.length - 1]!
  ctx.lineTo(last.x, last.y)
}

function paintCard(ctx: CanvasRenderingContext2D, theme: Theme, box: NodeBox, fanIn: number): void {
  const { node, x, y, w, h } = box
  const tint = node.tint ? theme.tints[node.tint]! : ''
  const accent = node.root ? theme.root : node.missing ? theme.danger : tint || theme.fg3

  let fill = tint ? mix(tint, theme.card, 0.11) : theme.card
  let border = tint ? mix(tint, theme.cardLine, 0.26) : theme.cardLine
  if (node.role === 'assembly') border = tint ? mix(tint, theme.fg3, 0.3) : theme.fg3
  if (node.missing) {
    fill = mix(theme.danger, theme.card, 0.09)
    border = withAlpha(theme.danger, 0.55)
  }
  if (node.root) border = theme.root
  if (node.selected) border = accent

  // Card, with usd-refgraph's small shadow.
  ctx.save()
  ctx.shadowColor = theme.cardShadow
  ctx.shadowBlur = 2
  ctx.shadowOffsetY = 1
  ctx.fillStyle = fill
  ctx.beginPath()
  ctx.roundRect(x, y, w, h, RADIUS)
  ctx.fill()
  ctx.restore()

  // Outer ring for the root and the selection.
  if (node.root || node.selected) {
    ctx.strokeStyle = node.selected ? accent : withAlpha(theme.root, 0.45)
    ctx.lineWidth = 1
    ctx.beginPath()
    ctx.roundRect(x - 1.5, y - 1.5, w + 3, h + 3, RADIUS + 1.5)
    ctx.stroke()
  }

  ctx.strokeStyle = border
  ctx.lineWidth = 1
  ctx.setLineDash(node.missing ? [4, 3] : [])
  ctx.beginPath()
  ctx.roundRect(x + 0.5, y + 0.5, w - 1, h - 1, RADIUS - 0.5)
  ctx.stroke()
  ctx.setLineDash([])

  // Head line: icon, layers mark, name, flags.
  const sub = subText(node)
  const hasSub = Boolean(sub || node.status)
  const headMid = hasSub ? y + h / 2 - 7.5 : y + h / 2
  const subMid = y + h / 2 + 8
  let cx = x + PAD_X

  if (node.icon) {
    const img = iconImage(primIcon(node.icon, '', node.icon))
    if (img) ctx.drawImage(img, cx, headMid - 8, 16, 16)
    cx += 16 + 6
  }
  if (node.role === 'assembly') {
    strokeIcon(ctx, LAYERS_ICON, cx, headMid - 6, 12, theme.fg3)
    cx += 12 + 6
  }

  let right = x + w - PAD_X
  const flags: string[][] = []
  if (node.missing) flags.push(MISSING_ICON)
  if (node.template) flags.push(TEMPLATE_ICON)
  flags.forEach((paths, i) => {
    const fx = right - 12
    strokeIcon(ctx, paths, fx, headMid - 6, 12, i === 0 && node.missing ? theme.danger : theme.status.placeholder!)
    right = fx - 4
  })

  ctx.font = node.role === 'assembly' ? FONT_NAME_BOLD : FONT_NAME
  ctx.fillStyle = node.missing
    ? theme.danger
    : node.role === 'assembly'
      ? theme.strong
      : node.role === 'block'
        ? theme.fg2
        : theme.fg
  const name = fit(ctx, node.name, right - cx - (flags.length ? 2 : 0))
  ctx.fillText(name, cx, baseline(ctx, headMid))
  if (node.missing) {
    const nw = ctx.measureText(name).width
    ctx.fillStyle = withAlpha(theme.danger, 0.5)
    ctx.fillRect(cx, Math.round(headMid) - 0.5, nw, 1)
  }

  // Second line: status dot, label, artist.
  if (hasSub) {
    let sx = x + PAD_X
    if (node.status) {
      ctx.fillStyle = theme.status[node.status]!
      ctx.beginPath()
      ctx.arc(sx + 3.5, subMid, 3.5, 0, Math.PI * 2)
      ctx.fill()
      sx += 7 + 6
    }
    if (sub) {
      ctx.font = FONT_SUB
      ctx.fillStyle = theme.fg3
      ctx.fillText(fit(ctx, sub, x + w - PAD_X - sx), sx, baseline(ctx, subMid))
    }
  }

  // How many arcs lead here, when more than one does.
  if (fanIn > 1) {
    const label = `${fanIn}×`
    ctx.font = FONT_BADGE
    const bw = Math.max(20, ctx.measureText(label).width + 10)
    const bx = x + w + 6 - bw
    const by = y - 6
    ctx.fillStyle = theme.badge
    ctx.strokeStyle = theme.cardLine
    ctx.beginPath()
    ctx.roundRect(bx + 0.5, by + 0.5, bw - 1, 17, 9)
    ctx.fill()
    ctx.stroke()
    ctx.fillStyle = theme.fg2
    ctx.textAlign = 'center'
    ctx.fillText(label, bx + bw / 2, baseline(ctx, by + 9))
    ctx.textAlign = 'left'
  }
}

function paintLegend(ctx: CanvasRenderingContext2D, theme: Theme, kinds: ArcKind[], x: number, y: number): void {
  const mid = y + LEGEND_H / 2
  let cx = x
  ctx.font = FONT_LEGEND
  for (const kind of kinds) {
    const style = WIRE[kind]
    ctx.save()
    ctx.strokeStyle = theme.wire
    ctx.globalAlpha = style.alpha
    ctx.lineWidth = style.width
    ctx.setLineDash(style.dash)
    ctx.lineCap = 'round'
    ctx.beginPath()
    ctx.moveTo(cx + 0.5, mid)
    ctx.lineTo(cx + SAMPLE_W - 0.5, mid)
    ctx.stroke()
    ctx.restore()
    cx += SAMPLE_W + 8
    ctx.fillStyle = theme.fg2
    ctx.fillText(ARC_LABEL[kind], cx, baseline(ctx, mid))
    cx += ctx.measureText(ARC_LABEL[kind]).width + 20
  }
}

function strokeIcon(ctx: CanvasRenderingContext2D, paths: string[], x: number, y: number, size: number, color: string): void {
  ctx.save()
  ctx.translate(x, y)
  ctx.scale(size / 16, size / 16)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  for (const d of paths) ctx.stroke(new Path2D(d))
  ctx.restore()
}

/** `text`, cut with an ellipsis to fit `width`. */
function fit(ctx: CanvasRenderingContext2D, text: string, width: number): string {
  if (ctx.measureText(text).width <= width) return text
  let cut = text
  while (cut.length > 1 && ctx.measureText(`${cut}…`).width > width) cut = cut.slice(0, -1)
  return `${cut}…`
}

// ---------------------------------------------------------------------------
// Colour
// ---------------------------------------------------------------------------

function rgb(hex: string): [number, number, number] {
  const n = parseInt(hex.slice(1), 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** `amount` of `a` over `b`, like CSS `color-mix(in srgb, a amount, b)`. */
function mix(a: string, b: string, amount: number): string {
  const [ar, ag, ab] = rgb(a)
  const [br, bg, bb] = rgb(b)
  const channel = (x: number, y: number) => Math.round(x * amount + y * (1 - amount))
  return `rgb(${channel(ar, br)}, ${channel(ag, bg)}, ${channel(ab, bb)})`
}

function withAlpha(hex: string, alpha: number): string {
  const [r, g, b] = rgb(hex)
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}
