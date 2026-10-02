/**
 * The workspace as a split browser: every entity in a list on the left, one
 * entity in full on the right.
 *
 * The list is for finding — a filter, a tier switch, and a strip per entity
 * with one mark per published file, so its state reads without opening it.
 * The right side is for reading: a card per published file with its whole
 * publish record, and beside them what the entity uses, what uses it, and
 * what sits in its folder.
 *
 * Blocks are free-form. A card is labelled with whatever block token the
 * file carries, and nothing here assumes a fixed set of steps.
 */

import type { Project, ProjectEntity, ProjectLayer } from '@shared/project'
import type { NodeTier } from '@shared/types'
import { entityLayers, entitySort, entityTarget, layerStep } from '@shared/project'
import {
  button,
  emptyState,
  markLayer,
  searchField,
  statusDot,
  statusPill,
  statusStrip,
  tabs,
  truncated,
} from '../kit'
import { clear, el, formatBytes, formatMoment, formatRelative, matches, nextFrame } from '../../util'
import { pageState, type PageContext } from './context'

const TIER_TABS: { value: NodeTier | 'all'; label: string }[] = [
  { value: 'all', label: 'All' },
  { value: 'asset', label: 'Assets' },
  { value: 'set', label: 'Sets' },
  { value: 'shot', label: 'Shots' },
]

const TIER_HEADING: Record<NodeTier, string> = {
  asset: 'Assets',
  set: 'Sets',
  shot: 'Shots',
}

export function renderWorkspace(host: HTMLElement, context: PageContext): void {
  const state = pageState.workspace
  const { project } = context

  // The list keeps its own scroll, which a re-render would otherwise lose.
  const listScroll = host.querySelector('.split__list')?.scrollTop ?? 0
  const detailScroll = host.querySelector('.split__detail')?.scrollTop ?? 0
  const refocusFilter = document.activeElement?.closest('.split__side .search') !== null
    && host.contains(document.activeElement)

  const visible = project.entities
    .filter((entity) => state.tier === 'all' || entity.tier === state.tier)
    .filter((entity) => !state.query || matches(entity.name, state.query))
    .sort(tierThenName)

  // Keep the selection while it is still in the list; otherwise land on the
  // first entry, so the right side is never empty when there is anything.
  let selected = project.entities.find((entity) => entity.name === state.selected) ?? null
  if (!selected || !visible.includes(selected)) selected = visible[0] ?? null
  state.selected = selected?.name ?? null

  clear(host)
  const split = el('div', 'split')
  split.appendChild(buildSide(project, visible, selected, context))
  split.appendChild(buildDetail(project, selected, context))
  host.appendChild(split)

  split.querySelector('.split__list')!.scrollTop = listScroll
  split.querySelector('.split__detail')!.scrollTop = detailScroll
  if (refocusFilter) {
    const field = split.querySelector<HTMLInputElement>('.split__side input')
    field?.focus()
    field?.setSelectionRange(field.value.length, field.value.length)
  }
}

/** Assets, then sets, then shots; shots in sequence order, the rest by name. */
function tierThenName(a: ProjectEntity, b: ProjectEntity): number {
  const order: NodeTier[] = ['asset', 'set', 'shot']
  return order.indexOf(a.tier) - order.indexOf(b.tier) || entitySort(a, b)
}

// ---------------------------------------------------------------------------
// The list
// ---------------------------------------------------------------------------

function buildSide(
  project: Project,
  visible: ProjectEntity[],
  selected: ProjectEntity | null,
  context: PageContext,
): HTMLElement {
  const state = pageState.workspace
  const side = el('aside', 'split__side')

  const head = el('div', 'split__sideHead')
  head.appendChild(
    searchField({
      placeholder: `Filter ${project.entities.length} entities`,
      value: state.query,
      variant: 'rail',
      onInput: nextFrame((value: string) => {
        state.query = value.trim()
        context.refresh()
      }),
    }),
  )
  head.appendChild(
    tabs(
      TIER_TABS.map((tier) => ({
        ...tier,
        count: project.entities.filter((e) => tier.value === 'all' || e.tier === tier.value).length,
      })),
      state.tier,
      (tier) => {
        state.tier = tier
        context.refresh()
      },
    ),
  )
  side.appendChild(head)

  const list = el('div', 'split__list')
  list.setAttribute('role', 'listbox')
  if (!visible.length) {
    list.appendChild(emptyState('Nothing matches.', { inline: true, body: 'Clear the filter or pick another tier.' }))
  }

  let lastGroup = ''
  for (const entity of visible) {
    const group = groupLabel(entity)
    if (group !== lastGroup) {
      list.appendChild(el('div', 'split__group', group))
      lastGroup = group
    }
    list.appendChild(entityRow(entity, entity === selected, context))
  }
  side.appendChild(list)
  return side
}

