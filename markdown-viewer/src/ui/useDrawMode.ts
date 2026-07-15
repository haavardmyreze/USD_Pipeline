import { useCallback, useEffect, useState } from 'react'
import { isEditableKeyboardTarget } from '../readerConfig'

/**
 * Solo draw mode: toggled from the topbar or D, exits on Escape.
 * Calls `onActivate` when entering so panels can close first.
 */
export function useDrawMode(onActivate?: () => void) {
  const [drawMode, setDrawMode] = useState(false)

  const toggleDrawMode = useCallback(() => {
    setDrawMode((current) => {
      if (!current) {
        onActivate?.()
      }
      return !current
    })
  }, [onActivate])

  const exitDrawMode = useCallback(() => {
    setDrawMode(false)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (
        event.key.toLowerCase() !== 'd' ||
        event.ctrlKey ||
        event.metaKey ||
        event.altKey ||
        isEditableKeyboardTarget(event.target)
      ) {
        return
      }

      event.preventDefault()
      toggleDrawMode()
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleDrawMode])

  useEffect(() => {
    if (!drawMode) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setDrawMode(false)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [drawMode])

  return { drawMode, toggleDrawMode, exitDrawMode, setDrawMode }
}
