/**
 * Draggable dividers between the four columns.
 *
 * Each divider sets one CSS variable on `.app` (see styles.css). Widths are
 * remembered in this browser; double-clicking a divider returns its column
 * to the default. Arrow keys move a focused divider, for anyone not using a
 * mouse. However the columns are set, the preview keeps some room.
 */

interface Column {
  name: 'side' | 'editor' | 'inspector'
  variable: string
  min: number
  max: number
  /** The inspector sits on the right, so dragging left makes it wider. */
  fromRight: boolean
  label: string
}

const COLUMNS: Column[] = [
  { name: 'side', variable: '--side-w', min: 120, max: 400, fromRight: false, label: 'Resize the diagram list' },
  { name: 'editor', variable: '--editor-w', min: 200, max: 1400, fromRight: false, label: 'Resize the editor' },
  { name: 'inspector', variable: '--inspector-w', min: 180, max: 420, fromRight: true, label: 'Resize the settings' },
]

/** The least width the preview is ever squeezed to. */
const STAGE_MIN = 200
const KEY = 'usd-treediagram:panels'
const STEP = 16

export function setUpPanels(app: HTMLElement): void {
  const saved = load()

  const width = (column: Column): number =>
    parseFloat(getComputedStyle(app).getPropertyValue(column.variable)) || column.min

  /** Set a column, clamped so the preview keeps `STAGE_MIN`. */
  const set = (column: Column, value: number): void => {
    const others = COLUMNS.filter((c) => c !== column).reduce((sum, c) => sum + width(c), 0)
    const room = app.clientWidth - others - STAGE_MIN
    const clamped = Math.round(Math.max(column.min, Math.min(value, column.max, room)))
    app.style.setProperty(column.variable, `${clamped}px`)
  }

  const save = (): void => {
    const widths: Record<string, number> = {}
    for (const column of COLUMNS) {
      const inline = app.style.getPropertyValue(column.variable)
      if (inline) widths[column.name] = parseFloat(inline)
    }
    try {
      localStorage.setItem(KEY, JSON.stringify(widths))
    } catch {
      // Not remembered; the layout still works.
    }
  }

  for (const column of COLUMNS) {
    const stored = saved[column.name]
    if (typeof stored === 'number') set(column, stored)

    const divider = document.createElement('div')
    divider.className = `divider divider--${column.name}`
    divider.tabIndex = 0
    divider.setAttribute('role', 'separator')
    divider.setAttribute('aria-orientation', 'vertical')
    divider.setAttribute('aria-label', column.label)
    divider.title = `${column.label}. Double-click to reset.`
    app.appendChild(divider)

    // Moves are followed on the window rather than through pointer capture,
    // so a drag keeps working when the pointer outruns the thin divider.
    let startX = 0
    let startWidth = 0
    const move = (event: PointerEvent): void => {
      const delta = event.clientX - startX
      set(column, startWidth + (column.fromRight ? -delta : delta))
    }
    const finish = (): void => {
      window.removeEventListener('pointermove', move)
      window.removeEventListener('pointerup', finish)
      window.removeEventListener('pointercancel', finish)
      window.removeEventListener('blur', finish)
      divider.classList.remove('is-dragging')
      document.body.classList.remove('is-resizing')
      save()
    }
    divider.addEventListener('pointerdown', (event) => {
      if (event.button !== 0) return
      event.preventDefault()
      startX = event.clientX
      startWidth = width(column)
      divider.classList.add('is-dragging')
      document.body.classList.add('is-resizing')
      window.addEventListener('pointermove', move)
      window.addEventListener('pointerup', finish)
      window.addEventListener('pointercancel', finish)
      window.addEventListener('blur', finish)
    })

    divider.addEventListener('dblclick', () => {
      app.style.removeProperty(column.variable)
      save()
    })
    divider.addEventListener('keydown', (event) => {
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return
      event.preventDefault()
      const direction = event.key === 'ArrowRight' ? 1 : -1
      const step = (event.shiftKey ? STEP * 4 : STEP) * direction
      set(column, width(column) + (column.fromRight ? -step : step))
      save()
    })
  }

  // A smaller window takes the room back from the editor first, then the
  // sides, rather than crushing the preview.
  const fit = (): void => {
    const total = COLUMNS.reduce((sum, c) => sum + width(c), 0)
    let over = total + STAGE_MIN - app.clientWidth
    for (const name of ['editor', 'side', 'inspector'] as const) {
      if (over <= 0) break
      const column = COLUMNS.find((c) => c.name === name)!
      const current = width(column)
      const next = Math.max(column.min, current - over)
      if (next < current) {
        app.style.setProperty(column.variable, `${next}px`)
        over -= current - next
      }
    }
  }
  window.addEventListener('resize', fit)
  fit()
}

function load(): Record<string, unknown> {
  try {
    const value = JSON.parse(localStorage.getItem(KEY) ?? '{}')
    return value && typeof value === 'object' ? value : {}
  } catch {
    return {}
  }
}
