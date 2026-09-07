/**
 * Entities as a stack of boxes, grouped by category or sequence.
 *
 * One entity opens at a time and the rest dim back, so the thing you are
 * looking at is unambiguous. Each row carries enough to scan without opening
 * it — its rolled-up state and how many layers it has — and opening it shows
 * every published layer with its full record.
 */

import type { ProjectEntity, ProjectLayer } from '@shared/project'
import type { Status } from '@shared/pipeline'
import type { NodeTier } from '@shared/types'
import { STATUS_ALL, entitySort, entityTarget } from '@shared/project'
import {
  CATEGORY_COLOR,
  STATUS_LABEL,
  button,
  chip,
  chipRow,
  disclosure,
  emptyState,
  filterChips,
  Facts,
  groupHead,
  hashHue,
  namedCell,
  searchField,
  statusDot,
  statusPill,
  tabs,
  truncated,
} from '../kit'
import { debounce, el, formatBytes, formatMoment, matches } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const TIERS: { value: NodeTier; label: string }[] = [
  { value: 'asset', label: 'Assets' },
  { value: 'set', label: 'Sets' },
  { value: 'shot', label: 'Shots' },
]

export function renderWorkspace(host: HTMLElement, context: PageContext): void {
  const state = pageState.workspace
  const { project } = context

  const tierTabs = tabs(
    TIERS.map((tier) => ({
      ...tier,
      count: project.entities.filter((entity) => entity.tier === tier.value).length,
    })),
    state.tier,
    (tier) => {
      state.tier = tier
      state.expanded = null
      context.refresh()
    },
  )

  const controls = el('div', 'page__controls')
  controls.appendChild(
    searchField({
      placeholder: 'Filter by name',
      value: state.query,
      variant: 'inline',
      onInput: debounce((value: string) => {
        state.query = value.trim()
        context.refresh()
        focusSearch()
      }, 140),
    }),
  )
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

  const body = pageShell(host, 'Workspace', { tabs: tierTabs, controls })

  const entities = project.entities
    .filter((entity) => entity.tier === state.tier)
    .filter((entity) => !state.hiddenStatus.has(entity.status))
    .filter((entity) => !state.query || matches(entity.name, state.query))
    .sort(entitySort)

  if (!entities.length) {
    body.appendChild(
      emptyState(
        state.query || state.hiddenStatus.size
          ? 'Nothing matches the current filters.'
          : `No ${state.tier}s found in this project.`,
        {
          icon: 'inbox',
          body:
            state.query || state.hiddenStatus.size
              ? 'Clear the filter box or switch a status back on.'
              : 'The scan looks for assets, sets and shots directly under the project root.',
        },
      ),
    )
    return
  }

  const stack = el('div', 'stack')
  for (const [group, members] of groupEntities(entities, state.tier)) {
    stack.appendChild(groupBlock(group, members, context))
  }
  body.appendChild(stack)
}

