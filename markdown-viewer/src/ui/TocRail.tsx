import { useState } from 'react'

export type TocRailSection = {
  id: string
  text: string
  level?: number
}

type TocRailProps = {
  sections: TocRailSection[]
  activeId: string
  hidden?: boolean
  onNavigate: (id: string) => void
}

// Above this the rail stops being a glanceable map and becomes noise.
const MAX_TICKS = 60

/**
 * Whisper-quiet section map: thin ticks in the left margin, one per section,
 * that bloom into the full contents on hover. Navigation that is always
 * present but never loud.
 */
export function TocRail({ sections, activeId, hidden, onNavigate }: TocRailProps) {
  const [expanded, setExpanded] = useState(false)

  if (hidden || sections.length < 2 || sections.length > MAX_TICKS) {
    return null
  }

  return (
    <nav
      className={expanded ? 'toc-rail toc-rail-expanded' : 'toc-rail'}
      aria-label="Section overview"
      onMouseEnter={() => setExpanded(true)}
      onMouseLeave={() => setExpanded(false)}
    >
      {sections.map((section) => (
        <button
          key={section.id}
          type="button"
          className={[
            'toc-rail-item',
            `toc-rail-l${Math.min(section.level ?? 2, 3)}`,
            section.id === activeId ? 'active' : '',
          ]
            .filter(Boolean)
            .join(' ')}
          onClick={() => onNavigate(section.id)}
        >
          <span className="toc-rail-tick" aria-hidden="true" />
          <span className="toc-rail-label">{section.text}</span>
        </button>
      ))}
    </nav>
  )
}
