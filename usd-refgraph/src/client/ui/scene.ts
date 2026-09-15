/**
 * The composed prim hierarchy of whichever layer is selected in the graph.
 *
 * The graph shows files and the arcs between them; this shows what those files
 * compose into. It is always the stage opened *from the selected node*, so it
 * holds exactly what that layer can see: pick the shot root for the whole
 * shot, pick an asset's model block for just that block.
 *
 * The link runs the other way too. A picked prim lists every layer holding an
 * opinion on it, and clicking one selects that layer in the graph — which in
 * turn swaps this tree for that layer's own.
 *
 * A layer's tree opens fully expanded, materials excepted, fetched in one
 * request up to a budget; past that, levels are fetched as rows are opened, so
 * a heavy shot is never walked whole. Each layer keeps its own expansion and
 * selection, so moving around the graph and back finds the tree as you left it.
 */

import type { GraphNode, PrimDetail, SceneLevel, ScenePrim } from '@shared/types'
import { ApiFailure, getPrim, getScene, getSubtree } from '../api'
import { ARC_ICON, houdiniIcon, primIcon } from './houdini'
import { ICONS } from './icons'
import { Facts, countBadge, emptyState, iconButton, truncated } from './kit'
import { copyText, el, icon } from '../util'

export interface SceneCallbacks {
  /** Select a layer: in the graph, or in the panel when opened from a page. */
  onSelectLayer(id: string, path: string): void
  /** Whether a layer can be selected from here. */
  hasLayer(id: string): boolean
  onToast(message: string, kind?: 'ok' | 'error'): void
}

/** Everything remembered about one layer's tree. */
interface LayerState {
  levels: Map<string, SceneLevel>
  /** Prim paths whose children are being fetched. */
  pending: Set<string>
  /** Why a level could not be read, by prim path. */
  errors: Map<string, string>
  open: Set<string>
  selected: string | null
  detail: PrimDetail | null
  /** False until the first level has arrived and been auto-expanded. */
  primed: boolean
  /** True while an expand-all request is out. */
  expanding: boolean
}

const ROOT = '/'

/** How the opinion list names each arc. */
const ARC_NAME: Record<string, string> = {
  root: 'local',
  sublayer: 'sublayer',
  reference: 'reference',
  payload: 'payload',
  variant: 'variant',
  inherit: 'inherit',
  specialize: 'specialize',
  relocate: 'relocate',
}

export class SceneTree {
  private readonly root = el('div', 'scene')
  private node: GraphNode | null = null
  /** Load payloads when opening a stage. Shared by every layer. */
  private payloads = false
  private layers = new Map<string, LayerState>()

  constructor(private readonly callbacks: SceneCallbacks) {
    this.root.addEventListener('keydown', (event) => this.onKey(event))
  }

  /** The tree for `node`. The element is reused, so keep it where it lands. */
  show(node: GraphNode): HTMLElement {
    this.node = node
    const state = this.state()
    if (!state.levels.has(ROOT)) void this.fetchLevel(state, ROOT)
    this.render()
    return this.root
  }

  /** Forget every tree, after the files on disk may have changed. */
  reset(): void {
    this.layers = new Map()
  }

  // -- state ----------------------------------------------------------------

  private get key(): string {
    return `${this.node?.id ?? ''}|${this.payloads ? 1 : 0}`
  }

  private state(): LayerState {
    let state = this.layers.get(this.key)
    if (!state) {
      state = {
        levels: new Map(),
        pending: new Set(),
        errors: new Map(),
        open: new Set(),
        selected: null,
        detail: null,
        primed: false,
        expanding: false,
      }
      this.layers.set(this.key, state)
    }
    return state
  }

  /** True while `state` is still the tree on screen, after an await. */
  private isCurrent(state: LayerState): boolean {
    return this.layers.get(this.key) === state
  }

