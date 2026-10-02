/**
 * The project's home page: a dashboard that answers, at a glance, how finished
 * the project is, what it is made of, who is working on it, what happened
 * lately, and whether anything on disk needs a look.
 *
 * It reads in rows of falling importance. The headline band leads with the
 * one number that matters most; each row below pairs a wide panel with a
 * narrow one, so the page uses the window without every number getting the
 * same weight.
 *
 * Nothing here is the whole story. Each panel shows the top of its list and
 * links to the page holding the rest: the Workspace has every file, Publishes
 * every publish, Artists every person, Workfiles every workfile.
 *
 * Health lists only facts read off disk — a missing file, a layer with no
 * status. It never infers who is waiting on whom.
 *
 * Readiness counts entities, never layers. Mixing the two units invites
 * comparing numbers that do not compare.
 */

import type { Project, ProjectEntity, TaskRow } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'
import { STATUS_ORDER, allTasks, byRecency, entityLayers, entitySort } from '@shared/project'
import { parseWorkfile, workfileKey } from '@shared/workfile'
import { ICONS, type IconName } from '../icons'
import {
  STATUS_COLOR,
  STATUS_LABEL,
  TIER_COLOR,
  card,
  emptyState,
  markLayer,
  meter,
  statusDot,
  statusPill,
  statusStrip,
} from '../kit'
import { dayKey, displayName, el, formatMoment, formatRelative, icon } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const TIERS: { id: NodeTier; one: string; many: string }[] = [
  { id: 'asset', one: 'asset', many: 'Assets' },
  { id: 'set', one: 'set', many: 'Sets' },
  { id: 'shot', one: 'shot', many: 'Shots' },
]

/** Statuses that mean "safe to build on". */
const READY: Status[] = ['production_ready', 'locked']

/** How many rows each list shows before handing over to its page. */
const SHOW = { entities: 5, people: 6, latest: 6, workfiles: 5 }

const DAY = 86_400_000

export function renderOverview(host: HTMLElement, context: PageContext): void {
  const { project } = context
  const tasks = allTasks(project)
  const people = gatherPeople(tasks)

  const body = pageShell(host, displayName(project.name), {
    subtitle: [
      plural(project.entities.length, 'entity', 'entities'),
      plural(project.stats.layers, 'published layer'),
      plural(people.length, 'person', 'people'),
    ].join(' · '),
  })
  body.classList.add('dash')

  if (!project.entities.length) {
    body.appendChild(
      emptyState('Nothing published yet.', {
        icon: 'inbox',
        body: 'The scan looks for assets, sets and shots directly under the project root.',
      }),
    )
    return
  }

  const published = tasks.filter((task) => task.layer.pipeline.exportedAt).sort(byRecency)
  const workfiles = gatherWorkfiles(tasks)

  body.appendChild(span(headline(project, published, people, workfiles), 'full'))

  body.appendChild(span(activityPanel(published, context), 'wide'))
  body.appendChild(span(teamPanel(people, context), 'side'))

  body.appendChild(span(entitiesPanel(project, context), 'wide'))
  body.appendChild(span(healthPanel(project, tasks), 'side'))

  body.appendChild(span(latestPanel(published, context), 'wide'))
  body.appendChild(span(workfilesPanel(workfiles, context), 'side'))
}

// ---------------------------------------------------------------------------
// The headline band: readiness, and the project in five numbers
// ---------------------------------------------------------------------------

