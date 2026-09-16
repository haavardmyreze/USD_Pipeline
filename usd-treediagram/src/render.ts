/**
 * Draws a tree onto a canvas, in usd-refgraph's scene tree style.
 *
 * The preview and the exported PNG both come from here, so what is on screen
 * is exactly what is saved. Every measurement mirrors the `.prim` rules in
 * usd-refgraph's stylesheet: 26px rows, 16px columns, each child's branch line
 * under its parent's chevron.
 *
 * Coordinates are in CSS pixels; `scale` only sets how many device pixels
 * each one becomes.
 */

import type { TreeNode } from './parse'
import { iconImage, primIcon } from './icons'
import { THEMES, type Theme } from './theme'

export type Frame = 'panel' | 'flat' | 'transparent'

export interface Options {
  theme: 'dark' | 'light'
  frame: Frame
  title: string
  showCount: boolean
  showTypes: boolean
  /** Every other row faintly shaded. */
  stripes: boolean
  minWidth: number
  padding: number
}

export const DEFAULT_OPTIONS: Options = {
  theme: 'dark',
  frame: 'panel',
  title: '',
  showCount: true,
  showTypes: true,
  stripes: true,
  minWidth: 320,
  padding: 16,
}

export interface Row {
  node: TreeNode
  /** For each ancestor level, whether a line keeps running down past this row. */
  rails: boolean[]
  last: boolean
  y: number
}

export interface Layout {
  width: number
  height: number
  rows: Row[]
  /** Where rows start, and how wide their highlight runs. */
  rowX: number
  rowWidth: number
  calloutX: number
  headerY: number
  rowsY: number
  prims: number
}

const FAMILY = '"Inter Variable", "Segoe UI", system-ui, sans-serif'
const FONT_NAME = `400 12px ${FAMILY}`
const FONT_NAME_ITALIC = `italic 400 12px ${FAMILY}`
const FONT_NOTE = `400 11px ${FAMILY}`
const FONT_SMALL = `500 10px ${FAMILY}`
const FONT_TYPE = `400 10px ${FAMILY}`
const FONT_TITLE = `600 11px ${FAMILY}`
const FONT_BADGE = `600 10px ${FAMILY}`
const FONT_CALLOUT = `500 11px ${FAMILY}`

const ROW = 26
const COL = 16
const ICON = 16
const FLAG = 13
const PILL = 16
/** `.prim` padding: 4px before the first column, 6px after the type. */
const ROW_PAD_LEFT = 4
const ROW_PAD_RIGHT = 6
/** `.scene` padding inside a panel. */
const PANEL_PAD = 12
const PANEL_RADIUS = 14
const HEADER = 22
const HEADER_GAP = 8
const TYPE_GAP = 24
const CALLOUT_GAP = 20

// ---------------------------------------------------------------------------
// Layout
// ---------------------------------------------------------------------------

export function layout(ctx: CanvasRenderingContext2D, roots: TreeNode[], options: Options): Layout {
  const rows: Row[] = []
  const walk = (nodes: TreeNode[], rails: boolean[]): void => {
    nodes.forEach((node, index) => {
      const last = index === nodes.length - 1
      rows.push({ node, rails, last, y: 0 })
      if (isOpen(node)) walk(node.children, [...rails, !last])
    })
  }
  walk(roots, [])

  const inset = options.padding + (options.frame === 'panel' ? PANEL_PAD : 0)
  const headerY = inset
  const rowsY = inset + (options.title ? HEADER + HEADER_GAP : 0)
  rows.forEach((row, index) => (row.y = rowsY + index * ROW))

  let content = 0
  let callout = 0
  for (const row of rows) {
    let right = paintRow(ctx, row, 0, null)
    if (options.showTypes && row.node.type && !row.node.note) {
      ctx.font = FONT_TYPE
      right += TYPE_GAP + ctx.measureText(row.node.type).width
    }
    content = Math.max(content, right + ROW_PAD_RIGHT)
    if (row.node.callout) {
      ctx.font = FONT_CALLOUT
      callout = Math.max(callout, ctx.measureText(calloutText(row.node)).width)
    }
  }
  const prims = countPrims(roots)
  if (options.title) content = Math.max(content, headerWidth(ctx, options, prims))

  const rowWidth = Math.ceil(Math.max(content, options.minWidth - inset * 2, 120))
  const calloutX = inset + rowWidth + CALLOUT_GAP
  const width = Math.ceil(calloutX - (callout ? 0 : CALLOUT_GAP) + callout + inset)
  const height = Math.ceil(rowsY + Math.max(rows.length, 1) * ROW + inset + (options.frame === 'panel' ? 4 : 0))

  return {
    width,
    height,
    rows,
    rowX: inset,
    rowWidth,
    calloutX,
    headerY,
    rowsY,
    prims,
  }
}

