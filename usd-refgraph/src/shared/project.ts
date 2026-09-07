/**
 * The project model, rebuilt from the files on disk.
 *
 * There is no project database: publishing writes each layer's bookkeeping into
 * the layer itself, and the naming convention says which entity and block a
 * file belongs to. `server/usd_refgraph/project.py` derives this and is the
 * producing side; keep the two in step.
 */

import type { NodeRole, NodeTier } from './types'
import type { PipelineRecord, Status } from './pipeline'

export type { PipelineRecord, Status }
export {
  STATUS_ALL,
  STATUS_ORDER,
  isEmptyRecord,
  normaliseStatus,
  readRecord,
  rollupStatus,
  statusRank,
} from './pipeline'

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

/**
 * The layer to draw when someone asks for an entity's graph: its assembly,
 * which is what downstream work points at, or its only block when there is no
 * assembly yet.
 */
export function entityTarget(entity: ProjectEntity): ProjectLayer | null {
  return entity.assembly ?? entity.blocks[0] ?? null
}

/** Shots read best in sequence-and-number order, everything else by name. */
export function entitySort(a: ProjectEntity, b: ProjectEntity): number {
  if (a.sequence && b.sequence && a.sequence !== b.sequence) {
    return a.sequence.localeCompare(b.sequence)
  }
  if (a.shotNumber !== undefined && b.shotNumber !== undefined) {
    return a.shotNumber - b.shotNumber
  }
  return a.name.localeCompare(b.name)
}

/** Most recently published first; anything undated sorts last. */
export function byRecency(a: TaskRow, b: TaskRow): number {
  return (b.layer.pipeline.exportedAt ?? 0) - (a.layer.pipeline.exportedAt ?? 0)
}
