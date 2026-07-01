export type Theme =
  | 'slate'
  | 'sepia'
  | 'ink'
  | 'crimson'
  | 'notion'
  | 'nord'
  | 'forest'
  | 'dusk'

export const THEMES: { id: Theme; label: string }[] = [
  { id: 'slate', label: 'Slate' },
  { id: 'notion', label: 'Notion' },
  { id: 'nord', label: 'Nord' },
  { id: 'forest', label: 'Forest' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'ink', label: 'Ink' },
]

export const DEFAULT_THEME: Theme = 'slate'

export function isTheme(value: string | null): value is Theme {
  return !!value && THEMES.some((option) => option.id === value)
}
