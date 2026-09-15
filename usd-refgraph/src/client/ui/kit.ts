/**
 * The shared component kit.
 *
 * Every page and panel is built from these, so a card, a table, a pill or an
 * empty state looks and behaves the same wherever it appears. Anything a page
 * builds by hand instead is a place where the app drifts, so prefer adding a
 * variant here over styling one page's markup.
 */

import type { Status } from '@shared/pipeline'
import { ICONS, type IconName } from './icons'
import { el, icon } from '../util'

// ---------------------------------------------------------------------------
// Status and category vocabulary
// ---------------------------------------------------------------------------

export const STATUS_LABEL: Record<Status, string> = {
  placeholder: 'Placeholder',
  production_ready: 'Production ready',
  locked: 'Locked',
  unknown: 'No status',
}

/** Short form for tight spaces like table cells and chips. */
export const STATUS_SHORT: Record<Status, string> = {
  placeholder: 'Placeholder',
  production_ready: 'Ready',
  locked: 'Locked',
  unknown: '—',
}

/**
 * Amber while it is a stand-in, blue once it is safe to build on, green when
 * it is signed off. Matches the custom properties in `styles.css`.
 */
export const STATUS_COLOR: Record<Status, string> = {
  placeholder: 'var(--status-placeholder)',
  production_ready: 'var(--status-ready)',
  locked: 'var(--status-locked)',
  unknown: 'var(--status-unknown)',
}

export const STATUS_HINT: Record<Status, string> = {
  placeholder: 'Stand-in, not ready for anyone downstream',
  production_ready: 'Good to build on',
  locked: 'Signed off; do not change without talking to the owner',
  unknown: 'No status was written into this layer',
}

/** Colour per asset category prefix (guide §15.2). */
export const CATEGORY_COLOR: Record<string, string> = {
  character: 'var(--cat-character)',
  prop: 'var(--cat-prop)',
  environment: 'var(--cat-environment)',
  vehicle: 'var(--cat-vehicle)',
  fx: 'var(--cat-fx)',
  set: 'var(--cat-set)',
}

export const TIER_COLOR: Record<string, string> = {
  asset: 'var(--tier-asset)',
  set: 'var(--tier-set)',
  shot: 'var(--tier-shot)',
}

// ---------------------------------------------------------------------------
// Atoms
// ---------------------------------------------------------------------------

export function statusPill(status: Status, short = false): HTMLElement {
  const pill = el(
    'span',
    `pill pill--${status}`,
    short ? STATUS_SHORT[status] : STATUS_LABEL[status],
  )
  pill.title = STATUS_HINT[status]
  return pill
}

export function statusDot(status: Status): HTMLElement {
  const dot = el('span', `dot dot--${status}`)
  dot.title = STATUS_LABEL[status]
  return dot
}

export interface StripItem {
  status: Status
  /** What the mark stands for, e.g. the block name. */
  label: string
  /** A USD file: the mark opens it in the panel when picked. */
  layerPath?: string
}

/**
 * One mark per published file, coloured by status, in the order given.
 *
 * The app's answer to "which steps are done" without fixed columns: blocks are
 * free-form, so an entity shows exactly the files it has.
 */
export function statusStrip(items: StripItem[]): HTMLElement {
  const strip = el('span', 'strip')
  for (const item of items) {
    const mark = el('span', `strip__mark strip__mark--${item.status}`)
    mark.title = `${item.label} · ${STATUS_LABEL[item.status]}`
    if (item.layerPath) markLayer(mark, item.layerPath)
    strip.appendChild(mark)
  }
  return strip
}

export interface ChipOptions {
  /** A colour for the chip's leading edge, e.g. a category or tier hue. */
  accent?: string
  mono?: boolean
  strong?: boolean
  muted?: boolean
  title?: string
  status?: Status
  onClick?: () => void
}

/** The one small labelled token used for names, tags and counts. */
export function chip(text: string, options: ChipOptions = {}): HTMLElement {
  const classes = ['chip']
  if (options.mono) classes.push('chip--mono')
  if (options.strong) classes.push('chip--strong')
  if (options.muted) classes.push('chip--muted')
  if (options.accent) classes.push('chip--accented')

  const node = el(options.onClick ? 'button' : 'span', classes.join(' '))
  if (options.accent) node.style.setProperty('--chip-accent', options.accent)
  if (options.status) node.appendChild(statusDot(options.status))
  node.appendChild(el('span', undefined, text))
  if (options.title) node.title = options.title
  if (options.onClick) {
    node.classList.add('chip--action')
    node.addEventListener('click', options.onClick)
  }
  return node
}

