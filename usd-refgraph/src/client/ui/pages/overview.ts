/**
 * The project at a glance: every entity and every file it has published, on
 * one board, then what is missing and what happened today.
 *
 * The board is a strip per entity rather than a grid of steps. Blocks are
 * free-form — any token after the entity name — so no two entities need share
 * any, and a column per step would be mostly empty cells and names that only
 * one entity uses. A strip shows exactly the files each entity has, labelled
 * with the block names as written.
 */

import type { ProjectEntity, TaskRow, TextureRef } from '@shared/project'
import type { NodeTier } from '@shared/types'
import { STATUS_ORDER, allTasks, byRecency, entityLayers, entitySort, layerStep } from '@shared/project'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TIER_COLOR,
  card,
  emptyState,
  headStats,
  markLayer,
  statusDot,
  statusStrip,
  truncated,
} from '../kit'
import { displayName, el, formatMoment, formatRelative } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const TIERS: { id: NodeTier; label: string }[] = [
  { id: 'asset', label: 'Assets' },
  { id: 'set', label: 'Sets' },
  { id: 'shot', label: 'Shots' },
]

/** How far back "today" reaches: the last day, not the calendar date. */
const TODAY_MS = 86_400_000

export function renderOverview(host: HTMLElement, context: PageContext): void {
  const { project } = context
  const entities = project.entities
  const count = (status: string): number => entities.filter((e) => e.status === status).length
  const missing = missingTextures(allTasks(project))

  const body = pageShell(host, displayName(project.name), {
    subtitle: [
      `${entities.length} ${entities.length === 1 ? 'entity' : 'entities'}`,
      `${project.stats.layers} published ${project.stats.layers === 1 ? 'layer' : 'layers'}`,
      `scanned in ${Math.round(project.stats.elapsedMs)} ms`,
    ].join(' · '),
    stats: headStats([
      { value: count('placeholder'), label: 'still placeholder', accent: STATUS_COLOR.placeholder },
      { value: count('production_ready'), label: 'ready to build on', accent: STATUS_COLOR.production_ready },
      { value: count('locked'), label: 'signed off', accent: STATUS_COLOR.locked },
      {
        value: missing.length,
        label: missing.length === 1 ? 'missing file' : 'missing files',
        accent: missing.length ? 'var(--danger)' : undefined,
      },
    ]),
  })

  if (!entities.length) {
    body.appendChild(
      emptyState('Nothing published yet.', {
        icon: 'inbox',
        body: 'The scan looks for assets, sets and shots directly under the project root.',
      }),
    )
    return
  }

  body.appendChild(boardCard(entities, context))

  const bottom = el('div', 'grid grid--split')
  bottom.appendChild(missingCard(missing))
  bottom.appendChild(todayCard(allTasks(project)))
  body.appendChild(bottom)
}

// ---------------------------------------------------------------------------
// The board
// ---------------------------------------------------------------------------

function boardCard(entities: ProjectEntity[], context: PageContext): HTMLElement {
  const legend = el('div', 'legendkey')
  for (const status of STATUS_ORDER) {
    const item = el('span', 'legendkey__item')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status].toLowerCase()))
    legend.appendChild(item)
  }

  const { root, body } = card('Publish board', {
    hint: 'every entity, every published file',
    actions: legend,
  })

  const board = el('div', 'board')
  for (const tier of TIERS) {
    const members = entities.filter((entity) => entity.tier === tier.id).sort(entitySort)
    if (!members.length) continue

    // Shots split by sequence, the way a show is actually organised.
    const groups = new Map<string, ProjectEntity[]>()
    for (const entity of members) {
      const label = tier.id === 'shot' && entity.sequence ? `${tier.label} · ${entity.sequence}` : tier.label
      const list = groups.get(label)
      if (list) list.push(entity)
      else groups.set(label, [entity])
    }

    for (const [label, list] of groups) {
      const head = el('div', 'board__group')
      const badge = el('span', 'group-badge', label)
      badge.style.setProperty('--chip-accent', TIER_COLOR[tier.id]!)
      head.appendChild(badge)
      board.appendChild(head)
      for (const entity of list) board.appendChild(boardRow(entity, context))
    }
  }
  body.appendChild(board)
  return root
}

