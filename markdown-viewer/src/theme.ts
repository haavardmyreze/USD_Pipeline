// Theme model: five curated bases, each a true light/dark pair, plus a
// "match system" mode. The applied palette (data-theme attribute) is derived
// from base + effective mode. Legacy saved values remap losslessly.

export type ThemeBase = 'slate' | 'notion' | 'nord' | 'sepia' | 'ink'
export type ThemeMode = 'light' | 'dark' | 'system'

export type ThemePreference = {
  base: ThemeBase
  mode: ThemeMode
}

/** Palette id applied via data-theme. Every id has a palette block in CSS. */
export type Theme =
  | 'slate'
  | 'notion'
  | 'nord'
  | 'sepia'
  | 'ink'
  | 'graphite'
  | 'stone'
  | 'ash'
  | 'sepia-night'
  | 'ink-night'

export const THEME_BASES: { id: ThemeBase; label: string }[] = [
  { id: 'slate', label: 'Slate' },
  { id: 'notion', label: 'Notion' },
  { id: 'nord', label: 'Nord' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'ink', label: 'Ink' },
]

const DARK_PALETTES: Record<ThemeBase, Theme> = {
  slate: 'graphite',
  notion: 'stone',
  nord: 'ash',
  sepia: 'sepia-night',
  ink: 'ink-night',
}

export const DEFAULT_THEME_PREFERENCE: ThemePreference = {
  base: 'slate',
  mode: 'light',
}

export function isThemeBase(value: string | null): value is ThemeBase {
  return !!value && THEME_BASES.some((option) => option.id === value)
}

function isThemeMode(value: string | null): value is ThemeMode {
  return value === 'light' || value === 'dark' || value === 'system'
}

// Every value ever written to mdv-theme maps to a preference, so no saved
// setting breaks across upgrades.
const LEGACY_PREFERENCE_MAP: Record<string, ThemePreference> = {
  graphite: { base: 'slate', mode: 'dark' },
  stone: { base: 'notion', mode: 'dark' },
  ash: { base: 'nord', mode: 'dark' },
  'ink-night': { base: 'ink', mode: 'dark' },
  'sepia-night': { base: 'sepia', mode: 'dark' },
  crimson: { base: 'sepia', mode: 'light' },
  'slate-night': { base: 'slate', mode: 'dark' },
  'notion-night': { base: 'notion', mode: 'dark' },
  'nord-night': { base: 'nord', mode: 'dark' },
  'forest-night': { base: 'notion', mode: 'dark' },
  'dusk-night': { base: 'notion', mode: 'dark' },
  forest: { base: 'slate', mode: 'light' },
  dusk: { base: 'notion', mode: 'light' },
}

/** Parse a stored preference ("base:mode", legacy palette id, or null). */
export function resolveThemePreference(value: string | null): ThemePreference {
  if (!value) {
    return DEFAULT_THEME_PREFERENCE
  }

  const [base, mode] = value.split(':')
  if (isThemeBase(base)) {
    return { base, mode: isThemeMode(mode ?? null) ? (mode as ThemeMode) : 'light' }
  }

  return LEGACY_PREFERENCE_MAP[value] ?? DEFAULT_THEME_PREFERENCE
}

export function serializeThemePreference(preference: ThemePreference): string {
  return `${preference.base}:${preference.mode}`
}

export function paletteFor(preference: ThemePreference, systemDark: boolean): Theme {
  const dark =
    preference.mode === 'dark' || (preference.mode === 'system' && systemDark)
  return dark ? DARK_PALETTES[preference.base] : preference.base
}