  private async fetchLevel(state: LayerState, primPath: string): Promise<void> {
    const node = this.node
    if (!node || state.pending.has(primPath)) return
    state.pending.add(primPath)
    state.errors.delete(primPath)

    try {
      const level = await getScene(node.path, primPath, this.payloads)
      state.levels.set(primPath, level)
      if (primPath === ROOT && !state.primed) {
        state.primed = true
        // A layer opens fully expanded, so its structure reads at a glance.
        // The top level is already on screen while the rest arrives. Only if
        // this layer is still the one shown: expanding reads the current node.
        if (this.isCurrent(state)) void this.expandAll(ROOT, { state, initial: true })
      }
    } catch (error) {
      state.errors.set(primPath, describe(error))
    } finally {
      state.pending.delete(primPath)
    }
    if (this.isCurrent(state)) this.render()
  }

  private toggle(prim: ScenePrim): void {
    const state = this.state()
    if (state.open.has(prim.path)) {
      state.open.delete(prim.path)
    } else {
      state.open.add(prim.path)
      if (!state.levels.has(prim.path)) void this.fetchLevel(state, prim.path)
    }
    this.render()
  }

  /**
   * Open every prim beneath `primPath`, or the whole tree from the root.
   *
   * The server lists the branch in one request, breadth first up to a budget.
   * Whatever it had to leave out stays collapsed rather than open and empty,
   * and can still be opened a row at a time.
   *
   * Materials stay closed, and everything inside them: a shader network is
   * rarely what you came to see, and it can outnumber the geometry. Their
   * children are still fetched, so opening one is instant. Expanding a
   * material itself — Shift-click on its arrow — does open it.
   *
   * `initial` marks the expansion a layer opens with, which stays quiet about
   * running out of budget.
   */
  private async expandAll(
    primPath: string = ROOT,
    options: { state?: LayerState; initial?: boolean } = {},
  ): Promise<void> {
    const node = this.node
    const state = options.state ?? this.state()
    if (!node || state.expanding) return
    state.expanding = true
    this.render()

    try {
      const subtree = await getSubtree(node.path, primPath, this.payloads)
      const listed = new Set(subtree.levels.map((level) => level.primPath))
      // Levels arrive breadth first, so a parent is always decided before its
      // children: anything under a material left closed stays closed too.
      const closed = new Set<string>()
      for (const level of subtree.levels) {
        state.levels.set(level.primPath, level)
        state.errors.delete(level.primPath)
        const insideClosed = closed.has(level.primPath)
        for (const child of level.children) {
          if (insideClosed || isMaterial(child)) {
            closed.add(child.path)
            continue
          }
          if (child.childCount === 0 || !listed.has(child.path)) continue
          state.open.add(child.path)
        }
      }
      if (primPath !== ROOT) state.open.add(primPath)
      state.primed = true
      if (subtree.truncated && !options.initial && this.isCurrent(state)) {
        this.callbacks.onToast(
          `Expanded the first ${subtree.prims.toLocaleString()} prims. Open the rest a branch at a time.`,
        )
      }
    } catch (error) {
      if (this.isCurrent(state)) this.callbacks.onToast(describe(error), 'error')
    } finally {
      state.expanding = false
    }
    if (this.isCurrent(state)) this.render()
  }

  /** Close `primPath` and everything beneath it, or the whole tree. */
  private collapseAll(primPath: string = ROOT): void {
    const state = this.state()
    if (primPath === ROOT) {
      state.open.clear()
    } else {
      const prefix = `${primPath}/`
      for (const path of state.open) {
        if (path === primPath || path.startsWith(prefix)) state.open.delete(path)
      }
    }
    this.render()
  }

  /** A click: pick the prim, or put the selection away if it is the one picked. */
  private clickPrim(primPath: string): void {
    const state = this.state()
    if (state.selected !== primPath) {
      void this.pick(primPath)
      return
    }
    state.selected = null
    state.detail = null
    this.render()
  }

  private async pick(primPath: string): Promise<void> {
    const node = this.node
    if (!node) return
    const state = this.state()
    if (state.selected === primPath && state.detail) return
    state.selected = primPath
    state.detail = null
    this.render()

    try {
      const detail = await getPrim(node.path, primPath, this.payloads)
      if (!this.isCurrent(state) || state.selected !== primPath) return
      state.detail = detail
      this.render()
    } catch (error) {
      if (this.isCurrent(state)) this.callbacks.onToast(describe(error), 'error')
    }
  }