function headline(
  project: Project,
  published: TaskRow[],
  people: Person[],
  workfiles: Workfile[],
): HTMLElement {
  const entities = project.entities
  const total = entities.length
  const ready = entities.filter((entity) => READY.includes(entity.status)).length
  const percent = Math.round((ready / total) * 100)

  const band = el('section', 'dash__hero')

  const lead = el('div', 'dash__lead')
  const dial = el('div', 'dash__dial')
  dial.appendChild(statusRing(entities))
  dial.appendChild(el('span', 'dash__dialValue', `${percent}%`))
  lead.appendChild(dial)

  const words = el('div', 'dash__leadWords')
  words.appendChild(el('h2', 'dash__leadTitle', 'Ready to build on'))
  words.appendChild(
    el('p', 'dash__leadSub', `${ready} of ${plural(total, 'entity', 'entities')} are production ready or locked`),
  )
  const legend = el('div', 'dash__legend')
  for (const status of STATUS_ORDER) {
    const count = entities.filter((entity) => entity.status === status).length
    if (!count && status === 'unknown') continue
    const item = el('span', 'dash__legendItem')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status]))
    item.appendChild(el('span', 'dash__legendCount', String(count)))
    legend.appendChild(item)
  }
  words.appendChild(legend)
  lead.appendChild(words)
  band.appendChild(lead)

  const tierCounts = TIERS.map((tier) => {
    const count = entities.filter((entity) => entity.tier === tier.id).length
    return plural(count, tier.one)
  })
  const versions = workfiles.reduce((sum, file) => sum + file.versions.size, 0)
  const last = published[0]

  const kpis = el('div', 'dash__kpis')
  kpis.appendChild(kpi('Entities', String(total), tierCounts.join(' · ')))
  kpis.appendChild(
    kpi('Published layers', String(project.stats.layers), plural(project.stats.textures, 'texture')),
  )
  kpis.appendChild(kpi('Workfiles', String(workfiles.length), plural(versions, 'version')))
  kpis.appendChild(
    kpi('People', String(people.length), people.slice(0, 3).map((person) => person.name).join(', ') || '—'),
  )
  if (last) {
    const at = last.layer.pipeline.exportedAt!
    const cell = kpi('Last publish', sinceShort(at), `${last.entity.name} ${last.step}`)
    cell.title = `${formatMoment(at)}${last.layer.pipeline.artist ? ` by ${last.layer.pipeline.artist}` : ''}`
    kpis.appendChild(cell)
  }
  band.appendChild(kpis)
  return band
}

function kpi(label: string, value: string, note: string): HTMLElement {
  const cell = el('div', 'dash__kpi')
  cell.appendChild(el('span', 'dash__kpiLabel', label))
  cell.appendChild(el('span', 'dash__kpiValue', value))
  cell.appendChild(el('span', 'dash__kpiNote', note))
  return cell
}

/**
 * The status split as a ring, starting at twelve o'clock. A circle of
 * circumference 100 makes every segment's length its percentage.
 */
function statusRing(entities: ProjectEntity[]): SVGSVGElement {
  const ns = 'http://www.w3.org/2000/svg'
  const svg = document.createElementNS(ns, 'svg')
  svg.setAttribute('viewBox', '0 0 36 36')
  svg.setAttribute('class', 'dash__ring')
  svg.setAttribute('aria-hidden', 'true')

  const circle = (className: string): SVGCircleElement => {
    const node = document.createElementNS(ns, 'circle')
    node.setAttribute('cx', '18')
    node.setAttribute('cy', '18')
    node.setAttribute('r', '15.9155')
    node.setAttribute('class', className)
    return node
  }
  svg.appendChild(circle('dash__ringTrack'))

  let start = 0
  for (const status of STATUS_ORDER) {
    const share = (entities.filter((entity) => entity.status === status).length / entities.length) * 100
    if (!share) continue
    const arc = circle('dash__ringPart')
    arc.style.stroke = STATUS_COLOR[status]
    arc.setAttribute('stroke-dasharray', `${share} ${100 - share}`)
    arc.setAttribute('stroke-dashoffset', String(25 - start))
    svg.appendChild(arc)
    start += share
  }
  return svg
}

// ---------------------------------------------------------------------------
// Publishing activity: one bar per day (or week, for a long project)
// ---------------------------------------------------------------------------

interface Bin {
  start: number
  count: number
  /** The calendar day to open, for daily bins. */
  day: string | null
}

