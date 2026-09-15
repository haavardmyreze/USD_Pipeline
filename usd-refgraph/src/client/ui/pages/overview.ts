/**
 * The project at a glance, across its whole span: how finished it is, and
 * whether anything needs a look — nothing more.
 *
 * Every number here is a door to the page that holds the detail. The
 * Workspace has every file, Publishes has every publish, Artists has every
 * person; this page only says which of them is worth opening, so it stays
 * readable however large the show grows.
 *
 * Readiness counts entities, never layers. Mixing the two units invites
 * comparing numbers that do not compare.
 */

import type { Project, ProjectEntity, TaskRow } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'
import { STATUS_ORDER, allTasks } from '@shared/project'
import { STATUS_COLOR, STATUS_LABEL, TIER_COLOR, emptyState, meter, statusDot } from '../kit'
import { displayName, el, formatMoment, formatRelative } from '../../util'
import { pageState, type PageContext, type PageName } from './context'
import { pageShell } from './shell'

const TIERS: { id: NodeTier; one: string; many: string }[] = [
  { id: 'asset', one: 'asset', many: 'Assets' },
  { id: 'set', one: 'set', many: 'Sets' },
  { id: 'shot', one: 'shot', many: 'Shots' },
]

/** Statuses that mean "safe to build on". */
const READY: Status[] = ['production_ready', 'locked']

export function renderOverview(host: HTMLElement, context: PageContext): void {
  const { project } = context
  const tasks = allTasks(project)
  const people = new Set(tasks.map((task) => task.layer.pipeline.artist).filter(Boolean))

  const body = pageShell(host, displayName(project.name), {
    subtitle: [
      plural(project.entities.length, 'entity', 'entities'),
      plural(project.stats.layers, 'published layer'),
      plural(people.size, 'person', 'people'),
    ].join(' · '),
  })

  if (!project.entities.length) {
    body.appendChild(
      emptyState('Nothing published yet.', {
        icon: 'inbox',
        body: 'The scan looks for assets, sets and shots directly under the project root.',
      }),
    )
    return
  }

  body.appendChild(readiness(project.entities))

  const tiers = el('div', 'ov__row ov__row--three')
  for (const tier of TIERS) tiers.appendChild(tierTile(project, tier, context))
  body.appendChild(tiers)

  const signals = el('div', 'ov__row ov__row--three')
  signals.appendChild(missingTile(tasks))
  signals.appendChild(publishesTile(tasks, context))
  signals.appendChild(peopleTile(tasks, context))
  body.appendChild(signals)
}

// ---------------------------------------------------------------------------
// How finished is it?
// ---------------------------------------------------------------------------

function readiness(entities: ProjectEntity[]): HTMLElement {
  const total = entities.length
  const ready = entities.filter((entity) => READY.includes(entity.status)).length
  const percent = Math.round((ready / total) * 100)

  const card = el('section', 'ov__hero')
  const lead = el('div', 'ov__heroLead')
  lead.appendChild(el('span', 'ov__heroValue', `${percent}%`))
  const words = el('div', 'ov__heroWords')
  words.appendChild(el('span', 'ov__heroTitle', 'ready to build on'))
  words.appendChild(
    el('span', 'ov__heroSub', `${ready} of ${plural(total, 'entity', 'entities')} are production ready or locked`),
  )
  lead.appendChild(words)
  card.appendChild(lead)

  card.appendChild(statusMeter(entities))

  const legend = el('div', 'ov__legend')
  for (const status of STATUS_ORDER) {
    const count = entities.filter((entity) => entity.status === status).length
    const item = el('span', 'ov__legendItem')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status]))
    item.appendChild(el('span', 'ov__legendCount', String(count)))
    legend.appendChild(item)
  }
  card.appendChild(legend)
  return card
}

