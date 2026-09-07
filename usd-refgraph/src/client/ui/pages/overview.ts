/**
 * The project at a glance.
 *
 * Read top to bottom it answers four questions in order: how big is this, how
 * finished is it, what is holding it up, and what has been happening. Each
 * widget answers exactly one of them, which is what keeps the page scannable —
 * a panel that answers two questions tends to answer neither.
 *
 * Everything here counts **entities**, not layers. Mixing the two units is a
 * quick way to make a summary unreadable: "10 of 17" and "15 of 55" on the
 * same screen invite you to compare numbers that do not compare.
 */

import type { Project, ProjectEntity, TaskRow } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'
import { STATUS_ALL, allTasks, byRecency } from '@shared/project'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TIER_COLOR,
  button,
  card,
  emptyState,
  meter,
  statusDot,
  statusPill,
  truncated,
} from '../kit'
import { el, formatRelative } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

/** How many rows a widget shows before it defers to a fuller page. */
const PREVIEW_ROWS = 6

const TIERS: { id: NodeTier; label: string }[] = [
  { id: 'asset', label: 'Assets' },
  { id: 'set', label: 'Sets' },
  { id: 'shot', label: 'Shots' },
]

/** Statuses that mean "safe to build on". */
const READY: Status[] = ['production_ready', 'locked']

export function renderOverview(host: HTMLElement, context: PageContext): void {
  const { project } = context
  const body = pageShell(host, 'Overview', {
    subtitle: project.name.replace(/[_-]/g, ' '),
    meta: `scanned in ${Math.round(project.stats.elapsedMs)} ms`,
  })

  body.appendChild(hero(context))

  const state = el('div', 'grid grid--lead')
  state.appendChild(readinessCard(project))
  state.appendChild(attentionCard(context))
  body.appendChild(state)

  const activity = el('div', 'grid grid--split')
  activity.appendChild(recentCard(context))
  activity.appendChild(artistsCard(context))
  body.appendChild(activity)

  const structure = el('div', 'grid grid--lead')
  structure.appendChild(sequencesCard(project))
  structure.appendChild(dependencyCard(project))
  body.appendChild(structure)
}

// ---------------------------------------------------------------------------
// How big is this?
// ---------------------------------------------------------------------------

/**
 * The three tiers, large, and everything else small beside them.
 *
 * Six equal numbers in a row is six numbers with no hierarchy — you read all
 * of them or none of them. The tiers are the shape of the project, so they get
 * the size; the rest are supporting facts and read as such.
 */
function hero(context: PageContext): HTMLElement {
  const { stats } = context.project
  const wrap = el('div', 'hero')

  const primary = el('div', 'hero__primary')
  for (const tier of TIERS) {
    const count = stats[`${tier.id}s` as 'assets' | 'sets' | 'shots']

    const stat = el('button', 'hero__stat')
    stat.style.setProperty('--tile-accent', TIER_COLOR[tier.id]!)
    stat.title = `Open the workspace on ${tier.label.toLowerCase()}`
    stat.appendChild(el('span', 'hero__value', String(count)))
    stat.appendChild(
      el('span', 'hero__label', count === 1 ? tier.label.replace(/s$/, '') : tier.label),
    )
    stat.addEventListener('click', () => {
      pageState.workspace.tier = tier.id
      pageState.workspace.expanded = null
      context.goTo('workspace')
    })
    primary.appendChild(stat)
  }
  wrap.appendChild(primary)

  const aside = el('div', 'hero__aside')
  const fact = (value: number, label: string): void => {
    const row = el('div', 'hero__fact')
    row.appendChild(el('span', 'hero__factValue', String(value)))
    row.appendChild(el('span', 'hero__factLabel', label))
    aside.appendChild(row)
  }
  fact(stats.layers, stats.layers === 1 ? 'published layer' : 'published layers')
  fact(stats.textures, stats.textures === 1 ? 'texture' : 'textures')
  fact(stats.artists, stats.artists === 1 ? 'artist' : 'artists')
  wrap.appendChild(aside)

  return wrap
}

// ---------------------------------------------------------------------------
// How finished is it?
// ---------------------------------------------------------------------------

