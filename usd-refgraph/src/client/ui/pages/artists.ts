/**
 * Everyone who publishes, at once: how much each person carries, in what
 * state, and on which entities — then what they published last.
 *
 * The roster is whoever has actually published. There is no team list in USD
 * to read one from, so this page is a record of work done, not of who is on
 * the show.
 *
 * Nothing here is laid out by step. Blocks are free-form, so a person's load is
 * told by the entities they publish into, never by a fixed set of columns.
 */

import type { ProjectEntity, TaskRow } from '@shared/project'
import type { Status } from '@shared/pipeline'
import { STATUS_ORDER, allTasks, byRecency, statusRank } from '@shared/project'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  button,
  card,
  dataTable,
  emptyState,
  headStats,
  meter,
  namedCell,
  statusDot,
  statusPill,
  truncated,
} from '../kit'
import { el, formatMoment, formatRelative } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const UNATTRIBUTED = 'no artist recorded'

/** Entities named on a person's row before the rest fold into a count. */
const MAX_ENTITIES = 5

interface Person {
  name: string
  tasks: TaskRow[]
  last: number
}

export function renderArtists(host: HTMLElement, context: PageContext): void {
  const state = pageState.artists
  const people = gatherPeople(allTasks(context.project))
  if (state.artist && !people.some((person) => person.name === state.artist)) state.artist = null

  const named = people.filter((person) => person.name !== UNATTRIBUTED)
  const busiest = named[0]
  const quietest = [...named].sort((a, b) => a.last - b.last)[0]

  const body = pageShell(host, 'Artists', {
    subtitle: 'Read from each layer’s publish record — not a roster',
    stats: named.length
      ? headStats([
          { value: named.length, label: named.length === 1 ? 'person publishing' : 'people publishing' },
          ...(busiest
            ? [{ value: busiest.tasks.length, label: `layers by ${busiest.name}`, title: 'The most anyone has published' }]
            : []),
          ...(quietest && named.length > 1
            ? [{ value: sinceShort(quietest.last), label: `since ${quietest.name} published`, title: 'The longest anyone has gone without publishing' }]
            : []),
        ])
      : undefined,
  })

  if (!people.length) {
    body.appendChild(
      emptyState('No published layers found.', {
        icon: 'user',
        body: 'Nothing in this project carries an artist in its layer metadata.',
      }),
    )
    return
  }

  body.appendChild(loadCard(people, context))
  const person = people.find((candidate) => candidate.name === state.artist)
  body.appendChild(person ? historyCard(person, context) : latestCard(people))
}

function gatherPeople(tasks: TaskRow[]): Person[] {
  const byName = new Map<string, TaskRow[]>()
  for (const task of tasks) {
    const name = task.layer.pipeline.artist ?? UNATTRIBUTED
    const list = byName.get(name)
    if (list) list.push(task)
    else byName.set(name, [task])
  }
  // Busiest first, which is the order that answers "who is carrying this";
  // layers with no artist always last.
  return [...byName.entries()]
    .map(([name, list]) => ({
      name,
      tasks: list.sort(byRecency),
      last: Math.max(0, ...list.map((task) => task.layer.pipeline.exportedAt ?? 0)),
    }))
    .sort((a, b) => {
      if (a.name === UNATTRIBUTED) return 1
      if (b.name === UNATTRIBUTED) return -1
      return b.tasks.length - a.tasks.length || b.last - a.last
    })
}

// ---------------------------------------------------------------------------
// Load
// ---------------------------------------------------------------------------

function loadCard(people: Person[], context: PageContext): HTMLElement {
  const legend = el('div', 'legendkey')
  for (const status of STATUS_ORDER) {
    const item = el('span', 'legendkey__item')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status]))
    legend.appendChild(item)
  }

  const { root, body } = card('Who publishes what', {
    hint: 'pick a person to see everything they published',
    actions: legend,
    flush: true,
  })

  const board = el('div', 'load')
  const head = el('div', 'load__row load__row--head')
  for (const label of ['Artist', 'Their layers by status', 'Entities', 'Layers', 'Last publish']) {
    head.appendChild(el('span', 'load__cell', label))
  }
  board.appendChild(head)

  const selected = pageState.artists.artist
  for (const person of people) {
    const on = person.name === selected
    const row = el('button', `load__row${on ? ' is-on' : ''}`)
    row.setAttribute('aria-pressed', String(on))
    row.title = on ? 'Show everyone’s latest again' : `Show everything ${person.name} published`

    const name = el('span', `load__cell load__name${person.name === UNATTRIBUTED ? ' is-absent' : ''}`, person.name)
    row.appendChild(name)

    const split = el('span', 'load__cell')
    split.appendChild(
      meter(
        STATUS_ORDER.map((status) => {
          const count = person.tasks.filter((task) => task.layer.pipeline.status === status).length
          return { value: count, color: STATUS_COLOR[status], title: `${count} ${STATUS_LABEL[status].toLowerCase()}` }
        }),
      ),
    )
    row.appendChild(split)

    row.appendChild(entityChips(person))
    row.appendChild(el('span', 'load__cell load__num', String(person.tasks.length)))
    const last = el('span', 'load__cell load__when', formatRelative(person.last))
    last.title = formatMoment(person.last)
    row.appendChild(last)

    row.addEventListener('click', () => {
      pageState.artists.artist = on ? null : person.name
      context.refresh()
    })
    board.appendChild(row)
  }

  body.appendChild(board)
  return root
}

