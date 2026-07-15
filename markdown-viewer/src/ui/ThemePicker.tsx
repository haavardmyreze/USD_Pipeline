import {
  paletteFor,
  THEME_BASES,
  type ThemePreference,
  type ThemeMode,
} from '../theme'

type ThemePickerProps = {
  preference: ThemePreference
  onSelect: (preference: ThemePreference) => void
}

const MODES: { id: ThemeMode; label: string }[] = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
  { id: 'system', label: 'System' },
]

/** Theme controls used inside every settings popover: base grid + mode. */
export function ThemePicker({ preference, onSelect }: ThemePickerProps) {
  return (
    <>
      <div className="settings-group">
        <p className="settings-label">Theme</p>
        <div className="theme-grid">
          {THEME_BASES.map((option) => (
            <button
              type="button"
              key={option.id}
              className={
                preference.base === option.id ? 'theme-chip active' : 'theme-chip'
              }
              onClick={() => onSelect({ ...preference, base: option.id })}
            >
              <span
                className="theme-swatch"
                data-theme={paletteFor(
                  { base: option.id, mode: preference.mode },
                  false,
                )}
              />
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <div className="settings-group">
        <p className="settings-label">Appearance</p>
        <div className="segmented">
          {MODES.map((mode) => (
            <button
              type="button"
              key={mode.id}
              className={preference.mode === mode.id ? 'seg active' : 'seg'}
              onClick={() => onSelect({ ...preference, mode: mode.id })}
            >
              {mode.label}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}
