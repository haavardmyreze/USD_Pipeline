import { useEffect } from 'react'
import type { Theme } from '../theme'

/** Keep the page backdrop in sync with the active reader theme (no body black bars). */
export function useReaderPageTheme(theme: Theme) {
  useEffect(() => {
    const root = document.documentElement
    const previous = root.getAttribute('data-theme')
    root.setAttribute('data-theme', theme)

    return () => {
      if (previous) {
        root.setAttribute('data-theme', previous)
      } else {
        root.removeAttribute('data-theme')
      }
    }
  }, [theme])
}