/** Shots group by sequence; assets and sets are one group each. */
function groupLabel(entity: ProjectEntity): string {
  if (entity.tier === 'shot' && entity.sequence) return `Shots · ${entity.sequence}`
  return TIER_HEADING[entity.tier]
}

function entityRow(entity: ProjectEntity, on: boolean, context: PageContext): HTMLElement {
  const row = el('button', `split__row${on ? ' is-on' : ''}`)
  row.setAttribute('role', 'option')
  row.setAttribute('aria-selected', String(on))

  row.appendChild(statusDot(entity.status))

  const text = el('span', 'split__rowText')
  text.appendChild(el('span', 'split__rowName', entity.name))
  const files = entityLayers(entity)
  const sub = [
    entity.category ?? null,
    `${files.length} ${files.length === 1 ? 'layer' : 'layers'}`,
    latestArtist(files),
  ].filter(Boolean)
  text.appendChild(el('span', 'split__rowSub', sub.join(' · ')))
  row.appendChild(text)

  row.appendChild(
    statusStrip(files.map((file) => ({ status: file.pipeline.status, label: layerStep(file) }))),
  )
  row.addEventListener('click', () => {
    pageState.workspace.selected = entity.name
    context.refresh()
  })
  return row
}

// ---------------------------------------------------------------------------
// The entity in full
// ---------------------------------------------------------------------------

function buildDetail(
  project: Project,
  entity: ProjectEntity | null,
  context: PageContext,
): HTMLElement {
  const detail = el('section', 'split__detail')
  if (!entity) {
    detail.appendChild(
      emptyState('No entities', {
        icon: 'inbox',
        body: 'The scan looks for assets, sets and shots directly under the project root.',
      }),
    )
    return detail
  }

  detail.appendChild(detailHead(entity, context))

  const body = el('div', 'wsp__body')
  const cards = el('div', 'wsp__cards')
  const files = entityLayers(entity)
  if (!files.length) cards.appendChild(emptyState('Nothing published yet.', { inline: true }))
  for (const file of files) cards.appendChild(fileCard(file))
  body.appendChild(cards)
  body.appendChild(relations(project, entity, context))
  detail.appendChild(body)
  return detail
}

function detailHead(entity: ProjectEntity, context: PageContext): HTMLElement {
  const head = el('header', 'split__head')

  const title = el('div', 'split__title')
  const line = el('div', 'split__titleLine')
  line.appendChild(el('h1', 'split__name', entity.name))
  line.appendChild(statusPill(entity.status, true))
  const badge = entity.category ?? entity.sequence
  if (badge) {
    line.appendChild(el('span', 'split__badge', badge))
  }
  title.appendChild(line)
  title.appendChild(truncated(entity.dir, 'split__path'))
  head.appendChild(title)

  const actions = el('div', 'split__actions')
  const target = entityTarget(entity)
  if (target) {
    actions.appendChild(
      button('Graph it', {
        icon: 'graph',
        small: true,
        variant: 'primary',
        title: `Draw the reference graph for ${target.name}`,
        onClick: () => context.openLayer(target.path),
      }),
    )
  }
  actions.appendChild(
    button('Copy path', { icon: 'copy', small: true, onClick: () => context.copyPath(entity.dir) }),
  )
  actions.appendChild(
    button('Reveal', { icon: 'external', small: true, onClick: () => context.reveal(entity.dir) }),
  )
  head.appendChild(actions)
  return head
}

