import '@fontsource-variable/inter/wght.css'
import '@fontsource-variable/inter/wght-italic.css'
import './styles.css'

import { build, modeOf, type Drawing, type Hit } from './diagram'
import { readDirectives } from './directives'
import { EXAMPLES } from './examples'
import { guideMarkup } from './guides'
import { loadIcons } from './icons'
import { setUpPanels } from './panels'
import { moveKeyword, parse, toggleKeyword } from './parse'
import { embed, extract } from './png'
import type { Mode, Options } from './render'
import { loadLook, normalise, saveLook, type Diagram } from './store'
import { highlight } from './syntax'

const $ = <T extends HTMLElement>(id: string): T => {
  const node = document.getElementById(id)
  if (!node) throw new Error(`Missing #${id}`)
  return node as T
}

const ui = {
  examples: $('examples'),
  name: $<HTMLInputElement>('name'),
  source: $<HTMLTextAreaElement>('source'),
  paint: $('paint'),
  gutter: $('gutter'),
  problems: $('problems'),
  help: $('help'),
  helpToggle: $('help-toggle'),
  canvas: $<HTMLCanvasElement>('canvas'),
  art: $('art'),
  hover: $('hover'),
  scroll: $('scroll'),
  size: $('size'),
  title: $<HTMLInputElement>('title'),
  showCount: $<HTMLInputElement>('showCount'),
  showTypes: $<HTMLInputElement>('showTypes'),
  stripes: $<HTMLInputElement>('stripes'),
  legend: $<HTMLInputElement>('legend'),
  grid: $<HTMLInputElement>('grid'),
  app: document.querySelector<HTMLElement>('.app')!,
  minWidth: $<HTMLInputElement>('minWidth'),
  minWidthOut: $('minWidthOut'),
  padding: $<HTMLInputElement>('padding'),
  paddingOut: $('paddingOut'),
  zoom: $('zoom'),
  scale: $('scale'),
  file: $<HTMLInputElement>('file'),
  toast: $('toast'),
}

const measure = document.createElement('canvas').getContext('2d')!

/** What New starts from, and what a mode switch swaps an untouched one for. */
const STARTERS: Record<Mode, string> = {
  tree: 'root  Xform\n  child  Mesh\n',
  graph: [
    'shot.usda  shot  root',
    'shot.usda -> layout.usda  sublayer',
    'shot.usda -> hero.usda  reference',
    'hero.usda  asset  assembly',
    'hero.usda -> hero_geo.usda  payload',
    '',
  ].join('\n'),
}

let current!: Diagram
/** The outline as last opened or saved, to tell whether there is unsaved work. */
let savedSource = ''
let drawing: Drawing | null = null
let zoom = 1
let exportScale = 2

// ---------------------------------------------------------------------------
// Start
// ---------------------------------------------------------------------------

async function start(): Promise<void> {
  await Promise.all([
    loadIcons(),
    // With the arrow and ellipsis, which live outside the Latin subset.
    document.fonts.load(`400 12px "Inter Variable"`, 'Aa←…'),
    document.fonts.load(`italic 400 12px "Inter Variable"`, 'Aa'),
  ])

  zoom = Number(readSetting('zoom', '1')) || 1
  exportScale = Number(readSetting('scale', '2')) || 2

  buildExamples()
  wire()
  setUpPanels(document.querySelector<HTMLElement>('.app')!)
  open(fromExample(1))
}

function fromExample(index: number): Diagram {
  const example = EXAMPLES[index]!
  const diagram = normalise({ name: example.name, source: example.source }, loadLook())
  diagram.options.mode = modeOf(example.source)
  return diagram
}

// ---------------------------------------------------------------------------
// The diagram
// ---------------------------------------------------------------------------

/** Show `diagram` in place of the current one. */
function open(diagram: Diagram): void {
  current = diagram
  savedSource = diagram.source
  ui.name.value = diagram.name
  ui.source.value = diagram.source
  ui.source.scrollTop = 0
  syncOptions()
  update()
}