function activityPanel(published: TaskRow[], context: PageContext): HTMLElement {
  const { root, body } = panel('Publishing activity', {
    link: { label: 'Calendar', onClick: () => context.goTo('calendar') },
  })
  if (!published.length) {
    body.appendChild(emptyState('Nothing carries a publish time.', { inline: true }))
    return root
  }

  const times = published.map((task) => task.layer.pipeline.exportedAt!)
  const { bins, unit } = binTimes(times)
  const peak = bins.reduce((best, bin) => (bin.count > best.count ? bin : best), bins[0]!)
  const active = bins.filter((bin) => bin.count).length

  const summary = el('div', 'dash__chartSummary')
  summary.appendChild(
    statLine(String(times.length), `publishes over ${plural(bins.length, unit)}`),
  )
  summary.appendChild(statLine(String(active), `${unit}s with a publish`))
  summary.appendChild(
    statLine(String(peak.count), `on the busiest ${unit}, ${formatBin(peak.start, unit)}`),
  )
  body.appendChild(summary)

  const chart = el('div', 'dash__chart')
  const plot = el('div', 'dash__plot')
  plot.setAttribute('role', 'img')
  plot.setAttribute(
    'aria-label',
    `${times.length} publishes per ${unit}, busiest ${formatBin(peak.start, unit)} with ${peak.count}`,
  )
  const tip = el('div', 'dash__tip')
  tip.hidden = true

  for (const bin of bins) {
    const column = el('button', `dash__bar${bin.count ? '' : ' is-empty'}`)
    const fill = el('span', 'dash__barFill')
    fill.style.height = bin.count ? `${Math.max(4, (bin.count / peak.count) * 100)}%` : '0'
    column.appendChild(fill)
    const label = `${formatBin(bin.start, unit)} · ${plural(bin.count, 'publish', 'publishes')}`
    column.setAttribute('aria-label', label)
    column.addEventListener('pointerenter', () => {
      tip.textContent = label
      tip.hidden = false
      const box = column.getBoundingClientRect()
      const frame = plot.getBoundingClientRect()
      tip.style.left = `${box.left - frame.left + box.width / 2}px`
    })
    column.addEventListener('pointerleave', () => {
      tip.hidden = true
    })
    column.addEventListener('click', () => {
      const date = new Date(bin.start)
      pageState.calendar.cursor = { year: date.getFullYear(), month: date.getMonth() }
      pageState.calendar.selectedDay = bin.day && bin.count ? bin.day : null
      context.goTo('calendar')
    })
    plot.appendChild(column)
  }
  plot.appendChild(tip)
  chart.appendChild(el('span', 'dash__axisMax', String(peak.count)))
  chart.appendChild(plot)

  const axis = el('div', 'dash__axis')
  axis.appendChild(el('span', undefined, formatBin(bins[0]!.start, unit)))
  axis.appendChild(el('span', undefined, unit === 'day' ? 'today' : 'this week'))
  chart.appendChild(axis)
  body.appendChild(chart)
  return root
}

/**
 * Bins from the first publish up to today: days while that fits a readable
 * chart, weeks once it does not. Empty days stay in, since a gap in the work
 * is part of what the chart is for.
 */
function binTimes(times: number[]): { bins: Bin[]; unit: 'day' | 'week' } {
  const today = startOfDay(Date.now())
  const first = startOfDay(Math.min(...times))
  const days = Math.round((today - first) / DAY) + 1
  const unit = days > 63 ? 'week' : 'day'
  const size = unit === 'day' ? DAY : 7 * DAY
  // Short projects still get a few weeks of axis, so one day is not one bar.
  const count = Math.min(unit === 'day' ? Math.max(days, 21) : Math.ceil(days / 7), unit === 'day' ? 63 : 52)
  const start = today - (count - 1) * size

  const bins: Bin[] = Array.from({ length: count }, (_, index) => {
    const at = start + index * size
    return { start: at, count: 0, day: unit === 'day' ? dayKey(at) : null }
  })
  for (const time of times) {
    const index = Math.floor((startOfDay(time) - start) / size)
    if (index >= 0 && index < bins.length) bins[index]!.count++
  }
  return { bins, unit }
}

