/**
 * Project overview, in four steps: how big it is, what state it is in, what
 * still needs work, and how it is wired together.
 */

import type { Project, ProjectEntity, Status } from '@shared/project'
import { STATUS_ORDER } from '@shared/project'
import {
  CATEGORY_COLOR,
  STATUS_COLOR,
  STATUS_LABEL,
  formatMoment,
  statusDot,
  statusPill,
} from '../../pipeline'
import { el } from '../../util'
import { pageShell } from './shell'

export function renderOverview(host: HTMLElement, project: Project): void {
  const body = pageShell(host, 'Project Overview', { subtitle: project.root })

  body.appendChild(headline(project))
  body.appendChild(statusCard(project))

  const attention = attentionCard(project)
  if (attention) body.appendChild(attention)

  const structure = el('div', 'grid grid--split')
  structure.appendChild(sequencesCard(project))
  structure.appendChild(dependencyCard(project))
  body.appendChild(structure)
}

/** The project's shape: three tiers, then everything else on one quiet line. */
function headline(project: Project): HTMLElement {
  const wrap = el('div', 'headline')

  const tiles = el('div', 'tiles tiles--three')
  const add = (value: number, label: string): void => {
    const tile = el('div', 'tile')
    tile.appendChild(el('div', 'tile__value', String(value)))
    tile.appendChild(el('div', 'tile__label', label))
    tiles.appendChild(tile)
  }
  const { stats } = project
  add(stats.assets, stats.assets === 1 ? 'Asset' : 'Assets')
  add(stats.sets, stats.sets === 1 ? 'Set' : 'Sets')
  add(stats.shots, stats.shots === 1 ? 'Shot' : 'Shots')
  wrap.appendChild(tiles)

  const facts = [
    `${stats.layers} published layers`,
    `${stats.textures} ${stats.textures === 1 ? 'texture' : 'textures'}`,
    `${stats.artists} ${stats.artists === 1 ? 'artist' : 'artists'}`,
    `scanned in ${Math.round(stats.elapsedMs)} ms`,
  ]
  wrap.appendChild(el('div', 'headline__facts', facts.join('  ·  ')))
  return wrap
}

function statusCard(project: Project): HTMLElement {
  const card = el('section', 'card')
  card.appendChild(el('h2', 'card__title', 'Where everything stands'))

  const counts = project.stats.byStatus
  const total = Object.values(counts).reduce((sum, n) => sum + (n ?? 0), 0)
  if (!total) {
    card.appendChild(el('p', 'muted', 'No layers carry a status yet.'))
    return card
  }

  const order: Status[] = [...STATUS_ORDER, 'unknown']

  const bar = el('div', 'meter')
  for (const status of order) {
    const count = counts[status] ?? 0
    if (!count) continue
    const segment = el('div', 'meter__part')
    segment.style.width = `${(count / total) * 100}%`
    segment.style.background = STATUS_COLOR[status]
    segment.title = `${count} ${STATUS_LABEL[status]}`
    bar.appendChild(segment)
  }
  card.appendChild(bar)

  const legend = el('div', 'legend-row')
  for (const status of order) {
    const count = counts[status] ?? 0
    if (!count) continue
    const item = el('div', 'legend-row__item')
    item.appendChild(statusDot(status))
    item.appendChild(el('span', undefined, STATUS_LABEL[status]))
    item.appendChild(el('span', 'legend-row__count', String(count)))
    legend.appendChild(item)
  }
  card.appendChild(legend)
  return card
}

/**
 * The only actionable part of the page: entities that are not yet safe to
 * build on, and anything the crawl could not make sense of.
 */
