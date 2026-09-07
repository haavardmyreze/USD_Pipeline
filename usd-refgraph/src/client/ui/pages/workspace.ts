/**
 * Entities as a stack of boxes, grouped by category or sequence.
 *
 * One entity opens at a time and the rest dim back, so the thing you are
 * looking at is unambiguous. Each entity's row carries enough to scan without
 * opening it — its rolled-up state and how many layers it has — and opening it
 * shows every published layer with its full record.
 */

import type { Project, ProjectEntity, ProjectLayer } from '@shared/project'
import type { NodeTier } from '@shared/types'
import {
  CATEGORY_COLOR,
  formatMoment,
  statusDot,
  statusPill,
} from '../../pipeline'
import { el, formatBytes } from '../../util'
import { entitySort } from './overview'
import { pageShell } from './shell'

const TIERS: { id: NodeTier; label: string }[] = [
  { id: 'asset', label: 'Assets' },
  { id: 'set', label: 'Sets' },
  { id: 'shot', label: 'Shots' },
]

let activeTier: NodeTier = 'asset'
let expanded: string | null = null

export function renderWorkspace(host: HTMLElement, project: Project): void {
  const rerender = (): void => renderWorkspace(host, project)

  // Folder-style tabs sitting on the header strip, as the manager had them.
  const tabs = el('div', 'ptabs')
  for (const tier of TIERS) {
    const count = project.entities.filter((e) => e.tier === tier.id).length
    const button = el('button', 'ptab')
    if (tier.id === activeTier) button.classList.add('is-on')
    button.appendChild(el('span', undefined, tier.label))
    button.appendChild(el('span', 'ptab__count', String(count)))
    button.addEventListener('click', () => {
      activeTier = tier.id
      expanded = null
      rerender()
    })
    tabs.appendChild(button)
  }

  // Keep `host` pointing at the page: `rerender` closes over it.
  const body = pageShell(host, 'Pipeline Workspace', { tabs })

  const entities = project.entities
    .filter((entity) => entity.tier === activeTier)
    .sort(entitySort)

  if (!entities.length) {
    const card = el('section', 'card')
    card.appendChild(el('p', 'muted', `No ${activeTier}s found in this project.`))
    body.appendChild(card)
    return
  }

  const stack = el('div', 'stack')
  for (const [group, members] of groupEntities(entities, activeTier)) {
    stack.appendChild(groupBlock(group, members, rerender))
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
    const key =
      tier === 'shot' ? entity.sequence ?? 'misc' : entity.category ?? 'other'
    const list = groups.get(key)
    if (list) list.push(entity)
    else groups.set(key, [entity])
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))
}

function groupBlock(
  group: string | null,
  entities: ProjectEntity[],
  rerender: () => void,
): HTMLElement {
  const block = el('div', 'stack__group')

  if (group) {
    const head = el('div', 'group-head')
    const badge = el('span', 'group-badge', group)
    badge.style.setProperty('--chip-accent', CATEGORY_COLOR[group] ?? groupHue(group))
    head.appendChild(badge)
    head.appendChild(
      el('span', 'group-head__count', `${entities.length} ${entities.length === 1 ? 'entry' : 'entries'}`),
    )
    block.appendChild(head)
  }

  const list = el('div', 'stack__list')
  for (const entity of entities) {
    list.appendChild(entityBox(entity, rerender))
  }
  block.appendChild(list)
  return block
}

/** A stable colour for sequence badges, which have no fixed palette. */
function groupHue(name: string): string {
  let hash = 0
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0
  return `hsl(${hash % 360} 70% 62%)`
}