function startOfDay(ms: number): number {
  const date = new Date(ms)
  date.setHours(0, 0, 0, 0)
  return date.getTime()
}

function formatBin(ms: number, unit: 'day' | 'week'): string {
  const day = new Date(ms).toLocaleDateString(undefined, { day: 'numeric', month: 'short' })
  return unit === 'day' ? day : `week of ${day}`
}

function statLine(value: string, label: string): HTMLElement {
  const line = el('div', 'dash__stat')
  line.appendChild(el('span', 'dash__statValue', value))
  line.appendChild(el('span', 'dash__statLabel', label))
  return line
}

// ---------------------------------------------------------------------------
// Who is working on it
// ---------------------------------------------------------------------------

interface Person {
  name: string
  tasks: TaskRow[]
  last: number
  entities: Set<string>
}

function gatherPeople(tasks: TaskRow[]): Person[] {
  const byName = new Map<string, Person>()
  for (const task of tasks) {
    const name = task.layer.pipeline.artist
    if (!name) continue
    let person = byName.get(name)
    if (!person) {
      person = { name, tasks: [], last: 0, entities: new Set() }
      byName.set(name, person)
    }
    person.tasks.push(task)
    person.entities.add(task.entity.name)
    person.last = Math.max(person.last, task.layer.pipeline.exportedAt ?? 0)
  }
  // Most recently active first: a dashboard asks who is working now.
  return [...byName.values()].sort((a, b) => b.last - a.last || b.tasks.length - a.tasks.length)
}

function teamPanel(people: Person[], context: PageContext): HTMLElement {
  const { root, body } = panel('Team', {
    hint: 'latest first',
    link: { label: 'Artists', onClick: () => openArtist(null, context) },
    flush: true,
  })
  if (!people.length) {
    body.appendChild(emptyState('No artist recorded in any layer.', { inline: true }))
    return root
  }

  const list = el('div', 'dash__list')
  for (const person of people.slice(0, SHOW.people)) {
    const row = doorRow(`Show everything ${person.name} published`, () => openArtist(person.name, context))
    row.classList.add('dash__item--person')
    row.appendChild(avatar(person.name))
    row.appendChild(
      words(
        person.name,
        `${plural(person.tasks.length, 'layer')} in ${plural(person.entities.size, 'entity', 'entities')}`,
      ),
    )
    const split = el('span', 'dash__itemMeter dash__itemMeter--small')
    split.appendChild(
      meter(
        STATUS_ORDER.map((status) => {
          const count = person.tasks.filter((task) => task.layer.pipeline.status === status).length
          return { value: count, color: STATUS_COLOR[status], title: `${count} ${STATUS_LABEL[status].toLowerCase()}` }
        }),
      ),
    )
    row.appendChild(split)
    const when = el('span', 'dash__itemWhen', sinceShort(person.last))
    when.title = `Last published ${formatMoment(person.last)}`
    row.appendChild(when)
    list.appendChild(row)
  }
  if (people.length > SHOW.people) list.appendChild(moreRow(people.length - SHOW.people, 'person', () => openArtist(null, context), 'people'))
  body.appendChild(list)
  return root
}

function openArtist(name: string | null, context: PageContext): void {
  pageState.artists.artist = name
  context.goTo('artists')
}

/** Initials in a quiet disc. People get no colour: colour already means status and tier. */
function avatar(name: string): HTMLElement {
  const parts = name.split(/[\s._-]+/).filter(Boolean)
  const initials = (parts.length > 1 ? parts[0]![0]! + parts[1]![0]! : name.slice(0, 2)).toUpperCase()
  return el('span', 'dash__avatar', initials)
}

// ---------------------------------------------------------------------------
// What it is made of
// ---------------------------------------------------------------------------

