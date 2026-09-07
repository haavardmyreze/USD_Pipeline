import { clear, el } from '../../util'

export interface ShellOptions {
  subtitle?: string
  /** A short fact pinned to the right of the title, e.g. `24 workfiles`. */
  meta?: string
  /** Controls that belong beside the title in the header strip. */
  actions?: HTMLElement
  /** A full-width row of controls under the title, inside the header strip. */
  controls?: HTMLElement
  /** Folder-style tabs sitting along the bottom edge of the header strip. */
  tabs?: HTMLElement
}

/**
 * The page frame every project page uses: a fixed header strip on the panel
 * surface, and a scrolling body on the darker page surface below it.
 *
 * Returns the body to fill. The header is identical everywhere on purpose —
 * the only thing that changes between pages is what sits inside it.
 */
export function pageShell(
  host: HTMLElement,
  title: string,
  options: ShellOptions = {},
): HTMLElement {
  clear(host)

  const bar = el('div', 'page__bar')

  const top = el('div', 'page__barTop')
  const text = el('div', 'page__heading')
  text.appendChild(el('h1', 'page__title', title))
  if (options.subtitle) text.appendChild(el('p', 'page__sub', options.subtitle))
  top.appendChild(text)

  const right = el('div', 'page__barRight')
  if (options.meta) right.appendChild(el('span', 'page__meta', options.meta))
  if (options.actions) right.appendChild(options.actions)
  if (right.childElementCount) top.appendChild(right)
  bar.appendChild(top)

  if (options.controls) bar.appendChild(options.controls)
  if (options.tabs) bar.appendChild(options.tabs)
  host.appendChild(bar)

  const body = el('div', 'page__body')
  host.appendChild(body)
  return body
}