function readinessCard(project: Project): HTMLElement {
  const { root, body } = card('Readiness', { hint: 'by entity' })

  if (!project.entities.length) {
    body.appendChild(emptyState('Nothing published yet.', { inline: true }))
    return root
  }

  const total = project.entities.length
  const ready = project.entities.filter((entity) => READY.includes(entity.status))
  const locked = project.entities.filter((entity) => entity.status === 'locked')

  // Two headlines, in words and numbers, before any bars. "Ready" and
  // "finished" are different questions — a layer you can safely build on is
  // not the same as one that is signed off — and a supervisor asks both.
  // Locked entities count in both, which the tooltip says out loud.
  const lead = el('div', 'readiness__lead')
  lead.appendChild(
    leadStat(`${ready.length} of ${total}`, 'ready to build on', {
      hint:
        'Production ready or locked — safe for anyone downstream.\n' +
        'Includes the locked ones counted beside this.',
    }),
  )
  lead.appendChild(
    leadStat(`${locked.length} of ${total}`, 'signed off', {
      hint: 'Locked: finished, and not to be changed without talking to the owner.',
      accent: 'var(--status-locked)',
    }),
  )
  body.appendChild(lead)

  body.appendChild(statusMeter(project.entities))

  const legend = el('div', 'legend-row')
  for (const status of STATUS_ALL) {
    const count = project.entities.filter((entity) => entity.status === status).length
    if (!count) continue
    const item = el('div', 'legend-row__item')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status]))
    item.appendChild(el('span', 'legend-row__count', String(count)))
    legend.appendChild(item)
  }
  body.appendChild(legend)

  // The same question again, split three ways: a project can look healthy
  // overall while one whole tier is still stand-ins.
  const tiers = el('div', 'readiness__tiers')
  for (const tier of TIERS) {
    const entities = project.entities.filter((entity) => entity.tier === tier.id)
    if (!entities.length) continue
    const done = entities.filter((entity) => READY.includes(entity.status)).length
    const signed = entities.filter((entity) => entity.status === 'locked').length

    const row = el('div', 'readiness__row')
    row.appendChild(el('span', 'readiness__label', tier.label))
    row.appendChild(statusMeter(entities))
    row.appendChild(el('span', 'readiness__count', `${done}/${entities.length}`))
    row.title =
      `${tier.label}: ${done} of ${entities.length} ready to build on\n` +
      `${signed} signed off`
    tiers.appendChild(row)
  }
  body.appendChild(tiers)

  return root
}

function leadStat(
  value: string,
  label: string,
  options: { hint?: string; accent?: string } = {},
): HTMLElement {
  const stat = el('div', 'readiness__stat')
  if (options.accent) stat.style.setProperty('--stat-accent', options.accent)
  if (options.hint) stat.title = options.hint
  stat.appendChild(el('span', 'readiness__big', value))
  stat.appendChild(el('span', 'readiness__leadLabel', label))
  return stat
}

function statusMeter(entities: ProjectEntity[]): HTMLElement {
  return meter(
    STATUS_ALL.map((status) => {
      const value = entities.filter((entity) => entity.status === status).length
      return {
        value,
        color: STATUS_COLOR[status],
        title: `${value} ${STATUS_LABEL[status].toLowerCase()}`,
      }
    }),
  )
}

// ---------------------------------------------------------------------------
// What is holding it up?
// ---------------------------------------------------------------------------

/**
 * The only actionable widget on the page: entities that are not yet safe to
 * build on, and which of their blocks is holding each one back.
 *
 * It shows the first few rather than all of them. A summary that grows without
 * limit stops being a summary, and the Workspace is where the full list with
 * its filters lives.
 */
function attentionCard(context: PageContext): HTMLElement {
  const unfinished = context.project.entities
    .filter((entity) => !READY.includes(entity.status))
    .sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name))

  const { root, body } = card('Needs attention', {
    hint: unfinished.length
      ? `${unfinished.length} of ${context.project.entities.length}`
      : undefined,
    actions: unfinished.length
      ? button('Open workspace', {
          variant: 'ghost',
          small: true,
          onClick: () => {
            pageState.workspace.expanded = null
            context.goTo('workspace')
          },
        })
      : undefined,
  })

  if (!unfinished.length) {
    body.appendChild(
      emptyState('Everything is production ready or locked.', {
        icon: 'check',
        body: 'Nothing in this project is still a placeholder.',
      }),
    )
    return root
  }

  const list = el('div', 'attn')
  for (const entity of unfinished.slice(0, PREVIEW_ROWS)) {
    const row = el('div', 'attn__row')
    row.appendChild(statusDot(entity.status))
    row.appendChild(el('span', 'attn__name', entity.name))
    row.appendChild(el('span', 'attn__tier', entity.tier))
    row.appendChild(truncated(weakParts(entity).join(', ') || '—', 'attn__why'))
    row.appendChild(statusPill(entity.status, true))
    row.title = entity.dir
    list.appendChild(row)
  }
  body.appendChild(list)

  const hidden = unfinished.length - PREVIEW_ROWS
  if (hidden > 0) {
    body.appendChild(
      el('p', 'card__more', `and ${hidden} more — the Workspace has all of them`),
    )
  }
  return root
}

