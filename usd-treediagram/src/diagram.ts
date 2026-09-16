/**
 * One way in for both kinds of diagram.
 *
 * The app, the preview interactions and the command-line renderer all ask
 * this for a drawing; it picks the tree or the flowchart renderer from the
 * options' `mode`, and answers "what is under this point" for either.
 */

import { looksLikeGraph, parseGraph } from './graph/parse'
import { buildGraph } from './graph/render'
import { parse, type Problem } from './parse'
import { ROW_HEIGHT, draw, layout, rowAt, type Mode, type Options } from './render'

export interface Hit {
  /** The source line to jump to. */
  line: number
  /** The node's name, for adding a declaration line when it has none. */
  name: string
  /** Whether the line is the item's own, where keywords like `selected` go. */
  ownLine: boolean
  /** Whether double-click can open or close it. */
  foldable: boolean
  rect: { x: number; y: number; w: number; h: number; radius: number }
}

export interface Drawing {
  width: number
  height: number
  problems: Problem[]
  paint(canvas: HTMLCanvasElement, scale: number): void
  hit(x: number, y: number): Hit | undefined
}

export function build(ctx: CanvasRenderingContext2D, source: string, options: Options): Drawing {
  return options.mode === 'graph' ? buildFlowchart(ctx, source, options) : buildTree(ctx, source, options)
}

/** The mode an outline asks for: its own setting, or a guess from its arrows. */
export function modeOf(source: string, stated?: Mode): Mode {
  return stated ?? (looksLikeGraph(source) ? 'graph' : 'tree')
}

function buildTree(ctx: CanvasRenderingContext2D, source: string, options: Options): Drawing {
  const parsed = parse(source)
  const tree = layout(ctx, parsed.roots, options)
  return {
    width: tree.width,
    height: tree.height,
    problems: parsed.problems,
    paint: (canvas, scale) => draw(canvas, tree, options, scale),
    hit(x, y) {
      const row = rowAt(tree, x, y)
      if (!row) return undefined
      return {
        line: row.node.line,
        name: row.node.name,
        ownLine: !row.node.note,
        foldable: !row.node.note,
        rect: { x: tree.rowX, y: row.y, w: tree.rowWidth, h: ROW_HEIGHT, radius: 6 },
      }
    },
  }
}

function buildFlowchart(ctx: CanvasRenderingContext2D, source: string, options: Options): Drawing {
  const graph = parseGraph(source)
  const chart = buildGraph(ctx, graph, options)
  return {
    width: chart.width,
    height: chart.height,
    problems: graph.problems,
    paint: chart.paint,
    hit(x, y) {
      const box = chart.boxes.find((b) => x >= b.x && x <= b.x + b.w && y >= b.y && y <= b.y + b.h)
      if (!box) return undefined
      return {
        line: box.node.declLine ?? box.node.line,
        name: box.node.name,
        ownLine: box.node.declLine !== null,
        foldable: false,
        rect: { x: box.x, y: box.y, w: box.w, h: box.h, radius: 9 },
      }
    },
  }
}