function entitiesPanel(project: Project, context: PageContext): HTMLElement {
  const { root, body } = panel('Entities', {
    hint: 'one mark per published file',
    link: { label: 'Workspace', onClick: () => openWorkspace('all', null, context) },
  })
  const columns = el('div', 'dash__tiers')
  for (const tier of TIERS) {
    const entities = project.entities.filter((entity) => entity.tier === tier.id).sort(entitySort)
    const ready = entities.filter((entity) => READY.includes(entity.status)).length

    const column = el('div', 'dash__tier')
    const head = el('button', 'dash__tierHead')
    head.title = `Open ${tier.many.toLowerCase()} in the workspace`
    head.addEventListener('click', () => openWorkspace(tier.id, null, context))
    head.appendChild(glyph(tier.id, TIER_COLOR[tier.id]))
    head.appendChild(words(tier.many, entities.length ? `${ready} of ${entities.length} ready` : `No ${tier.one}s yet`))
    head.appendChild(el('span', 'dash__itemValue', String(entities.length)))
    column.appendChild(head)
    if (entities.length) column.appendChild(statusMeter(entities))

    const list = el('div', 'dash__tierList')
    for (const entity of entities.slice(0, SHOW.entities)) {
      const row = el('button', 'dash__entity')
      row.title = `Show ${entity.name} · ${STATUS_LABEL[entity.status]}`
      row.addEventListener('click', () => openWorkspace(tier.id, entity.name, context))
      row.appendChild(statusDot(entity.status))
      row.appendChild(el('span', 'dash__entityName', entity.name))
      row.appendChild(
        statusStrip(entityLayers(entity).map((file) => ({ status: file.pipeline.status, label: file.block ?? 'assembly' }))),
      )
      list.appendChild(row)
    }
    if (entities.length > SHOW.entities) {
      const more = el('button', 'dash__entity dash__entity--more', `+${entities.length - SHOW.entities} more`)
      more.addEventListener('click', () => openWorkspace(tier.id, null, context))
      list.appendChild(more)
    }
    column.appendChild(list)
    columns.appendChild(column)
  }
  body.appendChild(columns)
  return root
}

function openWorkspace(tier: NodeTier | 'all', entity: string | null, context: PageContext): void {
  pageState.workspace.tier = tier
  pageState.workspace.selected = entity
  pageState.workspace.query = ''
  context.goTo('workspace')
}

// ---------------------------------------------------------------------------
// Does anything on disk need a look?
// ---------------------------------------------------------------------------

function healthPanel(project: Project, tasks: TaskRow[]): HTMLElement {
  const { root, body } = panel('Health', { hint: 'read off disk', flush: true })

  const missing = new Set<string>()
  const missingIn = new Set<string>()
  for (const task of tasks) {
    for (const texture of task.layer.textures ?? []) {
      if (texture.exists || texture.template) continue
      missing.add(texture.path)
      missingIn.add(task.layer.path)
    }
  }
  const noStatus = tasks.filter((task) => task.layer.pipeline.status === 'unknown')
  const unreadable = tasks.filter((task) => task.layer.error)
  const unused = project.entities.flatMap((entity) => entity.unusedTextures)

  const list = el('div', 'dash__list')
  list.appendChild(
    check(
      'Missing files',
      missing.size,
      'danger',
      missing.size ? `referenced by ${plural(missingIn.size, 'layer')}, not on disk` : 'every referenced file is on disk',
    ),
  )
  list.appendChild(
    check(
      'Layers with no status',
      noStatus.length,
      'warn',
      noStatus.length ? 'published without a status' : 'every layer has a status',
      noStatus.map((task) => task.layer.name).join('\n'),
    ),
  )
  list.appendChild(
    check(
      'Unreadable layers',
      unreadable.length,
      'danger',
      unreadable.length ? 'USD could not open them' : 'every layer opens',
      unreadable.map((task) => `${task.layer.name}: ${task.layer.error}`).join('\n'),
    ),
  )
  list.appendChild(
    check(
      'Unused textures',
      unused.length,
      'warn',
      unused.length ? 'in an entity folder, used by no layer' : 'every texture is used',
      unused.map((texture) => texture.name).join('\n'),
    ),
  )
  body.appendChild(list)
  return root
}