export function chipRow(chips: HTMLElement[], label?: string): HTMLElement {
  const row = el('div', 'chiprow')
  if (label) row.appendChild(el('span', 'chiprow__label', label))
  const wrap = el('div', 'chips')
  for (const node of chips) wrap.appendChild(node)
  row.appendChild(wrap)
  return row
}

export type ButtonVariant = 'default' | 'primary' | 'ghost' | 'danger'

export interface ButtonOptions {
  variant?: ButtonVariant
  icon?: IconName
  small?: boolean
  title?: string
  onClick?: () => void
}

export function button(text: string, options: ButtonOptions = {}): HTMLButtonElement {
  const classes = ['btn']
  if (options.variant && options.variant !== 'default') {
    classes.push(`btn--${options.variant}`)
  }
  if (options.small) classes.push('btn--small')
  const node = el('button', classes.join(' '))
  if (options.icon) node.appendChild(icon(ICONS[options.icon]))
  node.appendChild(el('span', undefined, text))
  if (options.title) node.title = options.title
  if (options.onClick) node.addEventListener('click', options.onClick)
  return node
}

export function iconButton(
  name: IconName,
  title: string,
  onClick: () => void,
): HTMLButtonElement {
  const node = el('button', 'iconbtn')
  node.appendChild(icon(ICONS[name]))
  node.title = title
  node.setAttribute('aria-label', title)
  node.addEventListener('click', onClick)
  return node
}

/** A count, or any short number, sitting beside a label. */
export function countBadge(value: number | string, muted = true): HTMLElement {
  return el('span', `badge${muted ? ' badge--muted' : ''}`, String(value))
}

// ---------------------------------------------------------------------------
// Containers
// ---------------------------------------------------------------------------

export interface CardOptions {
  /** A quiet note beside the title. */
  hint?: string
  /** Controls pinned to the right of the title row. */
  actions?: HTMLElement
  /** Drop the card's inner padding, for a card that holds a full-bleed list. */
  flush?: boolean
}

export interface Card {
  root: HTMLElement
  body: HTMLElement
}

/** A titled panel. Append to `body`; `root` is what goes on the page. */
export function card(title?: string, options: CardOptions = {}): Card {
  const root = el('section', `card${options.flush ? ' card--flush' : ''}`)

  if (title || options.actions) {
    const head = el('div', 'card__head')
    const heading = el('h2', 'card__title', title ?? '')
    if (options.hint) heading.appendChild(el('span', 'card__hint', options.hint))
    head.appendChild(heading)
    if (options.actions) head.appendChild(options.actions)
    root.appendChild(head)
  }

  const body = el('div', 'card__body')
  root.appendChild(body)
  return { root, body }
}

export interface EmptyStateOptions {
  icon?: IconName
  body?: string
  action?: HTMLElement
  /** Compact form, for a slot inside a panel rather than a whole page. */
  inline?: boolean
}

/** The one way the app says "there is nothing here". */
export function emptyState(title: string, options: EmptyStateOptions = {}): HTMLElement {
  const node = el('div', `blank${options.inline ? ' blank--inline' : ''}`)
  if (options.icon && !options.inline) {
    const glyph = icon(ICONS[options.icon])
    glyph.setAttribute('class', 'blank__icon')
    node.appendChild(glyph)
  }
  node.appendChild(el('p', 'blank__title', title))
  if (options.body) node.appendChild(el('p', 'blank__body', options.body))
  if (options.action) node.appendChild(options.action)
  return node
}


// ---------------------------------------------------------------------------
// Data table — one grid, used by every page that lists rows
// ---------------------------------------------------------------------------

export interface Column {
  label: string
  /** A CSS grid track, e.g. `minmax(0, 1fr)` or `120px`. */
  width: string
  /** Push the cell's content to the right, for counts and timestamps. */
  end?: boolean
}

export interface TableRow {
  cells: (HTMLElement | string)[]
  title?: string
  onClick?: () => void
  /** A USD file the row stands for; picking the row opens it in the panel. */
  layerPath?: string
}

/** A header row plus body rows on one shared grid template. */
export function dataTable(columns: Column[], rows: TableRow[]): HTMLElement {
  const table = el('div', 'table')
  table.style.setProperty('--cols', columns.map((column) => column.width).join(' '))

  const head = el('div', 'table__row table__row--head')
  for (const column of columns) {
    const cell = el('span', `table__cell${column.end ? ' table__cell--end' : ''}`)
    cell.textContent = column.label
    head.appendChild(cell)
  }
  table.appendChild(head)

  for (const row of rows) {
    const line = el(row.onClick ? 'button' : 'div', 'table__row')
    if (row.onClick) {
      line.classList.add('table__row--action')
      line.addEventListener('click', row.onClick)
    }
    if (row.title) line.title = row.title
    if (row.layerPath) markLayer(line, row.layerPath)
    row.cells.forEach((content, index) => {
      const column = columns[index]
      const cell = el('span', `table__cell${column?.end ? ' table__cell--end' : ''}`)
      if (typeof content === 'string') cell.textContent = content
      else cell.appendChild(content)
      line.appendChild(cell)
    })
    table.appendChild(line)
  }
  return table
}