/**
 * The entities a person publishes into, most layers first, each tinted by
 * the weakest status among that person's layers there.
 */
function entityChips(person: Person): HTMLElement {
  const cell = el('span', 'load__cell load__entities')
  const byEntity = new Map<string, { entity: ProjectEntity; tasks: TaskRow[] }>()
  for (const task of person.tasks) {
    const entry = byEntity.get(task.entity.name)
    if (entry) entry.tasks.push(task)
    else byEntity.set(task.entity.name, { entity: task.entity, tasks: [task] })
  }

  const entries = [...byEntity.values()].sort(
    (a, b) => b.tasks.length - a.tasks.length || a.entity.name.localeCompare(b.entity.name),
  )
  for (const { entity, tasks } of entries.slice(0, MAX_ENTITIES)) {
    const weakest = tasks
      .map((task) => task.layer.pipeline.status)
      .reduce<Status>((worst, status) => (statusRank(status) < statusRank(worst) ? status : worst), 'locked')
    const chip = el('span', 'echip')
    chip.appendChild(statusDot(weakest))
    chip.appendChild(el('span', 'echip__name', entity.name))
    if (tasks.length > 1) chip.appendChild(el('span', 'echip__count', `×${tasks.length}`))
    chip.title = tasks.map((task) => `${task.step} · ${STATUS_LABEL[task.layer.pipeline.status]}`).join('\n')
    cell.appendChild(chip)
  }
  if (entries.length > MAX_ENTITIES) {
    const more = el('span', 'echip echip--more', `+${entries.length - MAX_ENTITIES}`)
    more.title = entries.slice(MAX_ENTITIES).map((entry) => entry.entity.name).join('\n')
    cell.appendChild(more)
  }
  return cell
}

// ---------------------------------------------------------------------------
// What they published
// ---------------------------------------------------------------------------

function latestCard(people: Person[]): HTMLElement {
  const { root, body } = card('Latest from each person', { flush: true })
  body.appendChild(
    dataTable(
      [
        { label: 'Artist', width: 'minmax(0, 0.7fr)' },
        { label: 'Entity', width: 'minmax(0, 1fr)' },
        { label: 'Block', width: 'minmax(0, 0.8fr)' },
        { label: 'Comment', width: 'minmax(0, 2fr)' },
        { label: 'Status', width: '120px', end: true },
        { label: 'When', width: '100px', end: true },
      ],
      people
        .filter((person) => person.tasks.length)
        .map((person) => {
          const task = person.tasks[0]!
          return {
            title: task.layer.path,
            layerPath: task.layer.path,
            cells: [
              truncated(person.name, person.name === UNATTRIBUTED ? 'dim' : 'strong'),
              namedCell(task.entity.name),
              truncated(task.step, 'mono dim'),
              truncated(task.layer.pipeline.comment || '—', 'dim'),
              statusPill(task.layer.pipeline.status, true),
              whenCell(task),
            ],
          }
        }),
    ),
  )
  return root
}

function historyCard(person: Person, context: PageContext): HTMLElement {
  const { root, body } = card(`Everything ${person.name} published`, {
    hint: `${person.tasks.length} ${person.tasks.length === 1 ? 'layer' : 'layers'}, newest first`,
    actions: button('Everyone’s latest', {
      variant: 'ghost',
      small: true,
      onClick: () => {
        pageState.artists.artist = null
        context.refresh()
      },
    }),
    flush: true,
  })
  body.appendChild(
    dataTable(
      [
        { label: 'Entity', width: 'minmax(0, 1fr)' },
        { label: 'Block', width: 'minmax(0, 0.8fr)' },
        { label: 'Workfile', width: 'minmax(0, 1.1fr)' },
        { label: 'Comment', width: 'minmax(0, 1.6fr)' },
        { label: 'Status', width: '120px', end: true },
        { label: 'When', width: '100px', end: true },
      ],
      person.tasks.map((task) => ({
        title: task.layer.path,
        layerPath: task.layer.path,
        cells: [
          namedCell(task.entity.name, { strong: true }),
          truncated(task.step, 'mono dim'),
          truncated(task.layer.pipeline.hipFile ?? '—', 'mono dim'),
          truncated(task.layer.pipeline.comment || '—', 'dim'),
          statusPill(task.layer.pipeline.status, true),
          whenCell(task),
        ],
      })),
    ),
  )
  return root
}

function whenCell(task: TaskRow): HTMLElement {
  const at = task.layer.pipeline.exportedAt
  const cell = el('span', 'dim', at ? formatRelative(at) : '—')
  if (at) cell.title = formatMoment(at)
  return cell
}

/** `2h`, `3d`: how long since, in the fewest characters a headline allows. */
function sinceShort(ms: number): string {
  if (!ms) return '—'
  const hours = Math.max(0, (Date.now() - ms) / 3_600_000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}
