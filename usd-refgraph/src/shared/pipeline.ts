/**
 * The publisher's bookkeeping, and how to read it.
 *
 * Every published layer carries its own record in `customLayerData`. The
 * project scan reads it server-side (`server/usd_refgraph/pipeline.py`), but
 * the graph crawl hands the raw `customLayerData` straight through — so the
 * viewer needs the same reader to describe a node the way the project pages
 * describe a layer. Keep this in step with the Python side.
 */

/** The publisher's status vocabulary, weakest to strongest. */
export type Status = 'placeholder' | 'production_ready' | 'locked' | 'unknown'

export const STATUS_ORDER: Status[] = ['placeholder', 'production_ready', 'locked']

/** Every status, in the order they are listed in filters and legends. */
export const STATUS_ALL: Status[] = [...STATUS_ORDER, 'unknown']

/**
 * Earlier spellings, kept so older publishes still read correctly. The tool
 * that preceded this one used wip/ready/final.
 */
const STATUS_ALIASES: Record<string, Status> = {
  placeholder: 'placeholder',
  production_ready: 'production_ready',
  productionready: 'production_ready',
  locked: 'locked',
  wip: 'placeholder',
  in_progress: 'placeholder',
  not_started: 'placeholder',
  ready: 'production_ready',
  final: 'locked',
  published: 'locked',
  approved: 'locked',
}

/** One published layer's bookkeeping. */
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

/** `customLayerData` keys lifted into typed fields. */
export const KNOWN_KEYS = new Set([
  'artist',
  'status',
  'comment',
  'hip_file',
  'rop_path',
  'export_datetime_unix',
])

export function normaliseStatus(value: string | undefined): [Status, string | undefined] {
  const raw = value?.trim()
  if (!raw) return ['unknown', undefined]
  return [STATUS_ALIASES[raw.toLowerCase().replace(/-/g, '_')] ?? 'unknown', raw]
}

/** Position in the weakest-to-strongest order; unknown sorts weakest. */
export function statusRank(status: Status): number {
  const index = STATUS_ORDER.indexOf(status)
  return index === -1 ? -1 : index
}

/** An entity is only as finished as its least finished part. */
export function rollupStatus(statuses: Status[]): Status {
  const known = statuses.filter((status) => status !== 'unknown')
  if (!known.length) return 'unknown'
  return known.reduce((weakest, status) =>
    statusRank(status) < statusRank(weakest) ? status : weakest,
  )
}

/** Lift a layer's `customLayerData` into a typed record. */
export function readRecord(
  data: Record<string, string> | null | undefined,
): PipelineRecord {
  const record: PipelineRecord = { status: 'unknown' }
  if (!data) return record

  const text = (key: string): string | undefined => {
    const value = data[key]?.trim()
    return value ? value : undefined
  }

  record.artist = text('artist')
  const [status, statusRaw] = normaliseStatus(data['status'])
  record.status = status
  if (status === 'unknown' && statusRaw) record.statusRaw = statusRaw
  record.comment = text('comment')
  record.hipFile = text('hip_file')
  record.ropPath = text('rop_path')
  record.exportedAt = epochMs(text('export_datetime_unix'))

  const extra: Record<string, string> = {}
  for (const [key, value] of Object.entries(data)) {
    if (KNOWN_KEYS.has(key)) continue
    const trimmed = String(value).trim()
    if (trimmed) extra[key] = trimmed
  }
  if (Object.keys(extra).length) record.extra = extra

  return record
}

/** True when a record holds nothing worth showing. */
export function isEmptyRecord(record: PipelineRecord): boolean {
  return (
    record.status === 'unknown' &&
    !record.artist &&
    !record.comment &&
    !record.hipFile &&
    !record.ropPath &&
    !record.exportedAt &&
    !record.extra
  )
}

/** `export_datetime_unix` is authored as a string of whole seconds. */
function epochMs(value: string | undefined): number | undefined {
  if (!value) return undefined
  const seconds = Number(value)
  if (!Number.isFinite(seconds) || seconds <= 0) return undefined
  return Math.round(seconds * 1000)
}