/**
 * Mark an element as standing for a USD file. The app listens for picks on
 * anything carrying the mark and opens that file in the panel, so a page only
 * says which element is which file.
 */
export function markLayer<T extends HTMLElement>(node: T, path: string): T {
  node.dataset.layerPath = path
  node.tabIndex = 0
  node.setAttribute('role', 'button')
  return node
}

export interface NamedCellOptions {
  status?: Status
  accent?: string
  strong?: boolean
  mono?: boolean
  title?: string
  onClick?: () => void
}

/** A cell holding a status dot and a name, the app's commonest pairing. */
export function namedCell(text: string, options: NamedCellOptions = {}): HTMLElement {
  const node = el(options.onClick ? 'button' : 'span', 'named')
  if (options.strong) node.classList.add('named--strong')
  if (options.mono) node.classList.add('named--mono')
  if (options.onClick) {
    node.classList.add('named--action')
    node.addEventListener('click', (event) => {
      event.stopPropagation()
      options.onClick!()
    })
  }
  if (options.status) node.appendChild(statusDot(options.status))
  else if (options.accent) {
    const pip = el('span', 'named__pip')
    pip.style.background = options.accent
    node.appendChild(pip)
  }
  node.appendChild(el('span', 'named__text', text))
  if (options.title) node.title = options.title
  return node
}

/** Text that should shrink and ellipsise rather than push a row wider. */
export function truncated(text: string, className = ''): HTMLElement {
  const node = el('span', `trunc ${className}`.trim(), text)
  node.title = text
  return node
}

// ---------------------------------------------------------------------------
// Facts — the label/value list used by panels and the inspector
// ---------------------------------------------------------------------------

export interface FactsOptions {
  /** Lay the pairs out in columns rather than one per line. */
  columns?: boolean
}

export class Facts {
  readonly root: HTMLElement

  constructor(options: FactsOptions = {}) {
    this.root = el('dl', `facts${options.columns ? ' facts--columns' : ''}`)
  }

  add(key: string, value: string | HTMLElement | null | undefined): this {
    if (value === null || value === undefined || value === '') return this
    this.root.appendChild(el('dt', undefined, key))
    const dd = el('dd')
    if (typeof value === 'string') dd.textContent = value
    else dd.appendChild(value)
    this.root.appendChild(dd)
    return this
  }

  get isEmpty(): boolean {
    return this.root.childElementCount === 0
  }
}

// ---------------------------------------------------------------------------
// Filters
// ---------------------------------------------------------------------------

export interface FilterOption<T extends string> {
  value: T
  label: string
  /** A dot's colour, when the option has one. */
  status?: Status
  count?: number
}

/**
 * A row of toggles. `hidden` holds the values switched *off*, matching how the
 * arc legend and the status filter both work.
 */
export function filterChips<T extends string>(
  label: string,
  options: FilterOption<T>[],
  hidden: Set<T>,
  onToggle: (value: T) => void,
): HTMLElement {
  const wrap = el('div', 'filterbar')
  if (label) wrap.appendChild(el('span', 'filterbar__label', label))

  for (const option of options) {
    const node = el('button', 'filterchip')
    if (!hidden.has(option.value)) node.classList.add('is-on')
    node.setAttribute('aria-pressed', String(!hidden.has(option.value)))
    if (option.status) node.appendChild(statusDot(option.status))
    node.appendChild(el('span', undefined, option.label))
    if (option.count !== undefined) {
      node.appendChild(el('span', 'filterchip__count', String(option.count)))
    }
    node.addEventListener('click', () => onToggle(option.value))
    wrap.appendChild(node)
  }
  return wrap
}

export interface SearchFieldOptions {
  placeholder: string
  value?: string
  /** A keyboard hint shown at the trailing edge, e.g. `/`. */
  hint?: string
  variant?: 'inline' | 'rail'
  onInput(value: string): void
}