function tierTile(
  project: Project,
  tier: (typeof TIERS)[number],
  context: PageContext,
): HTMLElement {
  const entities = project.entities.filter((entity) => entity.tier === tier.id)
  const ready = entities.filter((entity) => READY.includes(entity.status)).length

  const tile = doorTile(`Open ${tier.many.toLowerCase()} in the workspace`, () => {
    pageState.workspace.tier = tier.id
    pageState.workspace.selected = null
    pageState.workspace.query = ''
    context.goTo('workspace')
  })
  tile.style.setProperty('--tile-accent', TIER_COLOR[tier.id]!)

  tile.appendChild(el('span', 'ov__label', tier.many))
  tile.appendChild(el('span', 'ov__value', String(entities.length)))
  if (entities.length) {
    tile.appendChild(statusMeter(entities))
    tile.appendChild(el('span', 'ov__note', `${ready} of ${entities.length} ready`))
  } else {
    tile.appendChild(el('span', 'ov__note', `No ${tier.one}s yet`))
  }
  return tile
}

// ---------------------------------------------------------------------------
// Does anything need a look?
// ---------------------------------------------------------------------------

function missingTile(tasks: TaskRow[]): HTMLElement {
  const missing = new Set<string>()
  const layers = new Set<string>()
  for (const task of tasks) {
    for (const texture of task.layer.textures ?? []) {
      if (texture.exists || texture.template) continue
      missing.add(texture.path)
      layers.add(task.layer.path)
    }
  }

  const tile = el('div', `ov__tile${missing.size ? ' ov__tile--alert' : ''}`)
  tile.appendChild(el('span', 'ov__label', 'Missing files'))
  tile.appendChild(el('span', 'ov__value', String(missing.size)))
  tile.appendChild(
    el(
      'span',
      'ov__note',
      missing.size
        ? `referenced by ${plural(layers.size, 'layer')} but not on disk`
        : 'every referenced file is on disk',
    ),
  )
  return tile
}

/** Every publish the project holds, and the span of time they cover. */
function publishesTile(tasks: TaskRow[], context: PageContext): HTMLElement {
  const times = tasks
    .map((task) => task.layer.pipeline.exportedAt)
    .filter((at): at is number => Boolean(at))
  const first = times.length ? Math.min(...times) : 0
  const last = times.length ? Math.max(...times) : 0

  const tile = doorTile('Open the publish history', () => context.goTo('calendar' satisfies PageName))
  tile.appendChild(el('span', 'ov__label', 'Publishes'))
  tile.appendChild(el('span', 'ov__value', String(times.length)))
  const note = el(
    'span',
    'ov__note',
    times.length
      ? `since ${formatDay(first)} · latest ${formatRelative(last)}`
      : 'nothing carries a publish time',
  )
  if (times.length) note.title = `First ${formatMoment(first)}\nLatest ${formatMoment(last)}`
  tile.appendChild(note)
  return tile
}

/** Everyone who has published, and who has published most. */
function peopleTile(tasks: TaskRow[], context: PageContext): HTMLElement {
  const counts = new Map<string, number>()
  for (const task of tasks) {
    const artist = task.layer.pipeline.artist
    if (artist) counts.set(artist, (counts.get(artist) ?? 0) + 1)
  }
  const busiest = [...counts.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0]

  const tile = doorTile('Open artists', () => {
    pageState.artists.artist = null
    context.goTo('artists')
  })
  tile.appendChild(el('span', 'ov__label', 'People'))
  tile.appendChild(el('span', 'ov__value', String(counts.size)))
  tile.appendChild(
    el(
      'span',
      'ov__note',
      busiest ? `most published: ${busiest[0]}, ${plural(busiest[1], 'layer')}` : 'no artist recorded',
    ),
  )
  return tile
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** A tile that opens the page holding its detail. */
function doorTile(title: string, onClick: () => void): HTMLButtonElement {
  const tile = el('button', 'ov__tile ov__tile--door')
  tile.title = title
  tile.addEventListener('click', onClick)
  return tile
}

function statusMeter(entities: ProjectEntity[]): HTMLElement {
  return meter(
    STATUS_ORDER.map((status) => {
      const value = entities.filter((entity) => entity.status === status).length
      return { value, color: STATUS_COLOR[status], title: `${value} ${STATUS_LABEL[status].toLowerCase()}` }
    }),
  )
}

/** `2 Sep 2026`: a day, without the time. */
function formatDay(ms: number): string {
  return new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' })
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