function isDirty(): boolean {
  return current.source !== savedSource
}

/**
 * Replace the current diagram, asking first if its changes are unsaved.
 * Returns false if the user chose to keep them.
 */
function replace(diagram: Diagram): boolean {
  if (isDirty() && !confirm(`"${current.name}" has changes that are not saved to a PNG. Discard them?`)) {
    return false
  }
  open(diagram)
  return true
}

function buildExamples(): void {
  ui.examples.replaceChildren(
    ...EXAMPLES.map((example, index) => {
      const row = document.createElement('button')
      row.className = 'list__row list__row--muted'
      row.textContent = example.name
      row.addEventListener('click', () => replace(fromExample(index)))
      return row
    }),
  )
}

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function update(): void {
  current.source = ui.source.value
  redraw()
  paintSource()
}

function redraw(): void {
  drawing = build(measure, current.source, current.options)
  drawing.paint(ui.canvas, zoom * (window.devicePixelRatio || 1))
  ui.canvas.style.width = `${drawing.width * zoom}px`
  ui.canvas.style.height = `${drawing.height * zoom}px`
  ui.art.classList.toggle('is-clear', current.options.frame === 'transparent')
  ui.art.classList.toggle('is-light', current.options.theme === 'light')
  ui.size.textContent = `${Math.round(drawing.width * exportScale)} × ${Math.round(drawing.height * exportScale)} px`
  ui.hover.hidden = true
}

function paintSource(): void {
  const lines = current.source.split('\n')
  const problems = drawing?.problems ?? []
  const bad = new Map<number, string>()
  for (const problem of problems) bad.set(problem.line, problem.message)

  const mode = current.options.mode
  // Hierarchy lines only mean something where indentation is the hierarchy.
  const guides = mode === 'tree' ? guideMarkup(parse(current.source).roots) : ''
  ui.paint.innerHTML = `${highlight(current.source, mode)}\n${guides}`
  ui.gutter.replaceChildren(
    ...lines.map((_, index) => {
      const cell = document.createElement('div')
      cell.textContent = String(index + 1)
      const message = bad.get(index)
      if (message) {
        cell.className = 'is-bad'
        cell.title = message
      }
      return cell
    }),
  )
  ui.problems.replaceChildren(
    ...problems.slice(0, 4).map((problem) => {
      const row = document.createElement('button')
      row.className = 'problems__row'
      row.textContent = `Line ${problem.line + 1}: ${problem.message}`
      row.addEventListener('click', () => focusLine(problem.line))
      return row
    }),
  )
  syncScroll()
}

function syncScroll(): void {
  ui.paint.style.transform = `translate(${-ui.source.scrollLeft}px, ${-ui.source.scrollTop}px)`
  ui.gutter.style.transform = `translateY(${-ui.source.scrollTop}px)`
}

// ---------------------------------------------------------------------------
// Options
// ---------------------------------------------------------------------------

function syncOptions(): void {
  const o = current.options
  ui.app.dataset.mode = o.mode
  buildHelp(o.mode)
  for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-option]')) {
    markSeg(seg, String(o[seg.dataset.option as keyof Options]))
  }
  ui.title.value = o.title
  ui.showCount.checked = o.showCount
  ui.showCount.disabled = !o.title
  ui.showTypes.checked = o.showTypes
  ui.stripes.checked = o.stripes
  ui.legend.checked = o.legend
  ui.grid.checked = o.grid
  ui.minWidth.value = String(o.minWidth)
  ui.minWidthOut.textContent = `${o.minWidth}px`
  ui.padding.value = String(o.padding)
  ui.paddingOut.textContent = `${o.padding}px`
  markSeg(ui.zoom, String(zoom))
  markSeg(ui.scale, String(exportScale))
}

