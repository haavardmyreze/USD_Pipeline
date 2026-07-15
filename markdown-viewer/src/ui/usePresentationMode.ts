import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditableKeyboardTarget } from '../readerConfig'

export type PresentationMode = 'draw' | 'laser' | null

/**
 * Draw and laser are solo modes: toggled from the topbar or D / L, exit on Escape.
 * Only one can be active at a time. Calls `onActivate` when entering either mode.
 */
export function usePresentationMode(onActivate?: () => void) {
  const [mode, setMode] = useState<PresentationMode>(null)

  const drawMode = mode === 'draw'
  const laserMode = mode === 'laser'

  const exitPresentationMode = useCallback(() => {
    setMode(null)
  }, [])

  const toggleDrawMode = useCallback(() => {
    setMode((current) => {
      if (current === 'draw') {
        return null
      }
      onActivate?.()
      return 'draw'
    })
  }, [onActivate])

  const toggleLaserMode = useCallback(() => {
    setMode((current) => {
      if (current === 'laser') {
        return null
      }
      onActivate?.()
      return 'laser'
    })
  }, [onActivate])

  const setDrawMode = useCallback((active: boolean) => {
    setMode((current) => {
      if (active) {
        if (current === 'draw') {
          return current
        }
        onActivate?.()
        return 'draw'
      }
      return current === 'draw' ? null : current
    })
  }, [onActivate])

  const modeRef = useRef(mode)
  modeRef.current = mode

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      const key = event.key.toLowerCase()

      if (key === 'd') {
        event.preventDefault()
        toggleDrawMode()
        return
      }

      if (key === 'l') {
        event.preventDefault()
        toggleLaserMode()
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggleDrawMode, toggleLaserMode])

  useEffect(() => {
    if (!mode) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault()
        setMode(null)
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [mode])

  return {
    mode,
    drawMode,
    laserMode,
    toggleDrawMode,
    toggleLaserMode,
    exitPresentationMode,
    setDrawMode,
    modeRef,
  }
}