function attentionCard(project: Project): HTMLElement | null {
  const unfinished = project.entities
    .filter((entity) => entity.status === 'placeholder' || entity.status === 'unknown')
    .sort((a, b) => a.tier.localeCompare(b.tier) || a.name.localeCompare(b.name))

  const card = el('section', 'card')
  const title = el('h2', 'card__title', 'Needs attention')
  card.appendChild(title)

  if (!unfinished.length) {
    const note = el('div', 'empty-note')
    note.appendChild(el('span', undefined, 'Every entity is production ready or locked.'))
    card.appendChild(note)
    return card
  }

  title.appendChild(el('span', 'card__hint', `${unfinished.length} of ${project.entities.length}`))

  const list = el('div', 'attention')
  for (const entity of unfinished) {
    const row = el('div', 'attention__row')
    row.appendChild(statusDot(entity.status))
    row.appendChild(el('span', 'attention__name', entity.name))
    row.appendChild(el('span', 'attention__tier', entity.tier))

    // Name the blocks holding it back, which is the thing worth knowing.
    const weak = [...entity.blocks, entity.assembly]
      .filter((layer) => layer && layer.pipeline.status !== 'production_ready' && layer.pipeline.status !== 'locked')
      .map((layer) => layer!.block ?? 'assembly')
    if (weak.length) {
      row.appendChild(el('span', 'attention__why', weak.join(', ')))
    }

    row.appendChild(statusPill(entity.status, true))
    list.appendChild(row)
  }
  card.appendChild(list)
  return card
}

function sequencesCard(project: Project): HTMLElement {
  const card = el('section', 'card')
  card.appendChild(el('h2', 'card__title', 'Sequences and shots'))

  if (!project.sequences.length) {
    card.appendChild(el('p', 'muted', 'No shots found.'))
    return card
  }

  const byName = new Map(project.entities.map((e) => [e.name, e]))
  for (const sequence of project.sequences) {
    const block = el('div', 'seq')
    const head = el('div', 'seq__head')
    head.appendChild(el('span', 'seq__name', sequence.name))
    head.appendChild(
      el(
        'span',
        'seq__count',
        `${sequence.shots.length} shot${sequence.shots.length === 1 ? '' : 's'}`,
      ),
    )
    block.appendChild(head)

    const chips = el('div', 'chips')
    for (const shotName of sequence.shots) {
      const shot = byName.get(shotName)
      const chip = el('span', 'chip')
      if (shot) chip.appendChild(statusDot(shot.status))
      chip.appendChild(el('span', undefined, shotName))
      chips.appendChild(chip)
    }
    block.appendChild(chips)
    card.appendChild(block)
  }
  return card
}

function dependencyCard(project: Project): HTMLElement {
  const card = el('section', 'card')
  const title = el('h2', 'card__title', 'What depends on what')
  title.appendChild(el('span', 'card__hint', 'from real composition arcs'))
  card.appendChild(title)

  const byName = new Map(project.entities.map((e) => [e.name, e]))
  const withDeps = project.entities.filter((e) => e.dependsOn.length)

  if (!withDeps.length) {
    card.appendChild(el('p', 'muted', 'Nothing references anything else yet.'))
    return card
  }

  const list = el('div', 'deps')
  for (const entity of withDeps) {
    const row = el('div', 'deps__row')

    const source = el('span', 'chip chip--strong')
    source.appendChild(statusDot(entity.status))
    source.appendChild(el('span', undefined, entity.name))
    row.appendChild(source)

    row.appendChild(el('span', 'deps__arrow', '→'))

    const targets = el('div', 'chips')
    for (const name of entity.dependsOn) {
      const target = byName.get(name)
      const chip = el('span', 'chip')
      if (target) {
        chip.appendChild(statusDot(target.status))
        if (target.category) {
          chip.style.setProperty(
            '--chip-accent',
            CATEGORY_COLOR[target.category] ?? 'var(--fg-3)',
          )
          chip.classList.add('chip--accented')
        }
      }
      chip.appendChild(el('span', undefined, name))
      targets.appendChild(chip)
    }
    row.appendChild(targets)
    list.appendChild(row)
  }
  card.appendChild(list)
  return card
}

export function entitySort(a: ProjectEntity, b: ProjectEntity): number {
  if (a.sequence && b.sequence && a.sequence !== b.sequence) {
    return a.sequence.localeCompare(b.sequence)
  }
  if (a.shotNumber !== undefined && b.shotNumber !== undefined) {
    return a.shotNumber - b.shotNumber
  }
  return a.name.localeCompare(b.name)
}

/** Kept for the workspace, which shows who published each layer. */
export function lastPublishedLabel(entity: ProjectEntity): string {
  return formatMoment(entity.lastPublished)
}
