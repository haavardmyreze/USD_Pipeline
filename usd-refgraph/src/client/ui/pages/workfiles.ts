/**
 * Which HIP file writes which layer, as a split browser.
 *
 * Publishing records the workfile and the ROP that produced each layer, so the
 * provenance is already in the files — this just inverts it.
 *
 * Artists version their workfiles as they go, so the list on the left holds
 * one entry per workfile, and the right side runs through its versions newest
 * first as a timeline, each with the layers that version wrote. Treating
 * `_v001` and `_v002` as unrelated files would scatter one person's history of
 * a shot across the page.
 */

import type { TaskRow } from '@shared/project'
import type { WorkfileName } from '@shared/workfile'
import { allTasks } from '@shared/project'
import { byVersionDesc, parseWorkfile, workfileKey } from '@shared/workfile'
import {
  dataTable,
  emptyState,
  headStats,
  namedCell,
  searchField,
  statusPill,
  truncated,
  type HeadStat,
} from '../kit'
import {
  clear,
  el,
  formatMoment,
  formatRelative,
  formatShortMoment,
  matches,
  nextFrame,
} from '../../util'
import { pageState, type PageContext } from './context'

const UNRECORDED = 'no workfile recorded'

/** One version of one workfile, and everything it wrote. */
interface Version {
  name: WorkfileName
  rows: TaskRow[]
}

/** Every version of one workfile, newest first. */
interface Workfile {
  /** The grouping key: the name without its version token. */
  key: string
  /** What to call the family on screen. */
  label: string
  /** True for the bucket holding layers that recorded no workfile at all. */
  unrecorded: boolean
  versions: Version[]
  rows: TaskRow[]
}

export function renderWorkfiles(host: HTMLElement, context: PageContext): void {
  const state = pageState.workfiles
  const workfiles = groupWorkfiles(allTasks(context.project))

  const listScroll = host.querySelector('.split__list')?.scrollTop ?? 0
  const detailScroll = host.querySelector('.split__detail')?.scrollTop ?? 0
  const refocusFilter =
    document.activeElement?.closest('.split__side .search') !== null &&
    host.contains(document.activeElement)

  const visible = workfiles.filter(
    (file) =>
      !state.query ||
      matches(file.label, state.query) ||
      artistsOf(file.rows).some((artist) => matches(artist, state.query)),
  )

  let selected = workfiles.find((file) => file.key === state.selected) ?? null
  if (!selected || !visible.includes(selected)) selected = visible[0] ?? null
  state.selected = selected?.key ?? null

  clear(host)
  const split = el('div', 'split')
  split.appendChild(buildSide(workfiles, visible, selected, context))
  split.appendChild(buildDetail(selected))
  host.appendChild(split)

  split.querySelector('.split__list')!.scrollTop = listScroll
  split.querySelector('.split__detail')!.scrollTop = detailScroll
  if (refocusFilter) {
    const field = split.querySelector<HTMLInputElement>('.split__side input')
    field?.focus()
    field?.setSelectionRange(field.value.length, field.value.length)
  }
}

// ---------------------------------------------------------------------------
// Grouping
// ---------------------------------------------------------------------------

/** Gather layers into workfiles, and each workfile into its versions. */
function groupWorkfiles(tasks: TaskRow[]): Workfile[] {
  const files = new Map<string, Workfile>()

  for (const task of tasks) {
    const recorded = task.layer.pipeline.hipFile
    const parsed = parseWorkfile(recorded ?? UNRECORDED)
    const key = recorded ? workfileKey(parsed) : UNRECORDED

    let file = files.get(key)
    if (!file) {
      file = {
        key,
        label: recorded ? parsed.base || parsed.full : UNRECORDED,
        unrecorded: !recorded,
        versions: [],
        rows: [],
      }
      files.set(key, file)
    }
    file.rows.push(task)

    // Versions are told apart by the token as authored, so a project that
    // mixes `v01` and `v001` keeps them as the two things they are.
    let version = file.versions.find(
      (candidate) => candidate.name.versionLabel === parsed.versionLabel,
    )
    if (!version) {
      version = { name: parsed, rows: [] }
      file.versions.push(version)
    }
    version.rows.push(task)
  }

  for (const file of files.values()) {
    file.versions.sort((a, b) => byVersionDesc(a.name, b.name))
  }

  // Most recently used workfile first; the unrecorded bucket always last.
  return [...files.values()].sort((a, b) => {
    if (a.unrecorded) return 1
    if (b.unrecorded) return -1
    return latest(b.rows) - latest(a.rows)
  })
}

