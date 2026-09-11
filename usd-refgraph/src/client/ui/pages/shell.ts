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
 * The page frame every project page uses: a translucent header that the page
 * scrolls beneath, and the body below it.
 *
 * Returns the body to fill. The header is identical everywhere on purpose —
 * the only thing that changes between pages is what sits inside it.
 */
export function pageShell(
  host: HTMLElement,
  title: string,
  options: ShellOptions = {},
): HTMLElement {
  // Clearing the page collapses it for an instant, and the browser clamps its
  // scroll to the top. Remember where you were and put it back once the page
  // has rendered its content, so filtering or expanding a row keeps your place.
  const scrollTop = host.scrollTop
  clear(host)
  queueMicrotask(() => {
    host.scrollTop = scrollTop
    host.classList.toggle('is-scrolled', host.scrollTop > 2)
  })

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
  watchHeader(host, bar)
  return body
}

const scrollWatched = new WeakSet<HTMLElement>()
const headerObservers = new WeakMap<HTMLElement, ResizeObserver>()

/**
 * Keep the header's height in `--bar-h`, for sticky headings to stop beneath,
 * and mark the page `is-scrolled` once content is actually passing under the
 * header — so the scroll edge shows only when it means something.
 */
function watchHeader(host: HTMLElement, bar: HTMLElement): void {
  headerObservers.get(host)?.disconnect()
  // Measure now, so sticky headings are right on the very first frame; the
  // observer then keeps it right as the header wraps or the window resizes.
  host.style.setProperty('--bar-h', `${bar.offsetHeight}px`)
  const observer = new ResizeObserver(() => {
    host.style.setProperty('--bar-h', `${bar.offsetHeight}px`)
  })
  observer.observe(bar)
  headerObservers.set(host, observer)

  const update = (): void => {
    host.classList.toggle('is-scrolled', host.scrollTop > 2)
  }
  if (!scrollWatched.has(host)) {
    scrollWatched.add(host)
    host.addEventListener('scroll', update, { passive: true })
  }
  update()
}