function markSeg(seg: HTMLElement, value: string): void {
  for (const button of seg.querySelectorAll<HTMLButtonElement>('button')) {
    const on = button.dataset.value === value
    button.classList.toggle('is-on', on)
    button.setAttribute('aria-pressed', String(on))
  }
}

function setOption<K extends keyof Options>(key: K, value: Options[K]): void {
  if (current.options[key] === value) return
  current.options = { ...current.options, [key]: value }
  saveLook(current.options)
  syncOptions()
  if (key === 'mode') switchMode(value as Mode)
  else redraw()
}

/**
 * The text stays as written when the mode changes, since it may be a tree
 * being turned into a chart by hand. An empty or untouched starter is swapped
 * for the other mode's, so switching on a new diagram shows something useful.
 */
function switchMode(mode: Mode): void {
  const text = ui.source.value
  const untouched = !text.trim() || Object.values(STARTERS).includes(text)
  if (untouched && text !== STARTERS[mode]) {
    const clean = !isDirty()
    ui.source.value = STARTERS[mode]
    if (clean) savedSource = STARTERS[mode]
  }
  update()
}

// ---------------------------------------------------------------------------
// Editor
// ---------------------------------------------------------------------------

/** Replace a range through the browser's editing stack, so Ctrl+Z undoes it. */
function replaceRange(start: number, end: number, text: string): void {
  ui.source.focus()
  ui.source.setSelectionRange(start, end)
  if (!document.execCommand('insertText', false, text)) {
    ui.source.setRangeText(text, start, end, 'end')
    ui.source.dispatchEvent(new Event('input'))
  }
}

/** Replace the whole text, keeping it undoable. */
function replaceAll(text: string, caretLine: number): void {
  const scroll = ui.source.scrollTop
  replaceRange(0, ui.source.value.length, text)
  ui.source.scrollTop = scroll
  focusLine(caretLine, false)
}

function lineStart(text: string, line: number): number {
  let offset = 0
  for (let i = 0; i < line; i++) {
    const next = text.indexOf('\n', offset)
    if (next < 0) return text.length
    offset = next + 1
  }
  return offset
}

function focusLine(line: number, select = true): void {
  const text = ui.source.value
  const start = lineStart(text, line)
  let end = text.indexOf('\n', start)
  if (end < 0) end = text.length
  ui.source.focus()
  const indent = /^\s*/.exec(text.slice(start, end))![0].length
  ui.source.setSelectionRange(select ? start + indent : end, end)
  // Bring the line into view, a few rows from the top.
  const lineHeight = 20
  const top = line * lineHeight
  if (top < ui.source.scrollTop || top > ui.source.scrollTop + ui.source.clientHeight - lineHeight * 2) {
    ui.source.scrollTop = Math.max(0, top - lineHeight * 3)
  }
  syncScroll()
}

function onEditorKey(event: KeyboardEvent): void {
  const input = ui.source
  const { selectionStart: start, selectionEnd: end, value } = input

  if (event.key === 'Tab') {
    event.preventDefault()
    // Indent or outdent every line the selection touches, wherever the caret
    // is on the line: in an outline, Tab means "one level deeper".
    const from = value.lastIndexOf('\n', start - 1) + 1
    let to = value.indexOf('\n', Math.max(start, end - 1))
    if (to < 0) to = value.length
    const lines = value.slice(from, to).split('\n')
    const changed = lines.map((line) =>
      event.shiftKey ? line.replace(/^( {1,2}|\t)/, '') : line || lines.length === 1 ? `  ${line}` : line,
    )
    const text = changed.join('\n')
    if (text === lines.join('\n')) return
    replaceRange(from, to, text)
    const firstDelta = changed[0]!.length - lines[0]!.length
    const lastDelta = text.length - (to - from)
    if (start === end) {
      const caret = Math.max(from, start + firstDelta)
      input.setSelectionRange(caret, caret)
    } else {
      input.setSelectionRange(Math.max(from, start + firstDelta), end + lastDelta)
    }
    return
  }

  if (event.key === 'Enter' && !event.shiftKey && !event.ctrlKey && !event.metaKey) {
    // Keep the current line's indentation.
    event.preventDefault()
    const from = value.lastIndexOf('\n', start - 1) + 1
    const indent = /^[ \t]*/.exec(value.slice(from, start))![0]
    replaceRange(start, end, `\n${indent}`)
  }
}

