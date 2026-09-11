/** Small DOM and formatting helpers shared across the UI. */

export function el<K extends keyof HTMLElementTagNameMap>(
  tag: K,
  className?: string,
  text?: string,
): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  if (className) node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

/** Build an inline SVG icon from raw path markup. */
export function icon(paths: string, viewBox = '0 0 16 16'): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('viewBox', viewBox)
  svg.setAttribute('aria-hidden', 'true')
  svg.innerHTML = paths
  return svg
}

export function must<T extends Element>(selector: string): T {
  const found = document.querySelector<T>(selector)
  if (!found) throw new Error(`Missing required element: ${selector}`)
  return found
}

export function clear(node: Element): void {
  node.replaceChildren()
}

/** Bytes as a compact human string: `6.6 MB`. */
export function formatBytes(bytes: number | null): string {
  if (bytes === null || bytes < 0) return '—'
  if (bytes < 1024) return `${bytes} B`
  const units = ['KB', 'MB', 'GB', 'TB']
  let value = bytes / 1024
  let unit = 0
  while (value >= 1024 && unit < units.length - 1) {
    value /= 1024
    unit++
  }
  return `${value < 10 ? value.toFixed(1) : Math.round(value)} ${units[unit]}`
}

/**
 * A recent moment reads better relative to today: `Today 14:30`,
 * `Yesterday 09:12`, then `3 Sep, 14:30` once it is older than that.
 */
export function formatDate(ms: number | null | undefined): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  const days = daysAgo(ms)
  if (days === 0) return `Today ${time}`
  if (days === 1) return `Yesterday ${time}`
  return (
    date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: days > 300 ? 'numeric' : undefined,
    }) + `, ${time}`
  )
}

/** The unambiguous form, for tooltips and detail panels: `6 Sep 2026, 14:30`. */
export function formatMoment(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** How long ago, in words: `today`, `yesterday`, `3 days ago`. */
export function formatRelative(ms: number | null | undefined): string {
  if (!ms) return '—'
  const days = daysAgo(ms)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}

/** Whole calendar days between a moment and now, in local time. */
function daysAgo(ms: number): number {
  const then = new Date(ms)
  const now = new Date()
  const thenDay = new Date(then.getFullYear(), then.getMonth(), then.getDate())
  const nowDay = new Date(now.getFullYear(), now.getMonth(), now.getDate())
  return Math.round((nowDay.getTime() - thenDay.getTime()) / 86_400_000)
}

/** `2026-9-6`, for grouping publishes by local day without timezone drift. */
export function dayKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

export function formatMs(ms: number): string {
  return ms < 1000 ? `${Math.round(ms)} ms` : `${(ms / 1000).toFixed(2)} s`
}

/** Trim a long path from the left, keeping the tail readable. */
export function truncateStart(text: string, max: number): string {
  return text.length <= max ? text : `…${text.slice(text.length - max + 1)}`
}

export function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  wait: number,
): (...args: A) => void {
  let timer: number | undefined
  return (...args: A) => {
    window.clearTimeout(timer)
    timer = window.setTimeout(() => fn(...args), wait)
  }
}

/** Case-insensitive substring match used by the filter box. */
export function matches(haystack: string, needle: string): boolean {
  return haystack.toLowerCase().includes(needle.toLowerCase())
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text)
    return true
  } catch {
    return false
  }
}

/**
 * Run `fn` on the next frame with the latest arguments, however many times it
 * was called before then. Feedback lands within one frame, and never costs
 * more work than the display can show — where a debounce would make you wait
 * for a pause in your typing before anything happened.
 */
export function nextFrame<A extends unknown[]>(fn: (...args: A) => void): (...args: A) => void {
  let pending: A | null = null
  return (...args: A) => {
    const scheduled = pending !== null
    pending = args
    if (scheduled) return
    requestAnimationFrame(() => {
      const latest = pending!
      pending = null
      fn(...latest)
    })
  }
}

/** A folder name as a title: `demo_show` and `demo-show` both read `Demo Show`. */
export function displayName(name: string): string {
  return name.replace(/[_-]+/g, ' ').replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase())
}