  private setPayloads(on: boolean): void {
    if (this.payloads === on) return
    // Carry what was open across, so loading payloads reveals more of the same
    // tree rather than starting a new one.
    const before = this.state()
    this.payloads = on
    const after = this.state()
    if (!after.levels.size) {
      for (const path of before.open) after.open.add(path)
      after.selected = before.selected
      after.primed = before.primed
      for (const path of [ROOT, ...after.open]) void this.fetchLevel(after, path)
      if (after.selected) {
        const selected = after.selected
        after.selected = null
        void this.pick(selected)
      }
    }
    this.render()
  }

  // -- rendering ------------------------------------------------------------

  private render(): void {
    const node = this.node
    if (!node) return
    const state = this.state()

    // Rebuilding the rows drops focus; put it back on the same prim.
    const focused = (document.activeElement as HTMLElement | null)?.closest<HTMLElement>('.prim[data-path]')
    const refocus = focused && this.root.contains(focused) ? focused.dataset.path : undefined

    const top = state.levels.get(ROOT)
    const children: HTMLElement[] = [this.buildBar(top)]

    const tree = el('div', 'scene__tree')
    tree.setAttribute('role', 'tree')
    tree.setAttribute('aria-label', `Prims composed from ${node.name}`)
    this.buildLevel(tree, state, ROOT, [])
    children.push(tree)

    if (state.selected) children.push(this.buildDetail(state))
    this.root.replaceChildren(...children)

    if (refocus) {
      this.root.querySelector<HTMLElement>(`.prim[data-path="${CSS.escape(refocus)}"]`)?.focus()
    }
  }

  private buildBar(top: SceneLevel | undefined): HTMLElement {
    const bar = el('div', 'scene__bar')
    const heading = el('h3', undefined, 'Prims')
    if (top) heading.appendChild(countBadge(top.total))
    bar.appendChild(heading)

    const toggle = el('button', `seg__btn scene__payloads${this.payloads ? ' is-on' : ''}`)
    toggle.setAttribute('aria-pressed', String(this.payloads))
    toggle.title = this.payloads
      ? 'Payloads are loaded. Click to open stages without them.'
      : 'Stages open without payloads, which is fast. Click to load them.'
    toggle.appendChild(houdiniIcon('SCENEGRAPH__payloads', undefined, 'hicon hicon--flag'))
    toggle.appendChild(el('span', undefined, 'Payloads'))
    toggle.addEventListener('click', () => this.setPayloads(!this.payloads))

    const tools = el('div', 'scene__tools')
    const expanding = this.state().expanding
    const expand = iconButton('expandAll', 'Expand all', () => void this.expandAll())
    expand.disabled = expanding || !top
    const collapse = iconButton('collapseAll', 'Collapse all', () => this.collapseAll())
    collapse.disabled = expanding || !this.state().open.size
    tools.append(expand, collapse)
    bar.appendChild(tools)

    const seg = el('div', 'seg')
    seg.appendChild(toggle)
    bar.appendChild(seg)
    return bar
  }

  /**
   * One prim's children, and theirs where open.
   *
   * `rails` says, for each ancestor level, whether that ancestor still has
   * siblings below it — which is whether a vertical line has to keep running
   * down past the rows being drawn now.
   */
  private buildLevel(
    host: HTMLElement,
    state: LayerState,
    parent: string,
    rails: boolean[],
  ): void {
    const level = state.levels.get(parent)
    const error = state.errors.get(parent)

    if (error) {
      host.appendChild(note(error, rails, 'error'))
      return
    }
    if (!level) {
      host.appendChild(note('Composing…', rails))
      return
    }
    if (!level.children.length && parent === ROOT) {
      host.appendChild(emptyState('This layer composes no prims.', { inline: true }))
      return
    }

    const more = level.total - level.children.length
    level.children.forEach((prim, index) => {
      // The "more not shown" note is a last sibling too, so a cut-short list
      // keeps its line running down to it.
      const last = index === level.children.length - 1 && more <= 0
      host.appendChild(this.buildRow(state, prim, rails, last))
      if (state.open.has(prim.path)) this.buildLevel(host, state, prim.path, [...rails, !last])
    })
    if (more > 0) host.appendChild(note(`${more} more not shown`, rails))
  }