function latest(rows: TaskRow[]): number {
  return Math.max(0, ...rows.map((row) => row.layer.pipeline.exportedAt ?? 0))
}

function artistsOf(rows: TaskRow[]): string[] {
  return [...new Set(rows.map((row) => row.layer.pipeline.artist).filter(Boolean))] as string[]
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function buildSide(
  workfiles: Workfile[],
  visible: Workfile[],
  selected: Workfile | null,
  context: PageContext,
): HTMLElement {
  const state = pageState.workfiles
  const side = el('aside', 'split__side')

  const head = el('div', 'split__sideHead')
  const named = workfiles.filter((file) => !file.unrecorded).length
  head.appendChild(
    searchField({
      placeholder: `Filter ${plural(named, 'workfile')}`,
      value: state.query,
      variant: 'rail',
      onInput: nextFrame((value: string) => {
        state.query = value.trim()
        context.refresh()
      }),
    }),
  )
  side.appendChild(head)

  const list = el('div', 'split__list')
  list.setAttribute('role', 'listbox')
  if (!workfiles.length) {
    list.appendChild(
      emptyState('No published layers found.', {
        inline: true,
        body: 'Publishing records `hip_file` in each layer; nothing here has one yet.',
      }),
    )
  } else if (!visible.length) {
    list.appendChild(emptyState('Nothing matches.', { inline: true }))
  }

  for (const file of visible) list.appendChild(workfileRow(file, file === selected, context))
  side.appendChild(list)
  return side
}

function workfileRow(file: Workfile, on: boolean, context: PageContext): HTMLElement {
  const row = el(
    'button',
    `split__row${on ? ' is-on' : ''}${file.unrecorded ? ' split__row--absent' : ''}`,
  )
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', String(on))

  const text = el('span', 'split__rowText')
  text.appendChild(el('span', `split__rowName${file.unrecorded ? '' : ' split__rowName--mono'}`, file.label))
  const sub = file.unrecorded
    ? [plural(file.rows.length, 'layer'), 'untraceable']
    : [
        artistsOf(file.rows).join(', ') || null,
        plural(file.versions.length, 'version'),
        plural(file.rows.length, 'layer'),
      ].filter(Boolean)
  text.appendChild(el('span', 'split__rowSub', sub.join(' · ')))
  row.appendChild(text)

  const newest = file.versions[0]?.name.versionLabel
  if (!file.unrecorded && newest) {
    const tag = el('span', 'ver', newest)
    tag.title = `Latest version: ${file.versions[0]!.name.full}`
    row.appendChild(tag)
  }

  row.addEventListener('click', () => {
    pageState.workfiles.selected = file.key
    context.refresh()
  })
  return row
}

// ---------------------------------------------------------------------------
// One workfile in full
// ---------------------------------------------------------------------------

function buildDetail(file: Workfile | null): HTMLElement {
  const detail = el('section', 'split__detail')
  if (!file) {
    detail.appendChild(
      emptyState('No workfiles', {
        icon: 'hip',
        body: 'Publishing records `hip_file` in each layer; nothing here has one yet.',
      }),
    )
    return detail
  }

  detail.appendChild(detailHead(file))

  const body = el('div', 'wfl__body')
  if (file.unrecorded) {
    body.appendChild(
      el(
        'p',
        'wfl__note',
        'These layers carry no hip_file, so what produced them cannot be traced. Publish them again from a workfile to fill it in.',
      ),
    )
    body.appendChild(outputs(file.rows))
    detail.appendChild(body)
    return detail
  }

  const timeline = el('div', 'vtl')
  file.versions.forEach((version, index) => {
    timeline.appendChild(versionEntry(version, index === 0))
  })
  body.appendChild(timeline)
  detail.appendChild(body)
  return detail
}

function detailHead(file: Workfile): HTMLElement {
  const head = el('header', 'split__head')

  const title = el('div', 'split__title')
  const line = el('div', 'split__titleLine')
  line.appendChild(
    el('h1', `split__name${file.unrecorded ? '' : ' split__name--mono'}`, file.label),
  )
  const newest = file.versions[0]?.name.versionLabel
  if (!file.unrecorded && newest) line.appendChild(el('span', 'ver ver--latest', `${newest} latest`))
  title.appendChild(line)

  const sub = file.unrecorded
    ? ['Layers that recorded no workfile']
    : [artistsOf(file.rows).join(', '), `last written ${formatRelative(latest(file.rows))}`]
  title.appendChild(el('p', 'split__sub', sub.filter(Boolean).join(' · ')))
  head.appendChild(title)

  const rops = new Set(file.rows.map((row) => row.layer.pipeline.ropPath).filter(Boolean))
  const stats: HeadStat[] = []
  if (!file.unrecorded) {
    stats.push({ value: file.versions.length, label: file.versions.length === 1 ? 'version' : 'versions' })
  }
  stats.push({ value: file.rows.length, label: 'layers written' })
  if (!file.unrecorded) stats.push({ value: rops.size, label: rops.size === 1 ? 'ROP used' : 'ROPs used' })
  head.appendChild(headStats(stats))
  return head
}

/** One version on the timeline: when, how much, and the layers it wrote. */
function versionEntry(version: Version, newest: boolean): HTMLElement {
  const entry = el('section', `vtl__entry${newest ? ' is-newest' : ''}`)

  const when = latest(version.rows)
  const gutter = el('div', 'vtl__gutter')
  gutter.appendChild(el('span', 'vtl__version', version.name.versionLabel ?? 'unversioned'))
  if (when) {
    const ago = el('span', 'vtl__meta', formatRelative(when))
    ago.title = formatMoment(when)
    gutter.appendChild(ago)
  }
  gutter.appendChild(el('span', 'vtl__meta', plural(version.rows.length, 'layer')))
  entry.appendChild(gutter)

  entry.appendChild(el('span', 'vtl__dot'))

  const main = el('div', 'vtl__main')
  const head = el('div', 'vtl__head')
  head.appendChild(truncated(version.name.full, 'vtl__file'))
  if (when) head.appendChild(el('span', 'vtl__date', formatShortMoment(when)))
  main.appendChild(head)
  main.appendChild(outputs(version.rows))
  entry.appendChild(main)
  return entry
}

/** The layers written, the file first: it is what anyone downstream uses. */
function outputs(rows: TaskRow[]): HTMLElement {
  // Sorting by ROP keeps the outputs of one part of the stage together, since
  // ROP paths share a prefix per network.
  const sorted = [...rows].sort(
    (a, b) =>
      (a.layer.pipeline.ropPath ?? '').localeCompare(b.layer.pipeline.ropPath ?? '') ||
      a.entity.name.localeCompare(b.entity.name),
  )

  return dataTable(
    [
      { label: 'Layer written', width: 'minmax(0, 1.2fr)' },
      { label: 'ROP', width: 'minmax(0, 1fr)' },
      { label: 'Entity', width: 'minmax(0, 0.8fr)' },
      { label: 'Status', width: '110px', end: true },
    ],
    sorted.map((row) => ({
      title: row.layer.path,
      layerPath: row.layer.path,
      cells: [
        namedCell(row.layer.name, { mono: true, strong: true }),
        truncated(ropLabel(row.layer.pipeline.ropPath), 'mono dim'),
        truncated(row.entity.name),
        statusPill(row.layer.pipeline.status, true),
      ],
    })),
  )
}

/** `/stage/Bob_Lookdev/mz_usd_rop2` reads better as `Bob_Lookdev / mz_usd_rop2`. */
function ropLabel(path: string | undefined): string {
  if (!path) return '—'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'stage') parts.shift()
  return parts.join(' / ') || path
}