/** The blocks of an entity that are not yet safe to build on. */
function weakParts(entity: ProjectEntity): string[] {
  return [...entity.blocks, entity.assembly]
    .filter(
      (layer): layer is NonNullable<typeof layer> =>
        Boolean(layer) && !READY.includes(layer!.pipeline.status),
    )
    .map((layer) => layer.block ?? 'assembly')
}

// ---------------------------------------------------------------------------
// What has been happening?
// ---------------------------------------------------------------------------

function recentCard(context: PageContext): HTMLElement {
  const recent = allTasks(context.project)
    .filter((task) => task.layer.pipeline.exportedAt)
    .sort(byRecency)
    .slice(0, PREVIEW_ROWS)

  const { root, body } = card('Latest publishes', {
    actions: button('All history', {
      variant: 'ghost',
      small: true,
      onClick: () => context.goTo('calendar'),
    }),
  })

  if (!recent.length) {
    body.appendChild(emptyState('Nothing carries a publish time.', { inline: true }))
    return root
  }

  const list = el('div', 'feed')
  for (const task of recent) {
    const row = el('div', 'feed__row')
    row.appendChild(statusDot(task.layer.pipeline.status))

    const main = el('div', 'feed__main')
    main.appendChild(truncated(`${task.entity.name} · ${task.step}`, 'feed__name'))
    main.appendChild(el('span', 'feed__by', task.layer.pipeline.artist ?? '—'))
    row.appendChild(main)

    row.appendChild(el('span', 'feed__when', formatRelative(task.layer.pipeline.exportedAt)))
    row.title = task.layer.path
    list.appendChild(row)
  }
  body.appendChild(list)
  return root
}

/**
 * Who is publishing, and what state their work is in.
 *
 * There is no team roster in USD to read, so this is a record of work done
 * rather than of who is on the show — the same caveat the Artists page carries.
 * Ordered by how much each person has published, which is the order that
 * answers "who is carrying this".
 */
function artistsCard(context: PageContext): HTMLElement {
  const { project } = context

  const byArtist = new Map<string, TaskRow[]>()
  for (const task of allTasks(project)) {
    const artist = task.layer.pipeline.artist
    if (!artist) continue
    const list = byArtist.get(artist)
    if (list) list.push(task)
    else byArtist.set(artist, [task])
  }

  const people = [...byArtist.entries()].sort(
    ([, a], [, b]) => b.length - a.length || latestOf(b) - latestOf(a),
  )

  const { root, body } = card('Artists', {
    hint: people.length
      ? `${people.length} ${people.length === 1 ? 'person' : 'people'}`
      : undefined,
    actions: people.length
      ? button('All artists', {
          variant: 'ghost',
          small: true,
          onClick: () => context.goTo('artists'),
        })
      : undefined,
  })

  if (!people.length) {
    body.appendChild(
      emptyState('No layer names an artist.', { inline: true }),
    )
    return root
  }

  const most = people[0]![1].length

  const list = el('div', 'people')
  for (const [artist, tasks] of people.slice(0, PREVIEW_ROWS)) {
    const row = el('button', 'people__row')
    row.appendChild(el('span', 'people__name', artist))

    // The bar is scaled against the busiest person rather than the total, so
    // the shape of the row says "who has published most" at a glance while
    // its colours still say what state that work is in.
    const bar = el('div', 'people__bar')
    bar.style.width = `${Math.max(8, (tasks.length / most) * 100)}%`
    bar.appendChild(layerMeter(tasks))
    const track = el('div', 'people__track')
    track.appendChild(bar)
    row.appendChild(track)

    row.appendChild(
      el('span', 'people__count', `${tasks.length} ${tasks.length === 1 ? 'layer' : 'layers'}`),
    )
    row.appendChild(el('span', 'people__when', formatRelative(latestOf(tasks))))

    row.title = `${artist} — see everything they have published`
    row.addEventListener('click', () => {
      pageState.artists.artist = artist
      pageState.artists.hiddenStatus.clear()
      context.goTo('artists')
    })
    list.appendChild(row)
  }
  body.appendChild(list)

  const hidden = people.length - PREVIEW_ROWS
  if (hidden > 0) {
    body.appendChild(el('p', 'card__more', `and ${hidden} more`))
  }
  return root
}