export function isOpen(node: TreeNode): boolean {
  return node.children.length > 0 && !node.closed
}

function isBranch(node: TreeNode): boolean {
  return node.children.length > 0 || node.closed
}

function countPrims(nodes: TreeNode[]): number {
  return nodes.reduce((sum, node) => sum + (node.note ? 0 : 1 + countPrims(node.children)), 0)
}

/** The row under a point, in layout coordinates. */
export function rowAt(layout: Layout, x: number, y: number): Row | undefined {
  if (x < layout.rowX || x > layout.width) return undefined
  return layout.rows.find((row) => y >= row.y && y < row.y + ROW)
}

export const ROW_HEIGHT = ROW

// ---------------------------------------------------------------------------
// Drawing
// ---------------------------------------------------------------------------

interface Paint {
  ctx: CanvasRenderingContext2D
  theme: Theme
  scale: number
}

/** Draw `layout` onto `canvas`, resizing it to fit at `scale`. */
export function draw(canvas: HTMLCanvasElement, tree: Layout, options: Options, scale: number): void {
  canvas.width = Math.round(tree.width * scale)
  canvas.height = Math.round(tree.height * scale)
  const ctx = canvas.getContext('2d')!
  const theme = THEMES[options.theme]
  ctx.setTransform(scale, 0, 0, scale, 0, 0)
  ctx.clearRect(0, 0, tree.width, tree.height)
  ctx.imageSmoothingQuality = 'high'
  const paint: Paint = { ctx, theme, scale }

  if (options.frame === 'panel') {
    const p = options.padding
    ctx.fillStyle = theme.panel
    ctx.beginPath()
    ctx.roundRect(p + 0.5, p + 0.5, tree.width - p * 2 - 1, tree.height - p * 2 - 1, PANEL_RADIUS)
    ctx.fill()
    ctx.strokeStyle = theme.panelLine
    ctx.lineWidth = 1
    ctx.stroke()
  } else if (options.frame === 'flat') {
    ctx.fillStyle = theme.panel
    ctx.fillRect(0, 0, tree.width, tree.height)
  }

  if (options.title) headerWidth(ctx, options, tree.prims, { paint, x: tree.rowX + ROW_PAD_LEFT, y: tree.headerY })

  if (!tree.rows.length) {
    ctx.font = FONT_NOTE
    ctx.fillStyle = theme.fg3
    ctx.fillText('An empty tree. Type a prim name on the left.', tree.rowX + ROW_PAD_LEFT, baseline(ctx, tree.rowsY + ROW / 2))
    return
  }

  tree.rows.forEach((row, index) => {
    const { node, y } = row
    const on = node.selected && !node.note
    if (options.stripes && index % 2 === 1 && !on) {
      ctx.fillStyle = theme.stripe
      ctx.beginPath()
      ctx.roundRect(tree.rowX, y, tree.rowWidth, ROW, 6)
      ctx.fill()
    }
    if (on) {
      ctx.fillStyle = theme.selected
      ctx.beginPath()
      ctx.roundRect(tree.rowX, y, tree.rowWidth, ROW, 6)
      ctx.fill()
    }

    paintRow(ctx, row, tree.rowX, paint)

    if (options.showTypes && node.type && !node.note) {
      ctx.font = FONT_TYPE
      ctx.fillStyle = on ? theme.onSelectedSoft : theme.fg3
      ctx.textAlign = 'right'
      ctx.fillText(node.type, tree.rowX + tree.rowWidth - ROW_PAD_RIGHT, baseline(ctx, y + ROW / 2))
      ctx.textAlign = 'left'
    }

    if (node.callout) {
      ctx.font = FONT_CALLOUT
      ctx.fillStyle = theme.callout
      ctx.fillText(calloutText(node), tree.calloutX, baseline(ctx, y + ROW / 2))
    }
  })
}

function calloutText(node: TreeNode): string {
  return `←  ${node.callout}`
}

