import { type RefObject, useEffect, useRef, useState } from 'react'

type PreviewState = {
  x: number
  y: number
  placeAbove: boolean
}

const PREVIEW_WIDTH = 380
const SHOW_DELAY_MS = 300
const HIDE_DELAY_MS = 140

/**
 * Hover previews for internal links and footnote references: a paper-styled
 * popover with the target section (or footnote) so following a reference
 * never costs the reader their place.
 */
export function LinkPreview({ scopeRef }: { scopeRef: RefObject<HTMLElement | null> }) {
  const [state, setState] = useState<PreviewState | null>(null)
  const contentRef = useRef<HTMLDivElement | null>(null)
  const cloneRef = useRef<HTMLElement | null>(null)

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) {
      return
    }

    let showTimer = 0
    let hideTimer = 0

    const hide = () => {
      cloneRef.current = null
      setState(null)
    }

    const buildPreview = (id: string): HTMLElement | null => {
      let target: HTMLElement | null = null
      try {
        target = scope.querySelector<HTMLElement>(`#${CSS.escape(id)}`)
      } catch {
        return null
      }
      if (!target) {
        return null
      }

      const container = document.createElement('div')

      if (/^H[1-6]$/.test(target.tagName)) {
        // Clone the heading plus its section, up to the next same-level heading.
        const level = Number(target.tagName[1])
        let node: Element | null = target
        let taken = 0
        while (node && taken < 8) {
          if (
            node !== target &&
            /^H[1-6]$/.test(node.tagName) &&
            Number(node.tagName[1]) <= level
          ) {
            break
          }
          container.appendChild(node.cloneNode(true))
          node = node.nextElementSibling
          taken += 1
        }
      } else {
        container.appendChild(target.cloneNode(true))
      }

      // Clones must not leak ids or interactive chrome into the page.
      for (const el of container.querySelectorAll('[id]')) {
        el.removeAttribute('id')
      }
      for (const el of container.querySelectorAll('.code-copy, [data-footnote-backref]')) {
        el.remove()
      }

      return container.childNodes.length > 0 ? container : null
    }

    const onMouseOver = (event: Event) => {
      const target = event.target as HTMLElement | null
      const link = target?.closest?.('a[href^="#"]') as HTMLAnchorElement | null
      if (!link || !scope.contains(link)) {
        return
      }

      window.clearTimeout(hideTimer)
      window.clearTimeout(showTimer)
      showTimer = window.setTimeout(() => {
        const href = link.getAttribute('href') ?? ''
        const id = decodeURIComponent(href.slice(1))
        if (!id) {
          return
        }

        const clone = buildPreview(id)
        if (!clone) {
          return
        }

        cloneRef.current = clone
        const rect = link.getBoundingClientRect()
        const placeAbove = rect.bottom > window.innerHeight - 280
        setState({
          x: Math.min(
            Math.max(rect.left, 16),
            Math.max(16, window.innerWidth - PREVIEW_WIDTH - 16),
          ),
          y: placeAbove ? rect.top - 8 : rect.bottom + 8,
          placeAbove,
        })
      }, SHOW_DELAY_MS)
    }

    const onMouseOut = (event: Event) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest?.('a[href^="#"]')) {
        return
      }

      window.clearTimeout(showTimer)
      hideTimer = window.setTimeout(hide, HIDE_DELAY_MS)
    }

    const onScrollOrClick = () => {
      window.clearTimeout(showTimer)
      hide()
    }

    scope.addEventListener('mouseover', onMouseOver)
    scope.addEventListener('mouseout', onMouseOut)
    scope.addEventListener('click', onScrollOrClick)
    window.addEventListener('scroll', onScrollOrClick, { passive: true })
    return () => {
      window.clearTimeout(showTimer)
      window.clearTimeout(hideTimer)
      scope.removeEventListener('mouseover', onMouseOver)
      scope.removeEventListener('mouseout', onMouseOut)
      scope.removeEventListener('click', onScrollOrClick)
      window.removeEventListener('scroll', onScrollOrClick)
    }
  }, [scopeRef])

  useEffect(() => {
    if (state && contentRef.current && cloneRef.current) {
      contentRef.current.replaceChildren(cloneRef.current)
    }
  }, [state])

  if (!state) {
    return null
  }

  return (
    <div
      className={state.placeAbove ? 'link-preview link-preview-above' : 'link-preview'}
      style={{ left: state.x, top: state.y }}
      aria-hidden="true"
    >
      <div className="link-preview-body" ref={contentRef} />
    </div>
  )
}
