import type {
  ApiError,
  Capabilities,
  DirListing,
  Graph,
  LayerSource,
  LocateResult,
  PrimDetail,
  SceneLevel,
  SceneSubtree,
} from '@shared/types'
import type { Project } from '@shared/project'

export class ApiFailure extends Error {
  constructor(
    message: string,
    readonly detail?: string,
    readonly status?: number,
  ) {
    super(message)
    this.name = 'ApiFailure'
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response
  try {
    response = await fetch(path, init)
  } catch {
    throw new ApiFailure(
      'Cannot reach the crawler',
      'The Python backend is not responding. Is it still running?',
    )
  }

  if (!response.ok) {
    let payload: ApiError | null = null
    try {
      payload = (await response.json()) as ApiError
    } catch {
      /* not JSON; fall through to the status text */
    }
    throw new ApiFailure(
      payload?.error ?? response.statusText ?? 'Request failed',
      payload?.detail,
      response.status,
    )
  }

  return (await response.json()) as T
}

export function getCapabilities(): Promise<Capabilities> {
  return request<Capabilities>('/api/caps')
}

export function browse(path: string): Promise<DirListing> {
  return request<DirListing>(`/api/browse?path=${encodeURIComponent(path)}`)
}

export interface GraphOptions {
  includeAssets: boolean
  maxDepth?: number
}

export function getGraph(path: string, options: GraphOptions): Promise<Graph> {
  const params = new URLSearchParams({
    path,
    assets: options.includeAssets ? '1' : '0',
  })
  if (options.maxDepth !== undefined) params.set('maxDepth', String(options.maxDepth))
  return request<Graph>(`/api/graph?${params}`)
}

/** The children of one prim on the stage composed from `path`. */
export function getScene(path: string, prim: string, payloads: boolean): Promise<SceneLevel> {
  const params = new URLSearchParams({ path, prim, payloads: payloads ? '1' : '0' })
  return request<SceneLevel>(`/api/scene?${params}`)
}

/** A layer's text: as on disk, or converted to usda for a binary layer. */
export function getSource(path: string): Promise<LayerSource> {
  return request<LayerSource>(`/api/source?path=${encodeURIComponent(path)}`)
}

/** Every level beneath one prim, for expanding a whole branch at once. */
export function getSubtree(path: string, prim: string, payloads: boolean): Promise<SceneSubtree> {
  const params = new URLSearchParams({ path, prim, payloads: payloads ? '1' : '0' })
  return request<SceneSubtree>(`/api/subtree?${params}`)
}

export function getPrim(path: string, prim: string, payloads: boolean): Promise<PrimDetail> {
  const params = new URLSearchParams({ path, prim, payloads: payloads ? '1' : '0' })
  return request<PrimDetail>(`/api/prim?${params}`)
}

/**
 * Find a dropped file's real path. Browsers hand over a file's name and bytes
 * but never its location, so the backend searches the directories we already
 * know about.
 */
export function locate(
  name: string,
  size: number | null,
  roots: string[],
): Promise<LocateResult> {
  const params = new URLSearchParams({ name })
  if (size !== null) params.set('size', String(size))
  for (const root of roots) params.append('root', root)
  return request<LocateResult>(`/api/locate?${params}`)
}

/**
 * Scan the project tree that contains `path`. The backend walks up from the
 * file to find the folder holding assets/sets/shots, then reads every
 * published layer's metadata.
 */
export function getProject(path: string): Promise<Project> {
  return request<Project>(`/api/project?path=${encodeURIComponent(path)}`)
}

export function reveal(path: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
}