/** Assets group by category, shots by sequence, sets stay in one list. */
function groupEntities(
  entities: ProjectEntity[],
  tier: NodeTier,
): [string | null, ProjectEntity[]][] {
  if (tier === 'set') return [[null, entities]]

  const groups = new Map<string, ProjectEntity[]>()
  for (const entity of entities) {
    const key = tier === 'shot' ? entity.sequence ?? 'misc' : entity.category ?? 'other'
    const list = groups.get(key)
    if (list) list.push(entity)
    else groups.set(key, [entity])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function groupBlock(
  group: string | null,
  entities: ProjectEntity[],
  context: PageContext,
): HTMLElement {
  const block = el('div', 'stack__group')

  if (group) {
    block.appendChild(
      groupHead(
        group,
        `${entities.length} ${entities.length === 1 ? 'entry' : 'entries'}`,
        CATEGORY_COLOR[group] ?? hashHue(group),
      ),
    )
  }

  const list = el('div', 'stack__list')
  for (const entity of entities) list.appendChild(entityBox(entity, context))
  block.appendChild(list)
  return block
}

function entityBox(entity: ProjectEntity, context: PageContext): HTMLElement {
  const state = pageState.workspace
  const open = state.expanded === entity.name
  const layerCount = entity.blocks.length + (entity.assembly ? 1 : 0)

  const lead: HTMLElement[] = [
    statusDot(entity.status),
    el('span', 'ebox__name', entity.name),
  ]
  if (entity.dependsOn.length) {
    const uses = el('span', 'ebox__note', `uses ${entity.dependsOn.length}`)
    uses.title = `Uses ${entity.dependsOn.join(', ')}`
    lead.push(uses)
  }

  return disclosure({
    open,
    dimmed: state.expanded !== null,
    lead,
    trail: [
      statusPill(entity.status, true),
      el('span', 'ebox__count', `${layerCount} ${layerCount === 1 ? 'layer' : 'layers'}`),
    ],
    onToggle: () => {
      state.expanded = open ? null : entity.name
      context.refresh()
    },
    panel: () => entityPanel(entity, context),
  })
}

function entityPanel(entity: ProjectEntity, context: PageContext): HTMLElement {
  const panel = el('div', 'epanel')

  const bar = el('div', 'epanel__bar')
  bar.appendChild(truncated(entity.dir, 'epanel__path'))

  const actions = el('div', 'epanel__actions')
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
    button('Copy path', {
      icon: 'copy',
      small: true,
      onClick: () => context.copyPath(entity.dir),
    }),
  )
  actions.appendChild(
    button('Reveal', {
      icon: 'external',
      small: true,
      onClick: () => context.reveal(entity.dir),
    }),
  )
  bar.appendChild(actions)
  panel.appendChild(bar)

  if (entity.dependsOn.length) {
    const byName = new Map(context.project.entities.map((e) => [e.name, e]))
    panel.appendChild(
      chipRow(
        entity.dependsOn.map((name) => {
          const other = byName.get(name)
          return chip(name, {
            status: other?.status,
            accent: other?.category ? CATEGORY_COLOR[other.category] : undefined,
          })
        }),
        'Uses',
      ),
    )
  }

  const layers: { label: string; layer: ProjectLayer }[] = []
  if (entity.assembly) layers.push({ label: 'assembly', layer: entity.assembly })
  for (const block of entity.blocks) {
    layers.push({ label: block.block ?? 'block', layer: block })
  }

  if (!layers.length) {
    panel.appendChild(emptyState('Nothing published yet.', { inline: true }))
    return panel
  }

  for (const { label, layer } of layers) {
    panel.appendChild(taskBlock(label, layer))
  }

  // Textures live inside the task that references them, above. Anything left
  // over is sitting in the folder unused, which is worth saying out loud.
  if (entity.unusedTextures.length) {
    panel.appendChild(
      chipRow(
        entity.unusedTextures.map((texture) =>
          chip(texture.name, { mono: true, muted: true, title: texture.path }),
        ),
        'Unused',
      ),
    )
  }
  return panel
}

function taskBlock(label: string, layer: ProjectLayer): HTMLElement {
  const block = el('div', 'task')

  const head = el('div', 'task__head')
  head.appendChild(el('span', 'task__label', label))
  head.appendChild(statusPill(layer.pipeline.status))
  head.appendChild(el('span', 'task__spacer'))
  head.appendChild(namedCell(layer.name, { mono: true, title: layer.path }))
  block.appendChild(head)

  const facts = new Facts({ columns: true })
  facts.add('Artist', layer.pipeline.artist)
  facts.add(
    'Published',
    layer.pipeline.exportedAt ? formatMoment(layer.pipeline.exportedAt) : null,
  )
  facts.add('Workfile', layer.pipeline.hipFile)
  facts.add('ROP', layer.pipeline.ropPath)
  facts.add('Size', layer.size !== null ? formatBytes(layer.size) : null)
  if (layer.pipeline.status === 'unknown' && layer.pipeline.statusRaw) {
    facts.add('Status as written', layer.pipeline.statusRaw)
  }
  for (const [key, value] of Object.entries(layer.pipeline.extra ?? {})) {
    facts.add(key, value)
  }
  if (!facts.isEmpty) block.appendChild(facts.root)

  if (layer.textures?.length) {
    block.appendChild(
      chipRow(
        layer.textures.map((texture) =>
          chip(texture.name, {
            mono: true,
            muted: !texture.exists,
            title: [
              texture.rawPath,
              texture.attribute ?? '',
              texture.exists ? '' : 'Not found on disk',
            ]
              .filter(Boolean)
              .join('\n'),
          }),
        ),
        'Textures',
      ),
    )
  }

  if (layer.pipeline.comment) {
    block.appendChild(el('p', 'task__comment', layer.pipeline.comment))
  }
  if (layer.error) {
    block.appendChild(el('p', 'task__error', layer.error))
  }
  return block
}

/**
 * Re-rendering replaces the filter field, so put the caret back afterwards —
 * otherwise typing a second character would go nowhere.
 */
function focusSearch(): void {
  const field = document.querySelector<HTMLInputElement>('.search--inline input')
  if (!field) return
  field.focus()
  field.setSelectionRange(field.value.length, field.value.length)
}
