import { describe, expect, it } from 'vitest'
import {
  DEFAULT_THEME_PREFERENCE,
  paletteFor,
  resolveThemePreference,
  serializeThemePreference,
  THEME_BASES,
} from './theme'

describe('resolveThemePreference', () => {
  it('round-trips serialized preferences', () => {
    for (const base of THEME_BASES) {
      for (const mode of ['light', 'dark', 'system'] as const) {
        const preference = { base: base.id, mode }
        expect(
          resolveThemePreference(serializeThemePreference(preference)),
        ).toEqual(preference)
      }
    }
  })

  it('maps legacy dark palette ids to base + dark mode', () => {
    expect(resolveThemePreference('graphite')).toEqual({ base: 'slate', mode: 'dark' })
    expect(resolveThemePreference('stone')).toEqual({ base: 'notion', mode: 'dark' })
    expect(resolveThemePreference('ash')).toEqual({ base: 'nord', mode: 'dark' })
    expect(resolveThemePreference('ink-night')).toEqual({ base: 'ink', mode: 'dark' })
  })

  it('maps removed themes to a sensible neighbour', () => {
    expect(resolveThemePreference('crimson')).toEqual({ base: 'sepia', mode: 'light' })
    expect(resolveThemePreference('forest')).toEqual({ base: 'slate', mode: 'light' })
  })

  it('falls back to the default for unknown or empty values', () => {
    expect(resolveThemePreference(null)).toEqual(DEFAULT_THEME_PREFERENCE)
    expect(resolveThemePreference('banana')).toEqual(DEFAULT_THEME_PREFERENCE)
  })
})

describe('paletteFor', () => {
  it('returns the base palette in light mode', () => {
    expect(paletteFor({ base: 'slate', mode: 'light' }, true)).toBe('slate')
  })

  it('returns the dark pairing in dark mode', () => {
    expect(paletteFor({ base: 'slate', mode: 'dark' }, false)).toBe('graphite')
    expect(paletteFor({ base: 'sepia', mode: 'dark' }, false)).toBe('sepia-night')
  })

  it('follows the system in system mode', () => {
    expect(paletteFor({ base: 'nord', mode: 'system' }, true)).toBe('ash')
    expect(paletteFor({ base: 'nord', mode: 'system' }, false)).toBe('nord')
  })
})