function boardRow(entity: ProjectEntity, context: PageContext): HTMLElement {
  const row = el('div', 'board__row')

  const name = el('button', 'board__name')
  name.appendChild(statusDot(entity.status))
  name.appendChild(el('span', undefined, entity.name))
  name.title = `Open ${entity.name} in the workspace`
  name.addEventListener('click', () => {
    pageState.workspace.selected = entity.name
    pageState.workspace.tier = 'all'
    pageState.workspace.query = ''
    context.goTo('workspace')
  })
  row.appendChild(name)

  const files = entityLayers(entity)
  if (files.length) {
    row.appendChild(
      statusStrip(
        files.map((file) => ({ status: file.pipeline.status, label: layerStep(file), layerPath: file.path })),
        true,
      ),
    )
  } else {
    row.appendChild(el('span', 'board__empty', 'nothing published'))
  }

  const last = entity.lastPublished
  const when = el('span', 'board__when', last ? formatRelative(last) : '—')
  if (last) when.title = formatMoment(last)
  row.appendChild(when)
  return row
}

// ---------------------------------------------------------------------------
// Missing and today
// ---------------------------------------------------------------------------

interface MissingFile {
  texture: TextureRef
  /** The layers that point at it. */
  referencedBy: TaskRow[]
}

/** Every texture a layer points at that is not on disk, once each. */
function missingTextures(tasks: TaskRow[]): MissingFile[] {
  const byPath = new Map<string, MissingFile>()
  for (const task of tasks) {
    for (const texture of task.layer.textures ?? []) {
      if (texture.exists || texture.template) continue
      const entry = byPath.get(texture.path)
      if (entry) entry.referencedBy.push(task)
      else byPath.set(texture.path, { texture, referencedBy: [task] })
    }
  }
  return [...byPath.values()].sort((a, b) => a.texture.name.localeCompare(b.texture.name))
}

function missingCard(missing: MissingFile[]): HTMLElement {
  const { root, body } = card('Missing files', {
    hint: missing.length ? 'referenced, but not on disk' : undefined,
  })
  if (!missing.length) {
    body.appendChild(emptyState('Every referenced texture is on disk.', { inline: true }))
    return root
  }

  const list = el('div', 'feed')
  for (const { texture, referencedBy } of missing) {
    const first = referencedBy[0]!
    const row = markLayer(el('div', 'feed__row feed__row--missing'), first.layer.path)
    row.appendChild(el('span', 'feed__icon', '!'))
    const main = el('div', 'feed__main')
    main.appendChild(truncated(texture.name, 'feed__name mono'))
    main.appendChild(
      el(
        'span',
        'feed__by',
        `in ${referencedBy.map((task) => task.layer.name).join(', ')}`,
      ),
    )
    row.appendChild(main)
    row.appendChild(el('span', 'feed__when', first.entity.name))
    row.title = `${texture.rawPath}\nOpen ${first.layer.name}`
    list.appendChild(row)
  }
  body.appendChild(list)
  return root
}

function todayCard(tasks: TaskRow[]): HTMLElement {
  const since = Date.now() - TODAY_MS
  const today = tasks
    .filter((task) => (task.layer.pipeline.exportedAt ?? 0) >= since)
    .sort(byRecency)
  const people = new Set(today.map((task) => task.layer.pipeline.artist).filter(Boolean))

  const { root, body } = card('Today', {
    hint: today.length
      ? `${today.length} ${today.length === 1 ? 'publish' : 'publishes'} · ${people.size} ${
          people.size === 1 ? 'person' : 'people'
        }`
      : 'the last 24 hours',
  })

  if (!today.length) {
    const latest = [...tasks].sort(byRecency)[0]
    body.appendChild(
      emptyState('Nothing published in the last day.', {
        inline: true,
        body: latest?.layer.pipeline.exportedAt
          ? `The latest was ${latest.entity.name} · ${latest.step}, ${formatRelative(latest.layer.pipeline.exportedAt)}.`
          : undefined,
      }),
    )
    return root
  }

  const list = el('div', 'feed')
  for (const task of today) {
    const row = markLayer(el('div', 'feed__row'), task.layer.path)
    row.appendChild(statusDot(task.layer.pipeline.status))
    const main = el('div', 'feed__main feed__main--inline')
    main.appendChild(truncated(`${task.entity.name} · ${task.step}`, 'feed__name'))
    if (task.layer.pipeline.artist) main.appendChild(el('span', 'feed__by', task.layer.pipeline.artist))
    row.appendChild(main)
    const at = task.layer.pipeline.exportedAt!
    const time = el(
      'span',
      'feed__when',
      new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
    )
    time.title = formatMoment(at)
    row.appendChild(time)
    row.title = task.layer.path
    list.appendChild(row)
  }
  body.appendChild(list)
  return root
}