function entityBox(entity: ProjectEntity, rerender: () => void): HTMLElement {
  const isOpen = expanded === entity.name
  const dimmed = expanded !== null && !isOpen

  const box = el('div', 'ebox')
  if (isOpen) box.classList.add('is-open')
  if (dimmed) box.classList.add('is-dim')

  const layerCount = entity.blocks.length + (entity.assembly ? 1 : 0)

  const row = el('button', 'ebox__row')
  row.appendChild(statusDot(entity.status))

  const name = el('span', 'ebox__name', entity.name)
  row.appendChild(name)

  if (entity.dependsOn.length) {
    const uses = el('span', 'ebox__uses', `uses ${entity.dependsOn.length}`)
    uses.title = `Uses ${entity.dependsOn.join(', ')}`
    row.appendChild(uses)
  }

  const right = el('span', 'ebox__right')
  right.appendChild(statusPill(entity.status, true))
  right.appendChild(
    el('span', 'ebox__count', `${layerCount} ${layerCount === 1 ? 'layer' : 'layers'}`),
  )
  right.appendChild(el('span', 'ebox__hint', isOpen ? 'Hide' : 'Expand'))
  row.appendChild(right)

  row.addEventListener('click', () => {
    expanded = isOpen ? null : entity.name
    rerender()
  })
  box.appendChild(row)

  if (isOpen) box.appendChild(entityPanel(entity))
  return box
}

function entityPanel(entity: ProjectEntity): HTMLElement {
  const panel = el('div', 'epanel')

  const bar = el('div', 'epanel__bar')
  bar.appendChild(el('span', 'epanel__path', entity.dir))
  panel.appendChild(bar)

  if (entity.dependsOn.length) {
    panel.appendChild(chipRow('Uses', entity.dependsOn))
  }

  const layers: { label: string; layer: ProjectLayer }[] = []
  if (entity.assembly) layers.push({ label: 'assembly', layer: entity.assembly })
  for (const block of entity.blocks) {
    layers.push({ label: `blocks / ${block.block ?? 'block'}`, layer: block })
  }

  if (!layers.length) {
    panel.appendChild(el('p', 'muted', 'Nothing published yet.'))
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
        'Unused',
        entity.unusedTextures.map((texture) => texture.name),
        true,
      ),
    )
  }
  return panel
}

function chipRow(label: string, values: string[], mono = false): HTMLElement {
  const row = el('div', 'epanel__chips')
  row.appendChild(el('span', 'epanel__label', label))
  const chips = el('div', 'chips')
  for (const value of values) {
    chips.appendChild(el('span', `chip${mono ? ' chip--mono' : ''}`, value))
  }
  row.appendChild(chips)
  return row
}

function taskBlock(label: string, layer: ProjectLayer): HTMLElement {
  const block = el('div', 'task')

  const head = el('div', 'task__head')
  head.appendChild(el('span', 'task__label', label))
  head.appendChild(statusPill(layer.pipeline.status))

  const file = el('span', 'task__file', layer.name)
  file.title = layer.path
  head.appendChild(file)
  block.appendChild(head)

  const facts = el('dl', 'facts facts--wide')
  const add = (key: string, value: string | null | undefined): void => {
    if (!value) return
    facts.appendChild(el('dt', undefined, key))
    facts.appendChild(el('dd', undefined, value))
  }
  add('Artist', layer.pipeline.artist)
  add('Published', layer.pipeline.exportedAt ? formatMoment(layer.pipeline.exportedAt) : null)
  add('HIP file', layer.pipeline.hipFile)
  add('ROP', layer.pipeline.ropPath)
  add('Size', layer.size !== null ? formatBytes(layer.size) : null)
  if (layer.pipeline.status === 'unknown' && layer.pipeline.statusRaw) {
    add('Status as written', layer.pipeline.statusRaw)
  }
  for (const [key, value] of Object.entries(layer.pipeline.extra ?? {})) add(key, value)
  block.appendChild(facts)

  if (layer.textures?.length) {
    const row = el('div', 'task__textures')
    row.appendChild(el('span', 'epanel__label', 'Textures'))
    const chips = el('div', 'chips')
    for (const texture of layer.textures) {
      const chip = el('span', 'chip chip--mono')
      if (!texture.exists) chip.classList.add('chip--missing')
      chip.appendChild(el('span', undefined, texture.name))
      chip.title = [
        texture.rawPath,
        texture.attribute ?? '',
        texture.exists ? '' : 'Not found on disk',
      ]
        .filter(Boolean)
        .join('\n')
      chips.appendChild(chip)
    }
    row.appendChild(chips)
    block.appendChild(row)
  }

  if (layer.pipeline.comment) {
    block.appendChild(el('p', 'task__comment', layer.pipeline.comment))
  }
  if (layer.error) {
    block.appendChild(el('p', 'task__error', layer.error))
  }
  return block
}
