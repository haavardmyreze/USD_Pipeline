/**
 * The wire format between the crawler (Python) and the viewer (TypeScript).
 *
 * `server/usd_refgraph/model.py` mirrors these shapes and is the producing
 * side; keep the two in step.
 */

/** How one file pulls in another. */
export type ArcKind =
  | 'sublayer'
  | 'reference'
  | 'payload'
  | 'clip'
  | 'asset'
  /** Found by the catch-all sweep, with no arc we could attribute it to. */
  | 'unknown'

/** Which list-editing operation authored the arc. */
export type ListOp =
  | 'explicit'
  | 'prepend'
  | 'append'
  | 'add'
  | 'delete'
  | 'reorder'

/** What sort of file a node points at. */
export type NodeKind = 'layer' | 'asset'

/**
 * What a published filename declares under the pipeline naming convention
 * (guide §15.5): blocks carry a block token after an underscore, assemblies do
 * not. `other` is anything outside the convention.
 */
export type NodeRole = 'assembly' | 'block' | 'other'

export type NodeTier = 'asset' | 'set' | 'shot'

export type LayerFormat = 'usda' | 'usdc' | 'usdz' | 'usd' | 'other'

/** One variant selection in the scope chain an arc was authored under. */
export interface VariantScope {
  set: string
  variant: string
}

export interface LayerMeta {
  defaultPrim?: string
  upAxis?: string
  metersPerUnit?: number
  startTimeCode?: number
  endTimeCode?: number
  framesPerSecond?: number
  documentation?: string
  /** Layer-level `customLayerData`, flattened to strings for display. */
  customLayerData?: Record<string, string>
  /** Number of root prims in the layer. */
  primCount?: number
}

export interface GraphNode {
  /** Normalised absolute path; also the node id. */
  id: string
  /** Absolute path in OS form. */
  path: string
  /** Basename, e.g. `char-bob.usda`. */
  name: string
  /** Directory, absolute. */
  dir: string
  /** Directory relative to the root layer's directory; `.` when alongside. */
  relDir: string
  /** Lowercase extension without the dot. */
  ext: string
  kind: NodeKind
  format: LayerFormat
  /** False when the path could not be resolved on disk. */
  exists: boolean
  /** Bytes, when the file exists. */
  size: number | null
  /** Epoch ms, when the file exists. */
  mtime: number | null
  /** True for crate and package layers, which are not human-readable. */
  binary: boolean
  /** True once the crawler successfully opened and read the file. */
  scanned: boolean
  /** Shortest number of arcs from the root layer. */
  depth: number
  /** Populated for layers we managed to open. */
  meta: LayerMeta | null
  /** Why opening or scanning failed, when it did. */
  error: string | null
  /** For a layer inside a `.usdz`, the package file that contains it. */
  packagePath?: string
  /**
   * True for placeholder paths (`#` frame numbers, `<UDIM>` tiles) that stand
   * for a family of files rather than one file on disk.
   */
  template?: boolean
  /** What the filename declares under the naming convention. */
  role: NodeRole
  tier: NodeTier | null
  /** Human label for role and tier, e.g. `shot root`. */
  roleLabel: string
}

export interface GraphEdge {
  id: string
  /** Node id of the file that authors the arc. */
  from: string
  /** Node id of the file being pulled in. */
  to: string
  kind: ArcKind
  /** The path exactly as authored, e.g. `./char-bob.usda`. */
  rawPath: string
  /** Prim the arc was authored on; absent for layer-level arcs. */
  primPath?: string
  /** Target prim inside the referenced layer, when one was named. */
  targetPrim?: string
  /** Variant scope chain the arc sits under, outermost first. */
  variants?: VariantScope[]
  listOp?: ListOp
  /** Attribute name for `asset` arcs, e.g. `inputs:file`. */
  attribute?: string
  /** True for value-clip template paths, which contain `#` placeholders. */
  template?: boolean
  /**
   * Set only on edges synthesised by the assemblies-only view: the names of
   * the blocks the dependency actually travelled through.
   */
  via?: string[]
}

export interface GraphStats {
  layers: number
  assets: number
  missing: number
  edges: number
  maxDepth: number
  /** Total bytes of all existing files in the graph. */
  totalBytes: number
  /** Wall-clock crawl time in ms. */
  elapsedMs: number
  byArc: Record<ArcKind, number>
}

export interface GraphWarning {
  /** Node id the warning belongs to, when it is file-specific. */
  nodeId?: string
  message: string
  severity: 'info' | 'warning' | 'error'
}

export interface Graph {
  /** Node id of the layer the crawl started from. */
  rootId: string
  nodes: GraphNode[]
  edges: GraphEdge[]
  stats: GraphStats
  warnings: GraphWarning[]
  /** Cycles found during the crawl, each a list of node ids. */
  cycles: string[][]
  scannedAt: number
}

// ---------------------------------------------------------------------------
// File browsing
// ---------------------------------------------------------------------------

export interface DirEntry {
  name: string
  path: string
  isDir: boolean
  /** True for files this tool can open as a root layer. */
  isUsd: boolean
  size: number | null
  mtime: number | null
}

export interface DirListing {
  path: string
  parent: string | null
  /** Path segments for a breadcrumb, each absolute. */
  crumbs: { label: string; path: string }[]
  entries: DirEntry[]
  /** True when the listing was cut short because the directory is huge. */
  truncated: boolean
}

/** One candidate for a dropped file whose real path had to be searched for. */
export interface LocateMatch {
  path: string
  name: string
  dir: string
  size: number
  mtime: number
  /** True when the file on disk is exactly the size of the dropped one. */
  sizeMatches: boolean
}

export interface LocateResult {
  matches: LocateMatch[]
  /** True when the search hit its time or file budget before finishing. */
  truncated: boolean
  scanned: number
}

export interface Capabilities {
  usdVersion: string | null
  pythonVersion: string
  platform: string
  /** Starting points offered in the file picker: drives, home, desktop. */
  roots: { label: string; path: string }[]
}

export interface ApiError {
  error: string
  detail?: string
}
