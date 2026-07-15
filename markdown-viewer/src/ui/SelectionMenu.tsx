import {
  type ReactNode,
  type RefObject,
  useEffect,
  useRef,
  useState,
} from 'react'

export type SelectionAction = {
  id: string
  label: string
  icon?: ReactNode
  onRun: (selectionText: string) => void
}

type SelectionMenuProps = {
  /** Selections outside this element are ignored. */
  scopeRef: RefObject<HTMLElement | null>
  disabled?: boolean
  actions: SelectionAction[]
}

type MenuState = {
  x: number
  y: number
  text: string
}

/**
 * Floating action menu that appears above a text selection — the selection
 * is the interface: comment, ask, copy without reaching for a panel.
 */
export function SelectionMenu({ scopeRef, disabled, actions }: SelectionMenuProps) {
  const [state, setState] = useState<MenuState | null>(null)
  const visibleRef = useRef(false)

  useEffect(() => {
    visibleRef.current = state !== null
  }, [state])

  useEffect(() => {
    if (disabled) {
      setState(null)
      return
    }

    let frame = 0

    const update = () => {
      const scope = scopeRef.current
      const selection = window.getSelection()
      if (!scope || !selection || selection.isCollapsed || selection.rangeCount === 0) {
        setState(null)
        return
      }

      const range = selection.getRangeAt(0)
      if (!scope.contains(range.commonAncestorContainer)) {
        setState(null)
        return
      }

      const text = selection.toString().trim()
      if (!text) {
        setState(null)
        return
      }

      const rect = range.getBoundingClientRect()
      if (rect.width === 0 && rect.height === 0) {
        setState(null)
        return
      }

      const x = Math.min(
        Math.max(rect.left + rect.width / 2, 110),
        window.innerWidth - 110,
      )
      const y = Math.max(rect.top, 64)
      setState({ x, y, text })
    }

    const schedule = () => {
      window.cancelAnimationFrame(frame)
      frame = window.requestAnimationFrame(update)
    }

    const onMouseUp = () => schedule()

    const onSelectionChange = () => {
      const selection = window.getSelection()
      if (!selection || selection.isCollapsed) {
        setState(null)
      }
    }

    // Keep the menu attached to the selection while scrolling, but only
    // once it is already visible — never summon it from a scroll.
    const onScroll = () => {
      if (visibleRef.current) {
        schedule()
      }
    }

    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('selectionchange', onSelectionChange)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.cancelAnimationFrame(frame)
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('selectionchange', onSelectionChange)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [disabled, scopeRef])

  if (!state) {
    return null
  }

  return (
    <div
      className="selection-menu"
      role="toolbar"
      aria-label="Selection actions"
      style={{ left: state.x, top: state.y }}
    >
      {actions.map((action) => (
        <button
          key={action.id}
          type="button"
          className="selection-menu-button"
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            const text = state.text
            setState(null)
            action.onRun(text)
          }}
        >
          {action.icon}
          <span>{action.label}</span>
        </button>
      ))}
    </div>
  )
}
