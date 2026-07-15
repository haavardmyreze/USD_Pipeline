import { useCallback, useEffect, useMemo, useRef, useState } from 'react'

export type PaletteItem = {
  id: string
  title: string
  /** Small right-aligned hint, e.g. "Section" or "⏎". */
  hint?: string
  /** Extra text to match against when filtering. */
  keywords?: string
  action: () => void
}

export type PaletteGroup = {
  label: string
  items: PaletteItem[]
}

export type PaletteProps = {
  groups: PaletteGroup[]
  /**
   * When provided, the palette always offers to send the typed query to the
   * Ask assistant. Called with the trimmed query text.
   */
  onAskQuery?: (query: string) => void
}

type Scored = { item: PaletteItem; group: string; score: number }

function scoreItem(item: PaletteItem, tokens: string[]): number {
  if (tokens.length === 0) {
    return 1
  }

  const title = item.title.toLowerCase()
  const keywords = (item.keywords ?? '').toLowerCase()
  let total = 0

  for (const token of tokens) {
    if (title.startsWith(token)) {
      total += 3
    } else if (title.includes(token)) {
      total += 2
    } else if (keywords.includes(token)) {
      total += 1
    } else {
      return 0
    }
  }

  return total
}

const MAX_RESULTS = 12
const EMPTY_QUERY_PER_GROUP = 4

/**
 * Ctrl/Cmd+Space command palette. Mount one per view; it owns its shortcut,
 * overlay, filtering, and keyboard navigation.
 */
export function CommandPalette({ groups, onAskQuery }: PaletteProps) {
  const [open, setOpen] = useState(false)
  const [query, setQuery] = useState('')
  const [activeIndex, setActiveIndex] = useState(0)
  const inputRef = useRef<HTMLInputElement | null>(null)
  const listRef = useRef<HTMLDivElement | null>(null)

  const close = useCallback(() => {
    setOpen(false)
    setQuery('')
    setActiveIndex(0)
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.code === 'Space') {
        event.preventDefault()
        setOpen((value) => {
          if (value) {
            return false
          }
          setQuery('')
          setActiveIndex(0)
          return true
        })
      }
    }

    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (open) {
      window.requestAnimationFrame(() => inputRef.current?.focus())
    }
  }, [open])

  const results = useMemo(() => {
    const tokens = query
      .trim()
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean)

    const scored: Scored[] = []
    for (const group of groups) {
      let taken = 0
      for (const item of group.items) {
        const score = scoreItem(item, tokens)
        if (score > 0) {
          if (tokens.length === 0 && taken >= EMPTY_QUERY_PER_GROUP) {
            break
          }
          scored.push({ item, group: group.label, score })
          taken += 1
        }
      }
    }

    if (tokens.length > 0) {
      scored.sort((left, right) => right.score - left.score)
    }

    return scored.slice(0, MAX_RESULTS)
  }, [groups, query])

  // Always offer to send the current query to the Ask assistant.
  const askEntry = useMemo((): Scored | null => {
    const trimmed = query.trim()
    if (!onAskQuery || !trimmed) {
      return null
    }
    return {
      item: {
        id: '__ask-query__',
        title: `Ask about "${trimmed}"`,
        hint: 'Ask',
        action: () => onAskQuery(trimmed),
      },
      group: 'Ask',
      score: Number.POSITIVE_INFINITY,
    }
  }, [onAskQuery, query])

  const displayResults = useMemo(
    () => (askEntry ? [...results, askEntry] : results),
    [askEntry, results],
  )

  useEffect(() => {
    setActiveIndex(0)
  }, [query])

  useEffect(() => {
    const active = listRef.current?.querySelector('.palette-item.active')
    active?.scrollIntoView({ block: 'nearest' })
  }, [activeIndex, displayResults])

  if (!open) {
    return null
  }

  const runItem = (index: number) => {
    const entry = displayResults[index]
    if (entry) {
      close()
      entry.item.action()
    }
  }

  const onInputKeyDown = (event: React.KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault()
      setActiveIndex((value) => Math.min(value + 1, displayResults.length - 1))
    } else if (event.key === 'ArrowUp') {
      event.preventDefault()
      setActiveIndex((value) => Math.max(value - 1, 0))
    } else if (event.key === 'Enter') {
      event.preventDefault()
      runItem(activeIndex)
    } else if (event.key === 'Escape') {
      event.preventDefault()
      close()
    }
  }

  let renderedGroup = ''

  return (
    <div
      className="palette-overlay"
      role="presentation"
      onMouseDown={(event) => {
        if (event.target === event.currentTarget) {
          close()
        }
      }}
    >
      <div className="palette" role="dialog" aria-label="Command palette">
        <input
          ref={inputRef}
          className="palette-input"
          type="text"
          value={query}
          placeholder="Jump to a section, open a document, change settings…"
          spellCheck={false}
          aria-label="Command palette"
          onChange={(event) => setQuery(event.target.value)}
          onKeyDown={onInputKeyDown}
        />
        <div className="palette-list" ref={listRef} role="listbox">
          {displayResults.length === 0 ? (
            <p className="palette-empty">No matches.</p>
          ) : (
            displayResults.map((entry, index) => {
              const showLabel = entry.group !== renderedGroup
              renderedGroup = entry.group
              return (
                <div key={`${entry.group}-${entry.item.id}`}>
                  {showLabel ? (
                    <p className="palette-group-label">{entry.group}</p>
                  ) : null}
                  <button
                    type="button"
                    className={
                      index === activeIndex ? 'palette-item active' : 'palette-item'
                    }
                    role="option"
                    aria-selected={index === activeIndex}
                    onMouseEnter={() => setActiveIndex(index)}
                    onClick={() => runItem(index)}
                  >
                    <span className="palette-item-title">{entry.item.title}</span>
                    {entry.item.hint ? (
                      <span className="palette-item-hint">{entry.item.hint}</span>
                    ) : null}
                  </button>
                </div>
              )
            })
          )}
        </div>
        <p className="palette-footer">
          <kbd>↑↓</kbd> navigate · <kbd>⏎</kbd> select · <kbd>esc</kbd> close
        </p>
      </div>
    </div>
  )
}