  private buildRow(state: LayerState, prim: ScenePrim, rails: boolean[], last: boolean): HTMLElement {
    const open = state.open.has(prim.path)
    const branch = prim.childCount > 0
    const depth = rails.length

    const classes = ['prim']
    if (state.selected === prim.path) classes.push('is-on')
    if (!prim.active) classes.push('is-inactive')
    if (prim.specifier !== 'def') classes.push(`is-${prim.specifier}`)
    if (prim.instanceProxy) classes.push('is-proxy')
    const row = el('button', classes.join(' '))
    row.dataset.path = prim.path
    row.setAttribute('role', 'treeitem')
    row.setAttribute('aria-level', String(depth + 1))
    row.setAttribute('aria-selected', String(state.selected === prim.path))
    if (branch) row.setAttribute('aria-expanded', String(open))
    row.title = rowTitle(prim)

    for (const guide of guides(rails, last)) row.appendChild(guide)

    // A leaf has no caret, so its slot carries the connector on to the icon.
    const caret = el(
      'span',
      `prim__caret${open ? ' is-open' : ''}${!branch && depth > 0 ? ' is-leaf' : ''}`,
    )
    if (branch) {
      caret.appendChild(icon(ICONS.chevronRight))
      caret.title = 'Shift-click to expand or collapse everything beneath'
      caret.addEventListener('click', (event) => {
        event.stopPropagation()
        // Shift takes the whole branch with it, as it does in Houdini's tree.
        if (!event.shiftKey) this.toggle(prim)
        else if (open) this.collapseAll(prim.path)
        else void this.expandAll(prim.path)
      })
    }
    row.appendChild(caret)

    row.appendChild(houdiniIcon(primIcon(prim.typeName, prim.kind), undefined, 'hicon prim__icon'))
    row.appendChild(el('span', 'prim__name', prim.name))

    const flags = el('span', 'prim__flags')
    if (prim.variants) {
      const selections = Object.entries(prim.variants)
      const pill = el('span', 'prim__variant')
      pill.appendChild(houdiniIcon('LOP__setvariant', undefined, 'hicon hicon--flag'))
      pill.appendChild(
        el(
          'span',
          undefined,
          selections.length === 1 ? selections[0]![1] || '(none)' : String(selections.length),
        ),
      )
      pill.title = selections.map(([set, value]) => `Variant ${set} = ${value || '(none)'}`).join('\n')
      flags.appendChild(pill)
    }
    for (const arc of prim.arcs) {
      if (arc === 'reference') {
        flags.appendChild(houdiniIcon('LOP__reference', 'Has an authored reference', 'hicon hicon--flag'))
      } else if (arc === 'payload') {
        flags.appendChild(
          houdiniIcon(
            'SCENEGRAPH__payloads',
            prim.unloaded ? 'Payload, not loaded' : 'Payload, loaded',
            `hicon hicon--flag${prim.unloaded ? ' is-unloaded' : ''}`,
          ),
        )
      } else {
        // Houdini has no icon for these two, so they stay as words.
        flags.appendChild(flag(arc, `Has an authored ${arc}`))
      }
    }
    // Only the instance itself: marking every prim inside it repeats the same
    // icon down a whole subtree. Those rows are dimmed instead, as read-only.
    if (prim.instance) {
      flags.appendChild(
        houdiniIcon('SCENEGRAPH__primtype__instances', 'Instanceable, sharing one prototype', 'hicon hicon--flag'),
      )
    }
    if (flags.childElementCount) row.appendChild(flags)

    row.appendChild(el('span', 'prim__type', prim.typeName))

    row.addEventListener('click', (event) => {
      // The second click of a double-click belongs to the double-click,
      // which expands; letting it through would deselect what it just picked.
      if (event.detail > 1) return
      this.clickPrim(prim.path)
    })
    row.addEventListener('dblclick', () => {
      if (branch) this.toggle(prim)
    })
    return row
  }

