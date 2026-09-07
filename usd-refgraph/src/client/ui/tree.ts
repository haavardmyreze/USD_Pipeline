/**
 * The project's entities, as a list beside the graph.
 *
 * Only assemblies are listed. An assembly is what downstream work points at,
 * and the blocks behind it are already drawn as nodes in the graph itself, so
 * listing them here would only repeat the picture.
 */

import type { Project, ProjectEntity, ProjectLayer } from '@shared/project'
import type { NodeTier } from '@shared/types'
import { statusDot } from '../pipeline'
import { clear, el, matches } from '../util'

const TIER_LABEL: Record<NodeTier, string> = {
  shot: 'Shots',
  set: 'Sets',
  asset: 'Assets',
}

const TIER_ORDER: NodeTier[] = ['shot', 'set', 'asset']

export interface TreeCallbacks {
  onPick(layer: ProjectLayer): void
}

export class ProjectTree {
  private project: Project | null = null
  /** Path of the layer currently graphed, so its entity can be marked. */
  private current: string | null = null
  private query = ''

  constructor(
    private readonly host: HTMLElement,
    private readonly callbacks: TreeCallbacks,
  ) {}

  setProject(project: Project | null): void {
    this.project = project
    this.render()
  }

  setCurrent(path: string | null): void {
    this.current = path ? path.toLowerCase() : null
    this.render()
  }

  setQuery(query: string): void {
    this.query = query.trim()
    this.render()
  }

  private render(): void {
    clear(this.host)

    if (!this.project) {
      this.host.appendChild(
        el('div', 'empty-note', 'Open a project folder to list its entities here.'),
      )
      return
    }

    let shown = 0
    for (const tier of TIER_ORDER) {
      const entities = this.project.entities
        .filter((entity) => entity.tier === tier)
        .filter((entity) => !this.query || matches(entity.name, this.query))

      if (!entities.length) continue

      this.host.appendChild(el('div', 'tree__tier', TIER_LABEL[tier]))
      for (const entity of entities) {
        this.host.appendChild(this.entityRow(entity))
        shown++
      }
    }

    if (!shown) {
      this.host.appendChild(
        el(
          'div',
          'empty-note',
          this.query ? 'Nothing matches the filter.' : 'No entities found.',
        ),
      )
    }
  }

  /** The layer to graph for an entity: its assembly, or its only block. */
  private target(entity: ProjectEntity): ProjectLayer | null {
    return entity.assembly ?? entity.blocks[0] ?? null
  }

  private entityRow(entity: ProjectEntity): HTMLElement {
    const layer = this.target(entity)
    const row = el('button', 'tree__row')

    if (layer && this.current && layer.path.toLowerCase() === this.current) {
      row.classList.add('is-on')
    }

    row.appendChild(statusDot(entity.status))
    row.appendChild(el('span', 'tree__name', entity.name))

    const count = entity.blocks.length + (entity.assembly ? 1 : 0)
    row.appendChild(el('span', 'tree__count', String(count)))

    row.title = layer
      ? `${layer.name}\n${entity.dir}`
      : `${entity.name} has nothing published`
    row.disabled = !layer
    if (layer) row.addEventListener('click', () => this.callbacks.onPick(layer))
    return row
  }
}
