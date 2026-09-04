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

export function formatDate(ms: number | null): string {
  if (!ms) return '—'
  const date = new Date(ms)
  const now = Date.now()
  const days = (now - ms) / 86_400_000
  const time = date.toLocaleTimeString(undefined, {
    hour: '2-digit',
    minute: '2-digit',
  })
  if (days < 1 && date.getDate() === new Date(now).getDate()) return `Today ${time}`
  if (days < 2) return `Yesterday ${time}`
  return (
    date.toLocaleDateString(undefined, {
      day: 'numeric',
      month: 'short',
      year: days > 300 ? 'numeric' : undefined,
    }) + ` ${time}`
  )
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