  private buildDetail(state: LayerState): HTMLElement {
    const section = el('div', 'scene__detail')
    const detail = state.detail
    const path = state.selected!

    const head = el('div', 'insp__path')
    // The box runs right-to-left so a long path loses its start rather than its
    // end; the mark keeps a leading `/` from being reordered to the far side.
    const text = truncated(`‎${path}`, 'insp__pathText')
    text.title = path
    head.appendChild(text)
    head.appendChild(iconButton('copy', 'Copy prim path', () => void this.copy(path)))
    section.appendChild(head)

    if (!detail) {
      section.appendChild(emptyState('Reading prim…', { inline: true }))
      return section
    }

    const facts = new Facts()
    facts.add('Type', detail.typeName || '(typeless)')
    facts.add('Kind', detail.kind)
    if (detail.specifier !== 'def') facts.add('Specifier', detail.specifier)
    if (!detail.active) facts.add('Active', 'no')
    if (detail.instance) facts.add('Instance', 'instanceable')
    if (detail.instanceProxy) facts.add('Instance', 'inside an instance')
    if (detail.arcs.includes('payload')) facts.add('Payload', detail.unloaded ? 'not loaded' : 'loaded')
    for (const set of detail.variantSets) {
      const value = el('span', undefined, set.selection ?? '(none)')
      value.title = `Options: ${set.options.join(', ') || 'none'}`
      facts.add(`{${set.name}}`, value)
    }
    if (detail.appliedSchemas.length) facts.add('Schemas', detail.appliedSchemas.join(', '))
    facts.add(
      'Properties',
      `${detail.attributeCount} attr · ${detail.relationshipCount} rel`,
    )
    section.appendChild(facts.root)

    const heading = el('h3', undefined, 'Opinions')
    heading.appendChild(countBadge(detail.opinions.length))
    heading.title = 'Every layer with something to say about this prim, strongest first'
    section.appendChild(heading)

    const list = el('div', 'arc-list')
    for (const opinion of detail.opinions) {
      const here = opinion.layerId === this.node?.id
      const reachable = !here && this.callbacks.hasLayer(opinion.layerId)
      const row = el('button', `arc${here ? ' arc--here' : ''}`)
      row.disabled = !reachable
      // The root layer stack is the opened layer plus its sublayers, so a
      // root opinion from any other file arrived through a sublayer.
      const arc = opinion.arc === 'root' && !here ? 'sublayer' : opinion.arc

      const pip = el('span', 'arc__pip')
      const glyph = ARC_ICON[arc]
      if (glyph) pip.appendChild(houdiniIcon(glyph, undefined, 'hicon hicon--pip'))
      row.appendChild(pip)

      const main = el('div', 'arc__main')
      main.appendChild(el('div', 'arc__name', opinion.name))
      const meta = [opinion.specPath]
      if (opinion.introducedBy) meta.push(`from ${opinion.introducedBy}`)
      main.appendChild(el('div', 'arc__meta', meta.join('  ·  ')))
      row.appendChild(main)

      row.appendChild(el('span', 'arc__kind', here ? 'this layer' : ARC_NAME[arc] ?? arc))
      row.title = reachable
        ? `${opinion.layerPath}\nSelect this layer`
        : here
          ? `${opinion.layerPath}\nThe layer this tree is composed from`
          : `${opinion.layerPath}\nNot in the graph as drawn`
      if (reachable) {
        row.addEventListener('click', () =>
          this.callbacks.onSelectLayer(opinion.layerId, opinion.layerPath),
        )
      }
      list.appendChild(row)
    }
    section.appendChild(list)
    return section
  }

  private async copy(text: string): Promise<void> {
    const ok = await copyText(text)
    this.callbacks.onToast(ok ? 'Prim path copied' : 'Could not copy to the clipboard', ok ? 'ok' : 'error')
  }

  // -- keyboard -------------------------------------------------------------