/** One health fact: a check when it is clean, a warning glyph and count when not. */
function check(label: string, count: number, level: 'danger' | 'warn', note: string, detail = ''): HTMLElement {
  const row = el('div', `dash__item${count ? ` dash__item--${level}` : ''}`)
  row.appendChild(
    count ? glyph('missing', level === 'danger' ? 'var(--danger)' : 'var(--warn)') : glyph('check', 'var(--ok)'),
  )
  row.appendChild(words(label, note))
  row.appendChild(el('span', 'dash__itemValue', String(count)))
  if (detail) row.title = detail
  return row
}

// ---------------------------------------------------------------------------
// What happened last
// ---------------------------------------------------------------------------

function latestPanel(published: TaskRow[], context: PageContext): HTMLElement {
  const { root, body } = panel('Latest publishes', {
    link: { label: 'All publishes', onClick: () => context.goTo('calendar') },
    flush: true,
  })
  if (!published.length) {
    body.appendChild(emptyState('Nothing carries a publish time.', { inline: true }))
    return root
  }
  const list = el('div', 'dash__list')
  for (const task of published.slice(0, SHOW.latest)) list.appendChild(publishRow(task))
  body.appendChild(list)
  return root
}

/** One publish: what, by whom, how long ago, and its state. Opens the file panel. */
function publishRow(task: TaskRow): HTMLElement {
  const row = markLayer(el('div', 'dash__item dash__item--publish'), task.layer.path)
  row.title = task.layer.path
  row.appendChild(glyph(task.entity.tier, TIER_COLOR[task.entity.tier], true))

  const text = el('span', 'dash__itemText')
  const name = el('span', 'dash__itemLabel')
  name.appendChild(el('span', undefined, task.entity.name))
  name.appendChild(el('span', 'dash__itemBlock', task.step))
  text.appendChild(name)
  const record = task.layer.pipeline
  text.appendChild(el('span', 'dash__itemNote', [record.artist, record.comment].filter(Boolean).join(' · ') || '—'))
  row.appendChild(text)

  const at = record.exportedAt!
  const when = el('span', 'dash__itemWhen', formatRelative(at))
  when.title = formatMoment(at)
  row.appendChild(when)
  row.appendChild(statusPill(record.status, true))
  return row
}

// ---------------------------------------------------------------------------
// Workfiles in use
// ---------------------------------------------------------------------------

interface Workfile {
  key: string
  label: string
  versions: Set<string>
  newest: string | null
  newestNumber: number
  layers: number
  last: number
}

/** Workfiles grouped by name without version, as the Workfiles page does. */
function gatherWorkfiles(tasks: TaskRow[]): Workfile[] {
  const files = new Map<string, Workfile>()
  for (const task of tasks) {
    const recorded = task.layer.pipeline.hipFile
    if (!recorded) continue
    const parsed = parseWorkfile(recorded)
    const key = workfileKey(parsed)
    let file = files.get(key)
    if (!file) {
      file = { key, label: parsed.base || parsed.full, versions: new Set(), newest: null, newestNumber: -1, layers: 0, last: 0 }
      files.set(key, file)
    }
    file.versions.add(parsed.versionLabel ?? '')
    file.layers++
    file.last = Math.max(file.last, task.layer.pipeline.exportedAt ?? 0)
    if ((parsed.version ?? -1) > file.newestNumber) {
      file.newestNumber = parsed.version ?? -1
      file.newest = parsed.versionLabel
    }
  }
  return [...files.values()].sort((a, b) => b.last - a.last)
}