// ---------------------------------------------------------------------------
// Preview interaction
// ---------------------------------------------------------------------------

function hitFromEvent(event: MouseEvent): Hit | undefined {
  if (!drawing) return undefined
  const box = ui.canvas.getBoundingClientRect()
  return drawing.hit((event.clientX - box.left) / zoom, (event.clientY - box.top) / zoom)
}

function onPreviewMove(event: MouseEvent): void {
  const hit = hitFromEvent(event)
  if (!hit) {
    ui.hover.hidden = true
    ui.canvas.style.cursor = ''
    return
  }
  ui.hover.hidden = false
  ui.canvas.style.cursor = 'pointer'
  const { x, y, w, h, radius } = hit.rect
  Object.assign(ui.hover.style, {
    left: `${x * zoom}px`,
    top: `${y * zoom}px`,
    width: `${w * zoom}px`,
    height: `${h * zoom}px`,
    borderRadius: `${radius * zoom}px`,
  })
}

function onPreviewClick(event: MouseEvent): void {
  const hit = hitFromEvent(event)
  if (!hit || event.detail > 1) return
  if (event.shiftKey) {
    select(hit)
    return
  }
  focusLine(hit.line)
}

/** Move the selection highlight to what was Shift-clicked, or clear it. */
function select(hit: Hit): void {
  const source = ui.source.value
  if (hit.ownLine) {
    replaceAll(moveKeyword(source, hit.line, 'selected', ['*']), hit.line)
    return
  }
  // A chart node only named in arcs gets a line of its own to carry the word.
  const name = /\s/.test(hit.name) ? `"${hit.name}"` : hit.name
  const cleared = moveKeyword(source, -1, 'selected', ['*'])
  const text = `${cleared.replace(/\n*$/, '')}\n${name}  selected\n`
  replaceAll(text, text.split('\n').length - 2)
}

function onPreviewDouble(event: MouseEvent): void {
  const hit = hitFromEvent(event)
  if (!hit?.foldable) return
  replaceAll(toggleKeyword(ui.source.value, hit.line, 'closed'), hit.line)
}

// ---------------------------------------------------------------------------
// Export and import
// ---------------------------------------------------------------------------

async function renderPng(): Promise<Blob> {
  const canvas = document.createElement('canvas')
  build(measure, current.source, current.options).paint(canvas, exportScale)
  const png = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((blob) => (blob ? resolve(blob) : reject(new Error('Could not encode the PNG'))), 'image/png'),
  )
  return embed(png, { name: current.name, source: current.source, options: current.options })
}