  /** Arrow keys walk the tree the way a file browser's outline does. */
  private onKey(event: KeyboardEvent): void {
    const row = (event.target as HTMLElement).closest<HTMLElement>('.prim[data-path]')
    if (!row || event.ctrlKey || event.metaKey || event.altKey) return
    const rows = Array.from(this.root.querySelectorAll<HTMLElement>('.prim[data-path]'))
    const index = rows.indexOf(row)
    const path = row.dataset.path!
    const prim = this.findPrim(path)
    const state = this.state()

    const focus = (target: HTMLElement | undefined): void => {
      if (!target) return
      target.focus()
      void this.pick(target.dataset.path!)
    }

    // Shift with an arrow, or `*` as in most tree views, takes the whole branch.
    if (event.key === '*' || (event.shiftKey && event.key === 'ArrowRight')) {
      if (prim && prim.childCount > 0) void this.expandAll(path)
      event.preventDefault()
      event.stopPropagation()
      return
    }
    if (event.shiftKey && event.key === 'ArrowLeft') {
      this.collapseAll(path)
      event.preventDefault()
      event.stopPropagation()
      return
    }

    switch (event.key) {
      case 'ArrowDown':
        focus(rows[index + 1])
        break
      case 'ArrowUp':
        focus(rows[index - 1])
        break
      case 'ArrowRight':
        if (prim && prim.childCount > 0 && !state.open.has(path)) this.toggle(prim)
        else if (state.open.has(path)) focus(rows[index + 1])
        break
      case 'ArrowLeft':
        if (prim && state.open.has(path)) this.toggle(prim)
        else focus(rows.find((candidate) => candidate.dataset.path === parentOf(path)))
        break
      default:
        return
    }
    event.preventDefault()
    // Keep the rail's own arrow and letter shortcuts out of it.
    event.stopPropagation()
  }

  private findPrim(path: string): ScenePrim | undefined {
    const level = this.state().levels.get(parentOf(path))
    return level?.children.find((prim) => prim.path === path)
  }
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function flag(text: string, title: string): HTMLElement {
  const node = el('span', 'prim__flag', text)
  node.title = title
  return node
}

/** A line in the tree that is not a prim: always the last thing at its level. */
function note(text: string, rails: boolean[], variant?: 'error'): HTMLElement {
  const node = el('div', `prim prim--note${variant ? ' prim--error' : ''}`)
  for (const guide of guides(rails, true)) node.appendChild(guide)
  node.appendChild(el('span', 'prim__caret'))
  node.appendChild(el('span', 'prim__name', text))
  return node
}

/**
 * The connector lines in front of a row at depth `rails.length`.
 *
 * Column k sits under the caret of the ancestor at depth k. Every column but
 * the last is a pass-through, drawn only while the ancestor one level further
 * in still has siblings to come; the last is this row's own branch — a tee
 * when more siblings follow, an elbow when it is the last of them.
 */
function guides(rails: boolean[], last: boolean): HTMLElement[] {
  const cells: HTMLElement[] = []
  for (let column = 0; column < rails.length; column++) {
    const own = column === rails.length - 1
    const kind = own ? (last ? 'elbow' : 'tee') : rails[column + 1] ? 'pipe' : 'blank'
    cells.push(el('span', `guide guide--${kind}`))
  }
  return cells
}

function rowTitle(prim: ScenePrim): string {
  const lines = [prim.path]
  const what = [prim.specifier !== 'def' ? prim.specifier : null, prim.typeName || null, prim.kind ? `kind ${prim.kind}` : null]
  const summary = what.filter(Boolean).join(' · ')
  if (summary) lines.push(summary)
  if (!prim.active) lines.push('Deactivated')
  if (prim.childCount) lines.push(`${prim.childCount} ${prim.childCount === 1 ? 'child' : 'children'}`)
  return lines.join('\n')
}

/** Materials, which expanding leaves closed over their shaders. */
function isMaterial(prim: ScenePrim): boolean {
  return prim.typeName === 'Material'
}

function parentOf(path: string): string {
  const cut = path.lastIndexOf('/')
  return cut <= 0 ? ROOT : path.slice(0, cut)
}

function describe(error: unknown): string {
  if (error instanceof ApiFailure) return error.detail ?? error.message
  return 'Could not read the scene'
}
