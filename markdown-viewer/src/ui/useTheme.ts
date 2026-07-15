import { useCallback, useEffect, useMemo, useState } from 'react'
import { withViewTransition } from './viewTransition'
import {
  DEFAULT_THEME_PREFERENCE,
  paletteFor,
  resolveThemePreference,
  serializeThemePreference,
  type Theme,
  type ThemePreference,
} from '../theme'

const STORAGE_KEY = 'mdv-theme'

function useSystemDark(): boolean {
  const [systemDark, setSystemDark] = useState(
    () => window.matchMedia?.('(prefers-color-scheme: dark)').matches ?? false,
  )

  useEffect(() => {
    const media = window.matchMedia?.('(prefers-color-scheme: dark)')
    if (!media) {
      return
    }

    const onChange = (event: MediaQueryListEvent) => setSystemDark(event.matches)
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  return systemDark
}

export function useTheme(): {
  themePreference: ThemePreference
  theme: Theme
  setThemePreference: (preference: ThemePreference) => void
} {
  const [themePreference, setPreferenceState] = useState<ThemePreference>(() => {
    try {
      return resolveThemePreference(localStorage.getItem(STORAGE_KEY))
    } catch {
      return DEFAULT_THEME_PREFERENCE
    }
  })
  const systemDark = useSystemDark()

  const setThemePreference = useCallback((preference: ThemePreference) => {
    withViewTransition(() => {
      setPreferenceState(preference)
    })
    try {
      localStorage.setItem(STORAGE_KEY, serializeThemePreference(preference))
    } catch {
      // ignore persistence errors (e.g. private mode)
    }
  }, [])

  const theme = useMemo(
    () => paletteFor(themePreference, systemDark),
    [themePreference, systemDark],
  )

  return { themePreference, theme, setThemePreference }
}