function workfilesPanel(workfiles: Workfile[], context: PageContext): HTMLElement {
  const { root, body } = panel('Workfiles', {
    hint: 'latest first',
    link: { label: 'Workfiles', onClick: () => openWorkfile(null, context) },
    flush: true,
  })
  if (!workfiles.length) {
    body.appendChild(emptyState('No layer records its workfile.', { inline: true }))
    return root
  }
  const list = el('div', 'dash__list')
  for (const file of workfiles.slice(0, SHOW.workfiles)) {
    const row = doorRow(`Open ${file.label}`, () => openWorkfile(file.key, context))
    row.classList.add('dash__item--person')
    row.appendChild(glyph('hip'))
    const text = words(
      file.label,
      [file.newest, plural(file.versions.size, 'version'), plural(file.layers, 'layer')].filter(Boolean).join(' · '),
    )
    text.firstElementChild!.classList.add('dash__itemLabel--mono')
    row.appendChild(text)
    row.appendChild(el('span', 'dash__itemMeter dash__itemMeter--none'))
    const when = el('span', 'dash__itemWhen', sinceShort(file.last))
    when.title = `Last written ${formatMoment(file.last)}`
    row.appendChild(when)
    list.appendChild(row)
  }
  if (workfiles.length > SHOW.workfiles) {
    list.appendChild(moreRow(workfiles.length - SHOW.workfiles, 'workfile', () => openWorkfile(null, context)))
  }
  body.appendChild(list)
  return root
}

function openWorkfile(key: string | null, context: PageContext): void {
  pageState.workfiles.selected = key
  pageState.workfiles.query = ''
  context.goTo('workfiles')
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Place a panel on the dashboard grid. */
function span(node: HTMLElement, width: 'full' | 'wide' | 'side'): HTMLElement {
  node.classList.add(`dash--${width}`)
  return node
}

/** A card with an optional link to the page that holds the rest. */
function panel(
  title: string,
  options: { hint?: string; link?: { label: string; onClick: () => void }; flush?: boolean } = {},
): { root: HTMLElement; body: HTMLElement } {
  let actions: HTMLElement | undefined
  if (options.link) {
    actions = el('button', 'dash__more', options.link.label)
    actions.appendChild(chevron())
    actions.addEventListener('click', options.link.onClick)
  }
  const made = card(title, { hint: options.hint, actions, flush: options.flush })
  made.root.classList.add('dash__panel')
  return made
}

/** A row that opens the page holding its detail. */
function doorRow(title: string, onClick: () => void): HTMLButtonElement {
  const row = el('button', 'dash__item dash__item--door')
  row.title = title
  row.addEventListener('click', onClick)
  return row
}

function moreRow(count: number, one: string, onClick: () => void, many = `${one}s`): HTMLElement {
  const row = el('button', 'dash__item dash__item--more', `+${plural(count, one, many)}`)
  row.addEventListener('click', onClick)
  return row
}

/** An icon in a tinted square: the tier's hue, or a quiet grey. */
function glyph(name: IconName, color?: string, small = false): HTMLElement {
  const box = el('span', `dash__glyph${small ? ' dash__glyph--small' : ''}`)
  if (color) box.style.setProperty('--glyph', color)
  box.appendChild(icon(ICONS[name]))
  return box
}

function words(label: string, note: string): HTMLElement {
  const text = el('span', 'dash__itemText')
  text.appendChild(el('span', 'dash__itemLabel', label))
  text.appendChild(el('span', 'dash__itemNote', note))
  return text
}

function chevron(): HTMLElement {
  const box = el('span', 'dash__chevron')
  box.appendChild(icon(ICONS.chevronRight))
  return box
}

function statusMeter(entities: ProjectEntity[]): HTMLElement {
  return meter(
    STATUS_ORDER.map((status) => {
      const value = entities.filter((entity) => entity.status === status).length
      return { value, color: STATUS_COLOR[status], title: `${value} ${STATUS_LABEL[status].toLowerCase()}` }
    }),
  )
}

/** `2h`, `3d`: how long since, in the fewest characters a headline allows. */
function sinceShort(ms: number): string {
  if (!ms) return '—'
  const hours = Math.max(0, (Date.now() - ms) / 3_600_000)
  if (hours < 1) return 'now'
  if (hours < 24) return `${Math.floor(hours)}h`
  return `${Math.floor(hours / 24)}d`
}

function plural(count: number, one: string, many = `${one}s`): string {
  return `${count} ${count === 1 ? one : many}`
}