/** The one search box: an icon, a field, and an optional key hint. */
export function searchField(options: SearchFieldOptions): HTMLLabelElement {
  const label = document.createElement('label')
  label.className = `search${options.variant ? ` search--${options.variant}` : ''}`

  const glyph = icon(ICONS.search)
  glyph.setAttribute('class', 'search__icon')
  label.appendChild(glyph)

  const input = document.createElement('input')
  input.type = 'search'
  input.placeholder = options.placeholder
  input.autocomplete = 'off'
  input.spellcheck = false
  input.value = options.value ?? ''
  input.addEventListener('input', () => options.onInput(input.value))
  label.appendChild(input)

  if (options.hint) label.appendChild(el('kbd', undefined, options.hint))
  return label
}

/** Folder-style tabs, used for the workspace's asset/set/shot switch. */
export function tabs<T extends string>(
  items: { value: T; label: string; count?: number }[],
  active: T,
  onPick: (value: T) => void,
): HTMLElement {
  const wrap = el('div', 'ptabs')
  wrap.setAttribute('role', 'tablist')
  for (const item of items) {
    const node = el('button', 'ptab')
    node.setAttribute('role', 'tab')
    node.setAttribute('aria-selected', String(item.value === active))
    if (item.value === active) node.classList.add('is-on')
    node.appendChild(el('span', undefined, item.label))
    if (item.count !== undefined) {
      node.appendChild(el('span', 'ptab__count', String(item.count)))
    }
    node.addEventListener('click', () => onPick(item.value))
    wrap.appendChild(node)
  }
  return wrap
}

/** A dropdown, for picking one of many where chips would not fit. */
export function select<T extends string>(
  options: { value: T; label: string }[],
  active: T | null,
  onPick: (value: T) => void,
): HTMLSelectElement {
  const node = document.createElement('select')
  node.className = 'select'
  for (const option of options) {
    const item = document.createElement('option')
    item.value = option.value
    item.textContent = option.label
    if (option.value === active) item.selected = true
    node.appendChild(item)
  }
  node.addEventListener('change', () => onPick(node.value as T))
  return node
}

// ---------------------------------------------------------------------------
// Metrics
// ---------------------------------------------------------------------------

export interface Metric {
  value: string | number
  label: string
  /** A colour for the tile's leading edge. */
  accent?: string
  hint?: string
  onClick?: () => void
}

export function metrics(items: Metric[]): HTMLElement {
  const wrap = el('div', 'tiles')
  wrap.style.setProperty('--tile-count', String(items.length))
  for (const item of items) {
    const tile = el(item.onClick ? 'button' : 'div', 'tile')
    if (item.accent) tile.style.setProperty('--tile-accent', item.accent)
    if (item.onClick) {
      tile.classList.add('tile--action')
      tile.addEventListener('click', item.onClick)
    }
    if (item.hint) tile.title = item.hint
    tile.appendChild(el('div', 'tile__value', String(item.value)))
    tile.appendChild(el('div', 'tile__label', item.label))
    wrap.appendChild(tile)
  }
  return wrap
}

export interface HeadStat {
  value: string | number
  label: string
  /** A colour for the number, e.g. a status hue. */
  accent?: string
  title?: string
}

/** Headline numbers for the right of a page or detail header. */
export function headStats(items: HeadStat[]): HTMLElement {
  const wrap = el('div', 'hstats')
  for (const item of items) {
    const cell = el('div', 'hstat')
    const value = el('span', 'hstat__value', String(item.value))
    if (item.accent) value.style.color = item.accent
    cell.appendChild(value)
    cell.appendChild(el('span', 'hstat__label', item.label))
    if (item.title) cell.title = item.title
    wrap.appendChild(cell)
  }
  return wrap
}

/** A proportional bar, one segment per part. */
export function meter(
  parts: { value: number; color: string; title: string }[],
): HTMLElement {
  const total = parts.reduce((sum, part) => sum + part.value, 0)
  const bar = el('div', 'meter')
  if (!total) return bar
  for (const part of parts) {
    if (!part.value) continue
    const segment = el('div', 'meter__part')
    segment.style.width = `${(part.value / total) * 100}%`
    segment.style.background = part.color
    segment.title = part.title
    bar.appendChild(segment)
  }
  return bar
}

/** A group heading with a coloured badge and a count. */
export function groupHead(label: string, count: string, accent?: string): HTMLElement {
  const head = el('div', 'group-head')
  const badge = el('span', 'group-badge', label)
  if (accent) badge.style.setProperty('--chip-accent', accent)
  head.appendChild(badge)
  head.appendChild(el('span', 'group-head__count', count))
  return head
}

/** A stable colour for badges that have no fixed palette, e.g. sequences. */
export function hashHue(name: string): string {
  let hash = 0
  for (let index = 0; index < name.length; index++) {
    hash = (hash * 31 + name.charCodeAt(index)) >>> 0
  }
  return `hsl(${hash % 360} 62% 62%)`
}