/** When this batch of work was last published. */
function latestOf(tasks: TaskRow[]): number {
  return Math.max(0, ...tasks.map((task) => task.layer.pipeline.exportedAt ?? 0))
}

/** A status bar for a set of layers, rather than of entities. */
function layerMeter(tasks: TaskRow[]): HTMLElement {
  return meter(
    STATUS_ALL.map((status) => {
      const value = tasks.filter((task) => task.layer.pipeline.status === status).length
      return {
        value,
        color: STATUS_COLOR[status],
        title: `${value} ${STATUS_LABEL[status].toLowerCase()}`,
      }
    }),
  )
}

function sequencesCard(project: Project): HTMLElement {
  const { root, body } = card('Sequences', {
    hint: project.sequences.length
      ? `${project.sequences.length} ${
          project.sequences.length === 1 ? 'sequence' : 'sequences'
        }`
      : undefined,
  })

  if (!project.sequences.length) {
    body.appendChild(emptyState('No shots found.', { inline: true }))
    return root
  }

  const byName = new Map(project.entities.map((entity) => [entity.name, entity]))

  const list = el('div', 'seqs')
  for (const sequence of project.sequences) {
    const row = el('div', 'seqs__row')
    row.appendChild(el('span', 'seqs__name', sequence.name))

    // One dot per shot, in shot order: a whole sequence's state at a glance
    // without a word of text.
    const dots = el('div', 'seqs__dots')
    for (const shotName of sequence.shots) {
      const shot = byName.get(shotName)
      const dot = statusDot(shot?.status ?? 'unknown')
      dot.title = `${shotName} — ${
        shot ? STATUS_LABEL[shot.status].toLowerCase() : 'not found'
      }`
      dots.appendChild(dot)
    }
    row.appendChild(dots)

    row.appendChild(
      el(
        'span',
        'seqs__count',
        `${sequence.shots.length} ${sequence.shots.length === 1 ? 'shot' : 'shots'}`,
      ),
    )
    list.appendChild(row)
  }
  body.appendChild(list)
  return root
}

// ---------------------------------------------------------------------------
// How is it wired together?
// ---------------------------------------------------------------------------

/**
 * What depends on what, as aligned rows rather than a drift of chips.
 *
 * The point of this widget is to be read down the left edge — "which shots
 * pull in the set", "does anything use this asset" — so the source names sit
 * in their own column and the dependencies run as plain text beside them.
 */
function dependencyCard(project: Project): HTMLElement {
  const withDeps = project.entities.filter((entity) => entity.dependsOn.length)

  const { root, body } = card('What depends on what', {
    hint: 'from real composition arcs',
    flush: withDeps.length > 0,
  })

  if (!withDeps.length) {
    body.appendChild(emptyState('Nothing references anything else yet.', { inline: true }))
    return root
  }

  const byName = new Map(project.entities.map((entity) => [entity.name, entity]))

  const list = el('div', 'wiring')
  for (const entity of withDeps) {
    const row = el('div', 'wiring__row')

    const source = el('span', 'wiring__source')
    source.appendChild(statusDot(entity.status))
    source.appendChild(el('span', 'wiring__name', entity.name))
    row.appendChild(source)

    row.appendChild(el('span', 'wiring__arrow', '→'))

    const targets = el('span', 'wiring__targets')
    entity.dependsOn.forEach((name, index) => {
      if (index) targets.appendChild(el('span', 'wiring__sep', '·'))
      const target = byName.get(name)
      const item = el('span', 'wiring__target')
      if (target) item.appendChild(statusDot(target.status))
      item.appendChild(el('span', undefined, name))
      targets.appendChild(item)
    })
    row.appendChild(targets)

    list.appendChild(row)
  }
  body.appendChild(list)
  return root
}