/** The heading above the rows, and its count. Returns its width. */
function headerWidth(
  ctx: CanvasRenderingContext2D,
  options: Options,
  count: number,
  at?: { paint: Paint; x: number; y: number },
): number {
  ctx.font = FONT_TITLE
  const titleWidth = ctx.measureText(options.title).width
  let width = ROW_PAD_LEFT + titleWidth
  const label = String(count)
  ctx.font = FONT_BADGE
  const badgeWidth = ctx.measureText(label).width + 12
  if (options.showCount) width += 6 + badgeWidth

  if (at) {
    const { paint, x, y } = at
    const mid = y + HEADER / 2
    ctx.font = FONT_TITLE
    ctx.fillStyle = paint.theme.fg2
    ctx.fillText(options.title, x, baseline(ctx, mid))
    if (options.showCount) {
      const bx = x + titleWidth + 6
      ctx.fillStyle = paint.theme.fill
      ctx.beginPath()
      ctx.roundRect(bx, mid - 8, badgeWidth, 16, 8)
      ctx.fill()
      ctx.font = FONT_BADGE
      ctx.fillStyle = paint.theme.fg2
      ctx.fillText(label, bx + 6, baseline(ctx, mid))
    }
  }
  return width
}

/**
 * One row, from its connector lines to the end of its flags. With no `paint`
 * it only measures. Returns the right edge, relative to `x` when measuring.
 */
function paintRow(ctx: CanvasRenderingContext2D, row: Row, x: number, paint: Paint | null): number {
  const { node, rails, last, y } = row
  const theme = paint?.theme
  const on = node.selected && !node.note
  const depth = rails.length
  const mid = y + ROW / 2
  let cx = x + ROW_PAD_LEFT

  // Connector lines, one column per ancestor level.
  if (paint) {
    const rail = on ? theme!.railSelected : theme!.rail
    for (let column = 0; column < depth; column++) {
      const own = column === depth - 1
      const kind = own ? (last ? 'elbow' : 'tee') : rails[column + 1] ? 'pipe' : 'blank'
      const left = cx + column * COL
      const centre = left + COL / 2 - 0.5
      if (kind === 'pipe' || kind === 'tee') line(paint, centre, y, 1, ROW, rail)
      if (kind === 'elbow') line(paint, centre, y, 1, ROW / 2, rail)
      if (kind === 'tee' || kind === 'elbow') line(paint, left + COL / 2, mid - 0.5, COL / 2, 1, rail)
    }
  }
  cx += depth * COL

  // The chevron, or the line that carries a leaf's branch on to its icon.
  if (paint && !node.note) {
    const rail = on ? theme!.railSelected : theme!.rail
    if (isBranch(node)) {
      chevron(paint, cx, mid, isOpen(node), on ? theme!.onSelectedSoft : theme!.fg3)
      if (isOpen(node)) line(paint, cx + COL / 2 - 0.5, mid + 6, 1, y + ROW - (mid + 6), rail)
    } else if (depth > 0) {
      line(paint, cx, mid - 0.5, COL - 3, 1, rail)
    }
  }
  cx += COL

  if (node.note) {
    ctx.font = FONT_NOTE
    if (paint) {
      ctx.fillStyle = theme!.fg3
      ctx.fillText(node.name, cx, baseline(ctx, mid))
    }
    return cx + ctx.measureText(node.name).width - x
  }

  // Icon.
  if (paint) {
    image(paint, primIcon(node.type, node.kind, node.icon), cx, mid - ICON / 2, ICON, !node.active ? 0.4 : 1, !node.active)
  }
  cx += ICON + 6

  // Name.
  const italic = node.specifier !== 'def'
  ctx.font = italic ? FONT_NAME_ITALIC : FONT_NAME
  const nameWidth = ctx.measureText(node.name).width
  if (paint) {
    const color = on
      ? theme!.onSelected
      : !node.active
        ? theme!.fg3
        : italic || node.proxy
          ? theme!.fg2
          : theme!.fg
    ctx.fillStyle = color
    ctx.fillText(node.name, cx, baseline(ctx, mid))
    if (!node.active) line(paint, cx, mid, nameWidth, 1, on ? theme!.onSelectedSoft : theme!.strike)
  }
  cx += nameWidth

  // Flags: variant, arcs, instance.
  const flags: ((at: number) => number)[] = []
  if (node.variants.length) {
    const text = node.variants.length === 1 ? node.variants[0]![1] || '(none)' : String(node.variants.length)
    flags.push((at) => {
      ctx.font = FONT_SMALL
      const width = 3 + FLAG + 3 + ctx.measureText(text).width + 5
      if (paint) {
        pill(paint, at, mid, width, on ? theme!.onSelectedFill : theme!.variantFill)
        image(paint, 'LOP__setvariant', at + 3, mid - FLAG / 2, FLAG)
        ctx.font = FONT_SMALL
        ctx.fillStyle = on ? theme!.onSelected : theme!.variant
        ctx.fillText(text, at + 3 + FLAG + 3, baseline(ctx, mid))
      }
      return width
    })
  }
  for (const arc of node.arcs) {
    if (arc === 'reference' || arc === 'payload') {
      const name = arc === 'reference' ? 'LOP__reference' : 'SCENEGRAPH__payloads'
      const dim = arc === 'payload' && node.unloaded
      flags.push((at) => {
        if (paint) image(paint, name, at, mid - FLAG / 2, FLAG, dim ? 0.45 : 1, dim)
        return FLAG
      })
    } else {
      // Houdini has no icon for these, so they stay as words.
      flags.push((at) => {
        ctx.font = FONT_SMALL
        const width = ctx.measureText(arc).width + 10
        if (paint) {
          pill(paint, at, mid, width, on ? theme!.onSelectedFill : theme!.fill)
          ctx.font = FONT_SMALL
          ctx.fillStyle = on ? theme!.onSelected : theme!.fg2
          ctx.fillText(arc, at + 5, baseline(ctx, mid))
        }
        return width
      })
    }
  }
  if (node.instance) {
    flags.push((at) => {
      if (paint) image(paint, 'SCENEGRAPH__primtype__instances', at, mid - FLAG / 2, FLAG)
      return FLAG
    })
  }
  if (flags.length) {
    cx += 6
    flags.forEach((flag, index) => {
      cx += flag(cx) + (index < flags.length - 1 ? 4 : 0)
    })
  }

  return cx - x
}

