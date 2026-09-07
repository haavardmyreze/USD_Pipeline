/**
 * Artist focus: pick a person, see everything they have published, grouped by
 * assets, sets and shots.
 */

import type { Project, Status, TaskRow } from '@shared/project'
import { STATUS_ORDER, allTasks } from '@shared/project'
import type { NodeTier } from '@shared/types'
import { STATUS_LABEL, formatMoment, relativeDay, statusDot, statusPill } from '../../pipeline'
import { el } from '../../util'
import { pageShell } from './shell'

const UNATTRIBUTED = '— no artist —'

const TIERS: { id: NodeTier; label: string }[] = [
  { id: 'asset', label: 'assets' },
  { id: 'set', label: 'sets' },
  { id: 'shot', label: 'shots' },
]

let selectedArtist: string | null = null
let hidden = new Set<Status>()

export function renderArtists(host: HTMLElement, project: Project): void {
  const rerender = (): void => renderArtists(host, project)

  const byArtist = new Map<string, TaskRow[]>()
  for (const task of allTasks(project)) {
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
  if (!selectedArtist || !byArtist.has(selectedArtist)) {
    selectedArtist = artists[0] ?? null
  }

  const controls = el('div', 'focus-controls')
  if (artists.length) {
    controls.appendChild(artistSelect(artists, byArtist, rerender))
  }
  controls.appendChild(statusFilter(rerender))

  const body = pageShell(host, 'Artist Focus', { controls })

  if (!artists.length || !selectedArtist) {
    const card = el('section', 'card')
    card.appendChild(el('p', 'muted', 'No published layers found.'))
    body.appendChild(card)
    return
  }

  const mine = byArtist.get(selectedArtist) ?? []
  const visible = mine.filter((task) => !hidden.has(task.layer.pipeline.status))

  body.appendChild(summaryCard(selectedArtist, mine, visible))

  let anyShown = false
  for (const tier of TIERS) {
    const rows = visible.filter((task) => task.entity.tier === tier.id).sort(byRecency)
    if (!rows.length) continue
    anyShown = true
    body.appendChild(tierBlock(tier.id, tier.label, rows))
  }

  if (!anyShown) {
    const card = el('section', 'card')
    card.appendChild(el('p', 'muted', 'Nothing matches the current filters.'))
    body.appendChild(card)
  }
}

function byRecency(a: TaskRow, b: TaskRow): number {
  return (b.layer.pipeline.exportedAt ?? 0) - (a.layer.pipeline.exportedAt ?? 0)
}

function artistSelect(
  artists: string[],
  byArtist: Map<string, TaskRow[]>,
  rerender: () => void,
): HTMLElement {
  const select = document.createElement('select')
  select.className = 'select'
  for (const artist of artists) {
    const option = document.createElement('option')
    option.value = artist
    option.textContent = `${artist}  ·  ${byArtist.get(artist)?.length ?? 0}`
    if (artist === selectedArtist) option.selected = true
    select.appendChild(option)
  }
  select.addEventListener('change', () => {
    selectedArtist = select.value
    rerender()
  })
  return select
}

function statusFilter(rerender: () => void): HTMLElement {
  const wrap = el('div', 'filterbar')
  wrap.appendChild(el('span', 'filterbar__label', 'Status'))

  for (const status of [...STATUS_ORDER, 'unknown'] as Status[]) {
    const button = el('button', 'filterchip')
    if (!hidden.has(status)) button.classList.add('is-on')
    button.appendChild(statusDot(status))
    button.appendChild(el('span', undefined, STATUS_LABEL[status]))
    button.addEventListener('click', () => {
      if (hidden.has(status)) hidden.delete(status)
      else hidden.add(status)
      rerender()
    })
    wrap.appendChild(button)
  }
  return wrap
}

function summaryCard(artist: string, all: TaskRow[], visible: TaskRow[]): HTMLElement {
  const card = el('section', 'card')

  const head = el('div', 'summary__head')
  head.appendChild(el('h2', 'summary__name', artist))
  head.appendChild(
    el('span', 'summary__count', `${visible.length} visible / ${all.length} total`),
  )
  card.appendChild(head)

  const counts = el('div', 'summary__grid')
  const add = (label: string, value: number): void => {
    const cell = el('div', 'summary__cell')
    cell.appendChild(el('span', 'summary__label', label))
    cell.appendChild(el('span', 'summary__value', String(value)))
    counts.appendChild(cell)
  }
  for (const status of STATUS_ORDER) {
    add(STATUS_LABEL[status], all.filter((t) => t.layer.pipeline.status === status).length)
  }
  for (const tier of TIERS) {
    add(
      tier.label[0]!.toUpperCase() + tier.label.slice(1),
      all.filter((t) => t.entity.tier === tier.id).length,
    )
  }
  card.appendChild(counts)
  return card
}

function tierBlock(tier: NodeTier, label: string, rows: TaskRow[]): HTMLElement {
  const block = el('div', 'stack__group')

  const head = el('div', 'group-head')
  head.appendChild(el('span', `group-badge group-badge--${tier}`, label))
  head.appendChild(
    el('span', 'group-head__count', `${rows.length} ${rows.length === 1 ? 'layer' : 'layers'}`),
  )
  block.appendChild(head)

  const columns = el('div', 'taskrow taskrow--head')
  for (const name of ['Entity', 'Step', 'HIP file', 'Status', 'Comment']) {
    columns.appendChild(el('span', undefined, name))
  }
  block.appendChild(columns)

  const list = el('div', 'stack__list')
  for (const row of rows) list.appendChild(taskRow(row))
  block.appendChild(list)
  return block
}

function taskRow(row: TaskRow): HTMLElement {
  const line = el('div', 'taskrow taskrow--item')

  const entity = el('span', 'taskrow__entity')
  entity.appendChild(statusDot(row.entity.status))
  entity.appendChild(el('span', undefined, row.entity.name))
  line.appendChild(entity)

  const step = el('span', 'taskrow__step', row.step)
  step.title = row.layer.path
  line.appendChild(step)

  const hip = el('span', 'taskrow__hip', row.layer.pipeline.hipFile ?? '—')
  hip.title = row.layer.pipeline.hipFile ?? ''
  line.appendChild(hip)

  const status = el('span', 'taskrow__status')
  status.appendChild(statusPill(row.layer.pipeline.status))
  if (row.layer.pipeline.exportedAt) {
    const when = el('span', 'taskrow__when', relativeDay(row.layer.pipeline.exportedAt))
    when.title = formatMoment(row.layer.pipeline.exportedAt)
    status.appendChild(when)
  }
  line.appendChild(status)

  const comment = el('span', 'taskrow__comment', row.layer.pipeline.comment || '—')
  comment.title = row.layer.pipeline.comment ?? ''
  line.appendChild(comment)

  return line
}
