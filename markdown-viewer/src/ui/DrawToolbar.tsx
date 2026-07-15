import type { CSSProperties } from 'react'
import { INK_COLOR_OPTIONS } from './inkConfig'
import { EraserIcon, MarkerIcon, PenIcon } from './icons'

export type DrawTool = 'pen' | 'marker' | 'eraser'

type DrawToolbarProps = {
  color: string
  tool: DrawTool
  onColorChange: (color: string) => void
  onToolChange: (tool: DrawTool) => void
  onClearAll: () => void
}

function isDrawingTool(tool: DrawTool) {
  return tool === 'pen' || tool === 'marker'
}

export function DrawToolbar({
  color,
  tool,
  onColorChange,
  onToolChange,
  onClearAll,
}: DrawToolbarProps) {
  return (
    <div className="draw-toolbar-shell" role="toolbar" aria-label="Draw tools">
      <div className="draw-toolbar app-topbar">
        <div className="draw-toolbar-brushes" role="group" aria-label="Brush type">
          <button
            type="button"
            className={
              tool === 'pen'
                ? 'ghost-button active draw-tool-button'
                : 'ghost-button draw-tool-button'
            }
            aria-label="Pen"
            aria-pressed={tool === 'pen'}
            onClick={() => onToolChange('pen')}
          >
            <PenIcon />
            <span>Pen</span>
          </button>
          <button
            type="button"
            className={
              tool === 'marker'
                ? 'ghost-button active draw-tool-button'
                : 'ghost-button draw-tool-button'
            }
            aria-label="Marker"
            aria-pressed={tool === 'marker'}
            onClick={() => onToolChange('marker')}
          >
            <MarkerIcon />
            <span>Marker</span>
          </button>
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <div className="draw-toolbar-colors" role="group" aria-label="Ink colors">
          {INK_COLOR_OPTIONS.map((option) => (
            <button
              key={option.id}
              type="button"
              className={
                isDrawingTool(tool) && color === option.value
                  ? 'draw-color-swatch active'
                  : 'draw-color-swatch'
              }
              aria-label={option.label}
              aria-pressed={isDrawingTool(tool) && color === option.value}
              style={{ '--swatch-color': option.value } as CSSProperties}
              onClick={() => {
                if (tool === 'eraser') {
                  onToolChange('pen')
                }
                onColorChange(option.value)
              }}
            />
          ))}
        </div>

        <span className="topbar-divider" aria-hidden="true" />

        <button
          type="button"
          className={
            tool === 'eraser'
              ? 'ghost-button active draw-tool-button'
              : 'ghost-button draw-tool-button'
          }
          aria-label="Eraser"
          aria-pressed={tool === 'eraser'}
          onClick={() => onToolChange('eraser')}
        >
          <EraserIcon />
          <span>Eraser</span>
        </button>

        <span className="topbar-divider" aria-hidden="true" />

        <button
          type="button"
          className="ghost-button draw-tool-button draw-clear-button"
          aria-label="Clear all drawings"
          onClick={onClearAll}
        >
          Clear all
        </button>
      </div>
    </div>
  )
}
