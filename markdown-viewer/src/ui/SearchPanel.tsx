import { type RefObject } from 'react'
import { highlightMatches } from './highlight'
import { CloseIcon } from './icons'

export type SearchResultItem = {
  id: string
  text: string
  reason?: string
  snippet?: string
  level?: number
}

type SearchPanelProps = {
  open: boolean
  onClose: () => void
  query: string
  onQueryChange: (query: string) => void
  inputRef: RefObject<HTMLInputElement | null>
  placeholder: string
  /** Noun for the result count, e.g. "section" or "page". */
  resultNoun: string
  results: SearchResultItem[]
  activeResultId?: string
  onSelect: (result: SearchResultItem) => void
  /** Inline find-in-text state: match count, current index, step handler. */
  find?: {
    count: number
    index: number
    onStep: (direction: 1 | -1) => void
  }
}

/** Shared document-search side panel used by all format readers. */
export function SearchPanel({
  open,
  onClose,
  query,
  onQueryChange,
  inputRef,
  placeholder,
  resultNoun,
  results,
  activeResultId,
  onSelect,
  find,
}: SearchPanelProps) {
  if (!open) {
    return null
  }

  const trimmedQuery = query.trim()

  return (
    <aside className="search-panel" aria-label="Document search">
      <div className="search-panel-header">
        <h2>Search</h2>
        <button
          type="button"
          className="icon-button"
          aria-label="Close search"
          onClick={onClose}
        >
          <CloseIcon />
        </button>
      </div>

      <div className="search-panel-body">
        <div className="search-panel-input-row">
          <input
            ref={inputRef}
            type="search"
            className="search-panel-input"
            value={query}
            placeholder={placeholder}
            aria-label="Search this document"
            spellCheck={false}
            onChange={(event) => onQueryChange(event.target.value)}
            onKeyDown={(event) => {
              if (find && event.key === 'Enter') {
                event.preventDefault()
                find.onStep(event.shiftKey ? -1 : 1)
              }
            }}
          />
          {trimmedQuery ? (
            <button
              type="button"
              className="search-panel-clear"
              onClick={() => {
                onQueryChange('')
                inputRef.current?.focus()
              }}
              aria-label="Clear search"
            >
              Clear
            </button>
          ) : null}
        </div>

        {find && trimmedQuery ? (
          <div className="find-bar">
            <span className="find-count">
              {find.count === 0
                ? 'No matches in text'
                : `${find.index + 1} / ${find.count} in text`}
            </span>
            <div className="find-controls">
              <button
                type="button"
                className="find-step"
                aria-label="Previous match"
                disabled={find.count === 0}
                onClick={() => find.onStep(-1)}
              >
                ↑
              </button>
              <button
                type="button"
                className="find-step"
                aria-label="Next match"
                disabled={find.count === 0}
                onClick={() => find.onStep(1)}
              >
                ↓
              </button>
            </div>
          </div>
        ) : null}

        {trimmedQuery ? (
          <p className="search-panel-hint">
            {results.length === 0
              ? `No matching ${resultNoun}s.`
              : `${results.length} matching ${resultNoun}${results.length === 1 ? '' : 's'}.`}
          </p>
        ) : (
          <p className="search-panel-hint">
            Tip: press / to focus search. Enter cycles text matches.
          </p>
        )}

        <div className="search-results" role="list" aria-label="Search results">
          {trimmedQuery
            ? results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className={[
                    'search-result',
                    result.level ? `search-l${result.level}` : '',
                    activeResultId === result.id ? 'active' : '',
                  ]
                    .filter(Boolean)
                    .join(' ')}
                  onClick={() => onSelect(result)}
                >
                  <span className="search-result-title">
                    {highlightMatches(result.text, trimmedQuery)}
                  </span>
                  {result.reason ? (
                    <span className="search-result-reason">{result.reason}</span>
                  ) : null}
                  {result.snippet ? (
                    <span className="search-result-snippet">
                      {highlightMatches(result.snippet, trimmedQuery)}
                    </span>
                  ) : null}
                </button>
              ))
            : null}
        </div>
      </div>
    </aside>
  )
}
