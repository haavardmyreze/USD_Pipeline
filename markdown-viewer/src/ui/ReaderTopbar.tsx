import { type ReactNode, useCallback, useEffect, useRef, useState } from 'react'
import { BackIcon, SettingsIcon } from './icons'
import { useDismissablePopover } from './usePopover'

/**
 * Chrome that recedes: hide on scroll-down, return on scroll-up or when the
 * pointer approaches the top edge. Also reports 0–1 reading progress.
 */
function useRecedingChrome(pinned: boolean) {
  const [hidden, setHidden] = useState(false)
  const [progress, setProgress] = useState(0)
  const hiddenRef = useRef(false)

  useEffect(() => {
    hiddenRef.current = hidden
  }, [hidden])

  useEffect(() => {
    let lastY = window.scrollY

    const onScroll = () => {
      const y = window.scrollY
      const el = document.scrollingElement ?? document.documentElement
      const max = el.scrollHeight - window.innerHeight
      setProgress(max > 0 ? Math.min(1, Math.max(0, y / max)) : 0)

      if (y > lastY + 4 && y > 140) {
        setHidden(true)
      } else if (y < lastY - 4 || y <= 140) {
        setHidden(false)
      }
      lastY = y
    }

    const onMouseMove = (event: MouseEvent) => {
      if (hiddenRef.current && event.clientY < 72) {
        setHidden(false)
      }
    }

    onScroll()
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('mousemove', onMouseMove, { passive: true })
    return () => {
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('mousemove', onMouseMove)
    }
  }, [])

  return { hidden: hidden && !pinned, progress }
}

export type TopbarAction = {
  id: string
  label: string
  icon?: ReactNode
  active?: boolean
  badge?: number
  onToggle: () => void
}

type ReaderTopbarProps = {
  fileName: string
  onHome: () => void
  actions: TopbarAction[]
  /** Settings popover content (settings groups). Omit to hide the gear. */
  settings?: ReactNode
}

/**
 * The shared reader chrome: Library link, document name, panel toggles, and
 * the settings popover. Every format reader renders this same topbar.
 */
export function ReaderTopbar({ fileName, onHome, actions, settings }: ReaderTopbarProps) {
  const [settingsOpen, setSettingsOpen] = useState(false)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const closeSettings = useCallback(() => setSettingsOpen(false), [])
  const { hidden, progress } = useRecedingChrome(settingsOpen)

  useDismissablePopover(settingsRef, settingsOpen, closeSettings)

  return (
    <>
      <div
        className="reader-progress"
        role="progressbar"
        aria-label="Reading progress"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(progress * 100)}
        style={{ transform: `scaleX(${progress})` }}
      />
      <div
        className={
          hidden
            ? 'topbar-shell reader-topbar-shell topbar-hidden'
            : 'topbar-shell reader-topbar-shell'
        }
      >
        <header className="app-topbar topbar-pill reader-topbar">
          <div className="topbar-lead">
            <button
              type="button"
              className="ghost-button home-link"
              onClick={onHome}
              aria-label="Back to library"
            >
              <BackIcon />
              <span>Library</span>
            </button>
            <span className="topbar-divider" aria-hidden="true" />
            <p className="doc-name" title={fileName}>
              {fileName}
            </p>
          </div>
          <div className="controls">
            {actions.map((action) => (
              <button
                type="button"
                key={action.id}
                className={action.active ? 'ghost-button active' : 'ghost-button'}
                aria-label={action.label}
                aria-expanded={action.active ?? false}
                onClick={() => {
                  setSettingsOpen(false)
                  action.onToggle()
                }}
              >
                {action.icon}
                <span>{action.label}</span>
                {action.badge ? (
                  <span className="comment-count-badge">{action.badge}</span>
                ) : null}
              </button>
            ))}

            {settings ? (
              <div className="controls-actions" ref={settingsRef}>
                <button
                  type="button"
                  className={settingsOpen ? 'icon-button active' : 'icon-button'}
                  aria-label="Settings"
                  aria-expanded={settingsOpen}
                  onClick={() => setSettingsOpen((value) => !value)}
                >
                  <SettingsIcon />
                </button>

                {settingsOpen ? (
                  <div className="settings-popover" role="dialog" aria-label="Settings">
                    {settings}
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </header>
      </div>
    </>
  )
}
