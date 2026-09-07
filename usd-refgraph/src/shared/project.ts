/**
 * The project model, rebuilt from the files on disk.
 *
 * There is no project database: publishing writes each layer's bookkeeping into
 * the layer itself, and the naming convention says which entity and block a
 * file belongs to. `server/usd_refgraph/project.py` derives this and is the
 * producing side; keep the two in step.
 */

import type { NodeRole, NodeTier } from './types'

/** The publisher's status vocabulary, weakest to strongest. */
export type Status = 'placeholder' | 'production_ready' | 'locked' | 'unknown'

export const STATUS_ORDER: Status[] = ['placeholder', 'production_ready', 'locked']

/** One published layer's bookkeeping, from `customLayerData`. */
export interface PipelineRecord {
  status: Status
  /** The status exactly as authored, when it did not match the vocabulary. */
  statusRaw?: string
  artist?: string
  comment?: string
  hipFile?: string
  /** The Houdini ROP that wrote the layer, e.g. `/stage/Bob_Lookdev/rop2`. */
  ropPath?: string
  /** Publish time, epoch milliseconds. */
  exportedAt?: number
  /** Any `customLayerData` keys we did not recognise. */
  extra?: Record<string, string>
}

/** A texture a layer references through an asset-valued attribute. */
export interface TextureRef {
  path: string
  name: string
  /** The path exactly as authored. */
  rawPath: string
  /** True for `<UDIM>` or `#` paths, which stand for a family of files. */
  template: boolean
  exists: boolean
  /** The attribute it came from, e.g. `inputs:file`. */
  attribute?: string | null
}

export interface ProjectLayer {
  path: string
  name: string
  ext: string
  role: NodeRole
  roleLabel: string
  tier: NodeTier | null
  /** The entity this file belongs to, e.g. `char-bob`. */
  entity: string
  /** The block token, or null for an assembly. */
  block: string | null
  size: number | null
  mtime: number | null
  pipeline: PipelineRecord
  /** Names of other entities this file pulls in. */
  dependsOn?: string[]
  /** Textures this layer itself references. */
  textures?: TextureRef[]
  error?: string
}

export interface ProjectEntity {
  name: string
  tier: NodeTier
  dir: string
  /** Rolled up from the parts: an entity is only as finished as its weakest. */
  status: Status
  assembly: ProjectLayer | null
  blocks: ProjectLayer[]
  /** Every texture file sitting in the entity's folder. */
  textures: ProjectLayer[]
  /** Those of them no layer references — orphans worth noticing. */
  unusedTextures: ProjectLayer[]
  artists: string[]
  dependsOn: string[]
  lastPublished: number | null
  /** From the asset prefix: character, prop, environment, vehicle, fx, set. */
  category?: string
  sequence?: string
  shotNumber?: number
}

export interface ProjectStats {
  assets: number
  sets: number
  shots: number
  artists: number
  layers: number
  textures: number
  publishes: number
  byStatus: Partial<Record<Status, number>>
  elapsedMs: number
}

export interface Project {
  root: string
  name: string
  entities: ProjectEntity[]
  artists: string[]
  /** Every block name seen, for the workspace grid's columns. */
  blockNames: string[]
  sequences: { name: string; shots: string[] }[]
  stats: ProjectStats
  warnings: string[]
  scannedAt: number
}

/** One row of the artist workload table. */
export interface TaskRow {
  entity: ProjectEntity
  layer: ProjectLayer
  /** Block name, or `assembly`. */
  step: string
}

export function entityTasks(entity: ProjectEntity): TaskRow[] {
  const rows: TaskRow[] = entity.blocks.map((layer) => ({
    entity,
    layer,
    step: layer.block ?? 'block',
  }))
  if (entity.assembly) {
    rows.push({ entity, layer: entity.assembly, step: 'assembly' })
  }
  return rows
}

export function allTasks(project: Project): TaskRow[] {
  return project.entities.flatMap(entityTasks)
}
