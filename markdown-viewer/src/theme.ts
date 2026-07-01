export type Theme =
  | 'slate'
  | 'sepia'
  | 'ink'
  | 'crimson'
  | 'notion'
  | 'nord'
  | 'forest'
  | 'dusk'
  | 'ink-night'
  | 'graphite'
  | 'ash'
  | 'stone'

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'slate', label: 'Slate' },
  { id: 'notion', label: 'Notion' },
  { id: 'nord', label: 'Nord' },
  { id: 'forest', label: 'Forest' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'ink', label: 'Ink' },
  { id: 'ink-night', label: 'Ink Night' },
  { id: 'graphite', label: 'Graphite' },
  { id: 'ash', label: 'Ash' },
  { id: 'stone', label: 'Stone' },
]

export const DEFAULT_THEME: Theme = 'slate'

const LEGACY_THEME_MAP: Record<string, Theme> = {
  'slate-night': 'graphite',
  'nord-night': 'ash',
  'forest-night': 'stone',
  'dusk-night': 'stone',
}

export function isTheme(value: string | null): value is Theme {
  return !!value && THEMES.some((option) => option.id === value)
}

export function resolveTheme(value: string | null): Theme {
  if (value && LEGACY_THEME_MAP[value]) return LEGACY_THEME_MAP[value]
  return isTheme(value) ? value : DEFAULT_THEME
}