async function savePng(): Promise<void> {
  const blob = await renderPng()
  const base = current.name.trim().replace(/[\\/:*?"<>|]+/g, '-').replace(/\s+/g, '_') || (current.options.mode === 'graph' ? 'flowchart' : 'tree')
  const link = document.createElement('a')
  link.href = URL.createObjectURL(blob)
  link.download = `${base}${exportScale === 1 ? '' : `@${exportScale}x`}.png`
  link.click()
  setTimeout(() => URL.revokeObjectURL(link.href), 10_000)
  savedSource = current.source
  toast(`Saved ${link.download}`)
}

async function copyPng(): Promise<void> {
  try {
    await navigator.clipboard.write([new ClipboardItem({ 'image/png': renderPng() })])
    toast('Image copied')
  } catch {
    toast('This browser would not copy the image. Save it instead.', true)
  }
}

async function importFile(file: File): Promise<void> {
  if (file.type === 'image/png' || file.name.toLowerCase().endsWith('.png')) {
    const data = (await extract(file)) as Partial<Diagram> | null
    if (!data || typeof data.source !== 'string') {
      toast(`${file.name} was not saved from this tool, so there is no outline in it.`, true)
      return
    }
    const diagram = normalise(data, loadLook())
    // PNGs saved before flowcharts existed carry no mode.
    diagram.options.mode = modeOf(diagram.source, data.options?.mode)
    if (replace(diagram)) toast(`Opened ${file.name}`)
    return
  }
  const source = await file.text()
  // An outline's own `#!` settings win over the remembered look.
  const stated = readDirectives(source).options
  const look = { ...loadLook(), ...stated, mode: modeOf(source, stated.mode) }
  if (replace(normalise({ name: file.name.replace(/\.[^.]+$/, ''), source }, look))) {
    toast(`Opened ${file.name}`)
  }
}

// ---------------------------------------------------------------------------
// Wiring
// ---------------------------------------------------------------------------

function wire(): void {
  ui.source.addEventListener('input', update)
  ui.source.addEventListener('scroll', syncScroll)
  ui.source.addEventListener('keydown', onEditorKey)

  ui.name.addEventListener('input', () => {
    current.name = ui.name.value.trim() || 'Untitled'
  })

  $('new').addEventListener('click', () => {
    const mode = current.options.mode
    replace(normalise({ name: 'Untitled', source: STARTERS[mode] }, { ...loadLook(), mode }))
  })
  // Nothing is stored, so closing the tab is the one way to lose work.
  window.addEventListener('beforeunload', (event) => {
    if (isDirty()) event.preventDefault()
  })
  $('open').addEventListener('click', () => ui.file.click())
  ui.file.addEventListener('change', () => {
    const file = ui.file.files?.[0]
    if (file) void importFile(file)
    ui.file.value = ''
  })

  ui.helpToggle.addEventListener('click', () => {
    ui.help.hidden = !ui.help.hidden
    ui.helpToggle.setAttribute('aria-pressed', String(!ui.help.hidden))
  })

  for (const seg of document.querySelectorAll<HTMLElement>('.seg[data-option]')) {
    seg.addEventListener('click', (event) => {
      const value = (event.target as HTMLElement).closest('button')?.dataset.value
      if (value) setOption(seg.dataset.option as 'theme' | 'frame' | 'mode', value as never)
    })
  }
  ui.zoom.addEventListener('click', (event) => {
    const value = (event.target as HTMLElement).closest('button')?.dataset.value
    if (!value) return
    zoom = Number(value)
    writeSetting('zoom', value)
    syncOptions()
    redraw()
  })
  ui.scale.addEventListener('click', (event) => {
    const value = (event.target as HTMLElement).closest('button')?.dataset.value
    if (!value) return
    exportScale = Number(value)
    writeSetting('scale', value)
    syncOptions()
    redraw()
  })

  ui.title.addEventListener('input', () => setOption('title', ui.title.value))
  ui.showCount.addEventListener('change', () => setOption('showCount', ui.showCount.checked))
  ui.showTypes.addEventListener('change', () => setOption('showTypes', ui.showTypes.checked))
  ui.stripes.addEventListener('change', () => setOption('stripes', ui.stripes.checked))
  ui.legend.addEventListener('change', () => setOption('legend', ui.legend.checked))
  ui.grid.addEventListener('change', () => setOption('grid', ui.grid.checked))
  ui.minWidth.addEventListener('input', () => setOption('minWidth', Number(ui.minWidth.value)))
  ui.padding.addEventListener('input', () => setOption('padding', Number(ui.padding.value)))

  $('export').addEventListener('click', () => void savePng())
  $('copy').addEventListener('click', () => void copyPng())

  ui.canvas.addEventListener('mousemove', onPreviewMove)
  ui.canvas.addEventListener('mouseleave', () => (ui.hover.hidden = true))
  ui.canvas.addEventListener('click', onPreviewClick)
  ui.canvas.addEventListener('dblclick', onPreviewDouble)

  // Drop a PNG or an outline anywhere.
  window.addEventListener('dragover', (event) => {
    event.preventDefault()
    document.body.classList.add('is-dropping')
  })
  window.addEventListener('dragleave', (event) => {
    if (!event.relatedTarget) document.body.classList.remove('is-dropping')
  })
  window.addEventListener('drop', (event) => {
    event.preventDefault()
    document.body.classList.remove('is-dropping')
    const file = event.dataTransfer?.files[0]
    if (file) void importFile(file)
  })

  window.addEventListener('keydown', (event) => {
    if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 's') {
      event.preventDefault()
      void savePng()
    }
  })

  // A different monitor or browser zoom changes the device pixel ratio.
  matchMedia(`(resolution: ${window.devicePixelRatio}dppx)`).addEventListener('change', redraw, { once: true })
}

const HELP: Record<Mode, [string, string][]> = {
  tree: [
    ['name  Type', 'One prim per line. Indent to nest.'],
    ['kind=component', 'Kind; stars replace the icon on Xform and Scope'],
    ['+ref  +payload  +unloaded', 'Composition arc flags'],
    ['+inherit  +specialize  +relocate', 'Arcs shown as words'],
    ['+instance', 'Instanceable'],
    ['{set=value}', 'Variant selection; several are counted'],
    ['over  class', 'Specifier, drawn in italics'],
    ['inactive  proxy', 'Struck through, or dimmed'],
    ['closed', 'Closed chevron; children hidden'],
    ['selected  or  *', 'Blue selection highlight'],
    ['icon=camera', 'Any Houdini icon, by type or file name'],
    ['"text"', 'A callout to the right of the row'],
    ['... 12 more', 'A grey note row'],
    ['# comment', 'Ignored'],
  ],
  graph: [
    ['a -> b  reference', 'An arc; the word after names its kind'],
    ['a -> b -> c', 'A chain of arcs (sublayer when unnamed)'],
    ['sublayer  ref  payload', 'Arc kinds, each with its own line'],
    ['clip  texture  other', 'More arc kinds'],
    ['"Hero asset" -> b', 'Quote names with spaces'],
    ['a  asset  set  shot', 'A node line: the tier tint'],
    ['a  color=blue', 'Or: green red yellow pink teal indigo gray'],
    ['a  root', 'The blue root outline'],
    ['a  assembly  block', 'Bold with the layers mark, or quieter'],
    ['a  missing  template', 'Dashed red card, or the placeholder mark'],
    ['a  status=ready  artist=anna', 'Status dot (placeholder, ready, locked) and a name'],
    ['a  "second line"', 'Text under the name'],
    ['a  icon=camera', 'A Houdini icon before the name'],
    ['a  selected', 'The selection outline'],
    ['# comment', 'Ignored'],
  ],
}

function buildHelp(mode: Mode): void {
  const table = document.createElement('dl')
  for (const [code, text] of HELP[mode]) {
    const dt = document.createElement('dt')
    dt.innerHTML = highlight(code, mode)
    const dd = document.createElement('dd')
    dd.textContent = text
    table.append(dt, dd)
  }
  ui.help.replaceChildren(table)
}

// ---------------------------------------------------------------------------
// Small things
// ---------------------------------------------------------------------------

let toastTimer = 0
function toast(message: string, error = false): void {
  ui.toast.textContent = message
  ui.toast.classList.toggle('is-error', error)
  ui.toast.hidden = false
  clearTimeout(toastTimer)
  toastTimer = window.setTimeout(() => (ui.toast.hidden = true), 2800)
}

function readSetting(key: string, fallback: string): string {
  try {
    return localStorage.getItem(`usd-treediagram:${key}`) ?? fallback
  } catch {
    return fallback
  }
}

function writeSetting(key: string, value: string): void {
  try {
    localStorage.setItem(`usd-treediagram:${key}`, value)
  } catch {
    // Not remembered; nothing else depends on it.
  }
}

void start()