// ---------------------------------------------------------------------------
// Primitives
// ---------------------------------------------------------------------------

/** A filled rectangle, snapped to device pixels so thin lines stay sharp. */
function line(paint: Paint, x: number, y: number, w: number, h: number, color: string): void {
  const s = paint.scale
  const x0 = Math.round(x * s)
  const y0 = Math.round(y * s)
  const x1 = Math.max(Math.round((x + w) * s), x0 + 1)
  const y1 = Math.max(Math.round((y + h) * s), y0 + 1)
  paint.ctx.fillStyle = color
  paint.ctx.fillRect(x0 / s, y0 / s, (x1 - x0) / s, (y1 - y0) / s)
}

/** usd-refgraph's `chevronRight`, drawn 11px wide in a 16px column. */
function chevron(paint: Paint, x: number, mid: number, open: boolean, color: string): void {
  const { ctx } = paint
  const size = 11
  ctx.save()
  ctx.translate(x + COL / 2, mid)
  if (open) ctx.rotate(Math.PI / 2)
  ctx.scale(size / 16, size / 16)
  ctx.translate(-8, -8)
  ctx.beginPath()
  ctx.moveTo(6, 3.5)
  ctx.lineTo(10.5, 8)
  ctx.lineTo(6, 12.5)
  ctx.strokeStyle = color
  ctx.lineWidth = 1.5
  ctx.lineCap = 'round'
  ctx.lineJoin = 'round'
  ctx.stroke()
  ctx.restore()
}

function pill(paint: Paint, x: number, mid: number, width: number, color: string): void {
  paint.ctx.fillStyle = color
  paint.ctx.beginPath()
  paint.ctx.roundRect(x, mid - PILL / 2, width, PILL, PILL / 2)
  paint.ctx.fill()
}

function image(paint: Paint, name: string, x: number, y: number, size: number, alpha = 1, grey = false): void {
  const img = iconImage(name)
  if (!img) return
  const { ctx } = paint
  ctx.save()
  ctx.globalAlpha = alpha
  if (grey) ctx.filter = 'grayscale(1)'
  ctx.drawImage(img, x, y, size, size)
  ctx.restore()
}

/** The baseline that centres the current font's capitals on `mid`. */
function baseline(ctx: CanvasRenderingContext2D, mid: number): number {
  const metrics = ctx.measureText('Hg')
  return mid + (metrics.fontBoundingBoxAscent - metrics.fontBoundingBoxDescent) / 2
}
