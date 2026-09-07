/**
 * Which HIP file writes which layer.
 *
 * Publishing records the workfile and the ROP that produced each layer, so the
 * provenance is already in the files — this just inverts it.
 *
 * Artists version their workfiles as they go, so the page groups by the
 * workfile itself and separates by version inside: one box per workfile, one
 * section per version, newest first. Treating `_v001` and `_v002` as unrelated
 * files would scatter one person's history of a shot across the page.
 */

import type { TaskRow } from '@shared/project'
import type { WorkfileName } from '@shared/workfile'
import { allTasks } from '@shared/project'
import { byVersionDesc, parseWorkfile, workfileKey } from '@shared/workfile'
import {
  card,
  countBadge,
  dataTable,
  disclosure,
  emptyState,
  metrics,
  namedCell,
  statusPill,
  truncated,
} from '../kit'
import { ICONS } from '../icons'
import { el, formatMoment, formatRelative, icon } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const UNRECORDED = '— no workfile recorded —'

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
  const tasks = allTasks(context.project)
  const workfiles = groupWorkfiles(tasks)

  const versionCount = workfiles.reduce((sum, file) => sum + file.versions.length, 0)

  const body = pageShell(host, 'Workfiles', {
    subtitle: 'Which HIP file writes which layer',
    meta: `${workfiles.length} ${workfiles.length === 1 ? 'workfile' : 'workfiles'} · ${
      tasks.length
    } layers`,
  })

  if (!workfiles.length) {
    body.appendChild(
      emptyState('No published layers found.', {
        icon: 'hip',
        body: 'Publishing records `hip_file` in each layer; nothing here has one yet.',
      }),
    )
    return
  }

  const untraced = workfiles.find((file) => file.unrecorded)?.rows.length ?? 0
  body.appendChild(summaryCard(workfiles.length, versionCount, tasks.length, untraced))

  // With a single workfile there is nothing to choose between, so open it.
  if (workfiles.length === 1 && state.expanded === null) state.expanded = workfiles[0]!.key

  const stack = el('div', 'stack__list')
  for (const file of workfiles) stack.appendChild(fileBox(file, context))
  body.appendChild(stack)
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

// ---------------------------------------------------------------------------
// Rendering
// ---------------------------------------------------------------------------

function summaryCard(
  workfiles: number,
  versions: number,
  layers: number,
  untraced: number,
): HTMLElement {
  const { root, body } = card('Provenance')
  body.appendChild(
    metrics([
      { value: workfiles, label: workfiles === 1 ? 'Workfile' : 'Workfiles' },
      {
        value: versions,
        label: versions === 1 ? 'Version' : 'Versions',
        hint: 'Every version of every workfile, counted separately',
      },
      { value: layers, label: 'Layers written' },
      {
        value: untraced,
        label: 'Untraceable',
        accent: untraced ? 'var(--warn)' : undefined,
        hint: 'Layers with no hip_file, so what produced them cannot be traced',
      },
    ]),
  )
  return root
}

function fileBox(file: Workfile, context: PageContext): HTMLElement {
  const state = pageState.workfiles
  const open = state.expanded === file.key

  const glyph = icon(ICONS.hip)
  glyph.setAttribute('class', 'ebox__icon')

  const name = el('span', 'ebox__name ebox__name--mono', file.label)
  if (file.unrecorded) name.classList.add('is-absent')

  const lead: Element[] = [glyph, name]

  // The newest version is the one you are most likely to be asked about, so
  // it rides on the collapsed row rather than hiding inside.
  const newest = file.versions[0]
  if (!file.unrecorded && newest?.name.versionLabel) {
    const tag = el('span', 'ver ver--latest', newest.name.versionLabel)
    tag.title = `Latest version: ${newest.name.full}`
    lead.push(tag)
  }

  const artists = artistsOf(file.rows)
  if (artists.length) lead.push(el('span', 'ebox__note', artists.join(', ')))

  const trail: Element[] = []
  if (!file.unrecorded && file.versions.length > 1) {
    const count = countBadge(`${file.versions.length} versions`)
    count.title = file.versions.map((version) => version.name.full).join('\n')
    trail.push(count)
  }
  const when = latest(file.rows)
  if (when) {
    const stamp = el('span', 'ebox__count', formatRelative(when))
    stamp.title = formatMoment(when)
    trail.push(stamp)
  }
  trail.push(
    el(
      'span',
      'ebox__count',
      `${file.rows.length} ${file.rows.length === 1 ? 'layer' : 'layers'}`,
    ),
  )

  return disclosure({
    open,
    dimmed: state.expanded !== null,
    lead,
    trail,
    onToggle: () => {
      state.expanded = open ? null : file.key
      context.refresh()
    },
    panel: () => versionsPanel(file),
  })
}

function versionsPanel(file: Workfile): HTMLElement {
  const panel = el('div', 'epanel')

  if (file.unrecorded) {
    panel.appendChild(
      emptyState('These layers carry no hip_file, so what produced them cannot be traced.', {
        inline: true,
      }),
    )
  }

  for (const version of file.versions) {
    panel.appendChild(versionBlock(file, version))
  }
  return panel
}

function versionBlock(file: Workfile, version: Version): HTMLElement {
  const block = el('div', 'ver-block')

  // An unversioned workfile has exactly one section, and a heading saying
  // "no version" would be noise, so it goes straight to the table.
  if (!file.unrecorded && version.name.versionLabel) {
    const head = el('div', 'ver-block__head')
    head.appendChild(el('span', 'ver', version.name.versionLabel))
    head.appendChild(truncated(version.name.full, 'ver-block__file'))

    const meta = el('span', 'ver-block__meta')
    const artists = artistsOf(version.rows)
    if (artists.length) meta.appendChild(el('span', undefined, artists.join(', ')))

    const when = latest(version.rows)
    if (when) {
      const stamp = el('span', undefined, formatRelative(when))
      stamp.title = formatMoment(when)
      meta.appendChild(stamp)
    }
    meta.appendChild(
      el(
        'span',
        undefined,
        `${version.rows.length} ${version.rows.length === 1 ? 'layer' : 'layers'}`,
      ),
    )
    head.appendChild(meta)
    block.appendChild(head)
  }

  block.appendChild(outputs(version.rows))
  return block
}

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
      { label: 'ROP', width: 'minmax(0, 1fr)' },
      { label: 'Writes', width: 'minmax(0, 1.2fr)' },
      { label: 'Entity', width: 'minmax(0, 0.8fr)' },
      { label: 'Status', width: '120px', end: true },
    ],
    sorted.map((row) => ({
      title: row.layer.path,
      cells: [
        truncated(ropLabel(row.layer.pipeline.ropPath), 'mono dim'),
        namedCell(row.layer.name, { mono: true, strong: true }),
        namedCell(row.entity.name, { status: row.entity.status }),
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
