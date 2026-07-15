import { useCallback, useEffect, useState } from 'react'

/**
 * Solo draw mode: toggled from the topbar, exits on Escape.
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