/** A published file and its whole record. Picking it opens the file panel. */
function fileCard(file: ProjectLayer): HTMLElement {
  const card = markLayer(el('article', 'fcard'), file.path)
  card.title = file.path

  const lead = el('div', 'fcard__lead')
  lead.appendChild(el('span', 'fcard__step', layerStep(file)))
  lead.appendChild(statusPill(file.pipeline.status, true))
  card.appendChild(lead)

  const main = el('div', 'fcard__main')
  const top = el('div', 'fcard__top')
  top.appendChild(truncated(file.name, 'fcard__file'))
  // The exact moment is a hover away; the card says how long ago, once.
  const when = file.pipeline.exportedAt ?? file.mtime
  if (when) {
    const ago = el('span', 'fcard__when', formatRelative(when))
    ago.title = `${file.pipeline.exportedAt ? 'Published' : 'Modified'} ${formatMoment(when)}`
    top.appendChild(ago)
  }
  main.appendChild(top)

  // Each fact is named on hover, since a workfile and a ROP path look alike.
  const record = file.pipeline
  const facts = el('div', 'fcard__facts')
  const fact = (label: string, text: string | null | undefined, mono = false): void => {
    if (!text) return
    const node = truncated(text, mono ? 'fcard__fact fcard__fact--mono' : 'fcard__fact')
    node.title = `${label}: ${text}`
    facts.appendChild(node)
  }
  fact('Artist', record.artist)
  fact('Workfile', record.hipFile, true)
  fact('ROP', record.ropPath, true)
  fact('Size', file.size !== null ? formatBytes(file.size) : null)
  if (facts.childElementCount) main.appendChild(facts)

  if (record.comment) {
    const comment = el('p', 'fcard__comment', record.comment)
    comment.title = 'Publish comment'
    main.appendChild(comment)
  }

  if (file.textures?.length) {
    const chips = el('div', 'fcard__textures')
    for (const texture of file.textures) {
      const missing = !texture.exists && !texture.template
      const chip = el('span', `tchip${missing ? ' tchip--missing' : ''}`, texture.name)
      if (missing) chip.appendChild(el('span', 'tchip__note', 'missing'))
      chip.title = [texture.rawPath, texture.attribute ?? ''].filter(Boolean).join('\n')
      chips.appendChild(chip)
    }
    main.appendChild(chips)
  }

  if (file.error) main.appendChild(el('p', 'fcard__error', file.error))
  card.appendChild(main)
  return card
}

function relations(project: Project, entity: ProjectEntity, context: PageContext): HTMLElement {
  const column = el('div', 'wsp__aside')
  const byName = new Map(project.entities.map((e) => [e.name, e]))

  const uses = entity.dependsOn.map((name) => byName.get(name)).filter(isEntity)
  const usedBy = project.entities.filter((other) => other.dependsOn.includes(entity.name))

  column.appendChild(relationCard('Uses', uses, 'Pulls in no other entity.', context))
  column.appendChild(relationCard('Used by', usedBy, 'Nothing else pulls this in.', context))
  column.appendChild(folderCard(entity))
  return column
}

function relationCard(
  title: string,
  entities: ProjectEntity[],
  empty: string,
  context: PageContext,
): HTMLElement {
  const card = el('section', 'rcard')
  card.appendChild(el('h2', 'rcard__title', title))
  if (!entities.length) {
    card.appendChild(el('p', 'rcard__empty', empty))
    return card
  }
  for (const other of entities) {
    const row = el('button', 'rcard__row')
    row.appendChild(statusDot(other.status))
    row.appendChild(el('span', 'rcard__name', other.name))
    row.appendChild(el('span', 'rcard__note', TIER_HEADING[other.tier].slice(0, -1).toLowerCase()))
    row.title = `Show ${other.name}`
    row.addEventListener('click', () => {
      const state = pageState.workspace
      state.selected = other.name
      // The entity has to be in the list to be shown, so widen it if needed.
      if (state.tier !== 'all' && state.tier !== other.tier) state.tier = 'all'
      if (state.query && !matches(other.name, state.query)) state.query = ''
      context.refresh()
    })
    card.appendChild(row)
  }
  return card
}

function folderCard(entity: ProjectEntity): HTMLElement {
  const card = el('section', 'rcard')
  card.appendChild(el('h2', 'rcard__title', 'Folder'))
  const list = el('div', 'rcard__files')
  for (const file of entityLayers(entity)) list.appendChild(truncated(file.name, 'rcard__file'))
  if (entity.textures.length) {
    const count = entity.textures.length
    list.appendChild(
      el('span', 'rcard__file rcard__file--dim', `${count} texture ${count === 1 ? 'file' : 'files'}`),
    )
  }
  for (const texture of entity.unusedTextures) {
    const line = truncated(`${texture.name} · unused`, 'rcard__file rcard__file--dim')
    line.title = `${texture.path}\nNo layer references this file`
    list.appendChild(line)
  }
  if (!list.childElementCount) list.appendChild(el('p', 'rcard__empty', 'Empty.'))
  card.appendChild(list)
  return card
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function latestArtist(files: ProjectLayer[]): string | null {
  let best: ProjectLayer | null = null
  for (const file of files) {
    if (!file.pipeline.artist) continue
    if (!best || (file.pipeline.exportedAt ?? 0) > (best.pipeline.exportedAt ?? 0)) best = file
  }
  return best?.pipeline.artist ?? null
}

function isEntity(value: ProjectEntity | undefined): value is ProjectEntity {
  return value !== undefined
}
