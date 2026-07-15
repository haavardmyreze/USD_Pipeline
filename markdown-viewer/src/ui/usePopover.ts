import { type RefObject, useEffect } from 'react'

/**
 * Dismiss-on-outside-click and Escape handling for popovers.
 * Attach the ref to the popover's positioning container (trigger + panel).
 */
export function useDismissablePopover(
  ref: RefObject<HTMLElement | null>,
  open: boolean,
  onClose: () => void,
) {
  useEffect(() => {
    if (!open) {
      return
    }

    const onPointerDown = (event: Event) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onClose()
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open, onClose, ref])
}
