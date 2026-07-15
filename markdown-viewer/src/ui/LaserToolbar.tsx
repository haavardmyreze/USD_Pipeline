import type { CSSProperties } from 'react'
import { INK_COLOR_OPTIONS } from './inkConfig'

type LaserToolbarProps = {
  color: string
  onColorChange: (color: string) => void
}

export function LaserToolbar({ color, onColorChange }: LaserToolbarProps) {
  return (
    <div className="draw-toolbar-shell laser-toolbar-shell" role="toolbar" aria-label="Laser pointer">
      <div className="draw-toolbar app-topbar laser-toolbar">
        <span className="laser-toolbar-label">Laser</span>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="draw-toolbar-colors" role="group" aria-label="Laser colors">
          {INK_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                color === option.value ? 'draw-color-swatch active' : 'draw-color-swatch'
              }
              aria-label={option.label}
              aria-pressed={color === option.value}
              style={{ '--swatch-color': option.value } as CSSProperties}
              onClick={() => onColorChange(option.value)}
            />
          ))}
        </div>
      </div>
    </div>
  )
}
