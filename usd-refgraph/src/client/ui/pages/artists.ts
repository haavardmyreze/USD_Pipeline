/**
 * Artist focus: pick a person, see everything they have published, grouped by
 * assets, sets and shots.
 *
 * The roster is whoever has actually published — there is no team list in USD
 * to read one from, so this page is a record of work done, not of who is on
 * the show.
 */

import type { TaskRow } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'
import { STATUS_ALL, STATUS_ORDER, allTasks, byRecency } from '@shared/project'
import {
  STATUS_LABEL,
  TIER_COLOR,
  card,
  dataTable,
  emptyState,
  filterChips,
  groupHead,
  metrics,
  namedCell,
  select,
  statusPill,
  truncated,
} from '../kit'
import { el, formatMoment, formatRelative } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const UNATTRIBUTED = '— no artist —'

const TIERS: { id: NodeTier; label: string }[] = [
  { id: 'asset', label: 'Assets' },
  { id: 'set', label: 'Sets' },
  { id: 'shot', label: 'Shots' },
]

export function renderArtists(host: HTMLElement, context: PageContext): void {
  const state = pageState.artists

  const byArtist = new Map<string, TaskRow[]>()
  for (const task of allTasks(context.project)) {
    const artist = task.layer.pipeline.artist ?? UNATTRIBUTED
    const list = byArtist.get(artist)
    if (list) list.push(task)
    else byArtist.set(artist, [task])
  }

  const artists = [...byArtist.keys()].sort((a, b) => {
    if (a === UNATTRIBUTED) return 1
    if (b === UNATTRIBUTED) return -1
    return a.localeCompare(b)
  })
  if (!state.artist || !byArtist.has(state.artist)) {
    state.artist = artists[0] ?? null
  }

  const controls = el('div', 'page__controls')
  if (artists.length) {
    controls.appendChild(
      select(
        artists.map((artist) => ({
          value: artist,
          label: `${artist}  ·  ${byArtist.get(artist)?.length ?? 0} layers`,
        })),
        state.artist,
        (artist) => {
          state.artist = artist
          context.refresh()
        },
      ),
    )
  }
  controls.appendChild(
    filterChips<Status>(
      'Status',
      STATUS_ALL.map((status) => ({ value: status, label: STATUS_LABEL[status], status })),
      state.hiddenStatus,
      (status) => {
        if (state.hiddenStatus.has(status)) state.hiddenStatus.delete(status)
        else state.hiddenStatus.add(status)
        context.refresh()
      },
    ),
  )

  const body = pageShell(host, 'Artists', {
    subtitle: 'Who published what — read from each layer, not from a roster',
    meta: `${artists.length} ${artists.length === 1 ? 'person' : 'people'}`,
    controls,
  })

  if (!artists.length || !state.artist) {
    body.appendChild(
      emptyState('No published layers found.', {
        icon: 'user',
        body: 'Nothing in this project carries an artist in its layer metadata.',
      }),
    )
    return
  }

  const mine = byArtist.get(state.artist) ?? []
  const visible = mine.filter((task) => !state.hiddenStatus.has(task.layer.pipeline.status))

  body.appendChild(summaryCard(state.artist, mine, visible))

  let shown = 0
  for (const tier of TIERS) {
    const rows = visible.filter((task) => task.entity.tier === tier.id).sort(byRecency)
    if (!rows.length) continue
    shown++
    body.appendChild(tierBlock(tier.id, tier.label, rows))
  }

  if (!shown) {
    body.appendChild(
      emptyState('Nothing matches the current filters.', {
        icon: 'inbox',
        body: 'Switch a status back on to see the rest of their work.',
      }),
    )
  }
}

function summaryCard(artist: string, all: TaskRow[], visible: TaskRow[]): HTMLElement {
  const { root, body } = card(artist, {
    hint: visible.length === all.length
      ? `${all.length} ${all.length === 1 ? 'layer' : 'layers'}`
      : `${visible.length} of ${all.length} layers shown`,
  })

  const items = STATUS_ORDER.map((status) => ({
    value: all.filter((task) => task.layer.pipeline.status === status).length,
    label: STATUS_LABEL[status],
    accent: `var(--status-${status === 'production_ready' ? 'ready' : status})`,
  }))
  for (const tier of TIERS) {
    items.push({
      value: all.filter((task) => task.entity.tier === tier.id).length,
      label: tier.label,
      accent: TIER_COLOR[tier.id]!,
    })
  }
  body.appendChild(metrics(items))
  return root
}

function tierBlock(tier: NodeTier, label: string, rows: TaskRow[]): HTMLElement {
  const block = el('div', 'stack__group')
  block.appendChild(
    groupHead(label, `${rows.length} ${rows.length === 1 ? 'layer' : 'layers'}`, TIER_COLOR[tier]),
  )

  block.appendChild(
    dataTable(
      [
        { label: 'Entity', width: 'minmax(0, 1fr)' },
        { label: 'Step', width: 'minmax(0, 0.7fr)' },
        { label: 'Workfile', width: 'minmax(0, 1.1fr)' },
        { label: 'Comment', width: 'minmax(0, 1.4fr)' },
        { label: 'Status', width: '150px', end: true },
      ],
      rows.map((row) => ({
        title: row.layer.path,
        cells: [
          namedCell(row.entity.name, { status: row.entity.status, strong: true }),
          truncated(row.step, 'mono dim'),
          truncated(row.layer.pipeline.hipFile ?? '—', 'mono dim'),
          truncated(row.layer.pipeline.comment || '—', 'dim'),
          statusCell(row),
        ],
      })),
    ),
  )
  return block
}

function statusCell(row: TaskRow): HTMLElement {
  const wrap = el('span', 'cell-status')
  wrap.appendChild(statusPill(row.layer.pipeline.status, true))
  if (row.layer.pipeline.exportedAt) {
    const when = el('span', 'cell-status__when', formatRelative(row.layer.pipeline.exportedAt))
    when.title = formatMoment(row.layer.pipeline.exportedAt)
    wrap.appendChild(when)
  }
  return wrap
}
