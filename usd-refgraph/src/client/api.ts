import type {
  ApiError,
  Capabilities,
  DirListing,
  Graph,
  LocateResult,
} from '@shared/types'

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

export function reveal(path: string): Promise<{ ok: boolean }> {
  return request<{ ok: boolean }>('/api/reveal', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ path }),
  })
}
