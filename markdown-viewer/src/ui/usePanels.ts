import { useCallback, useMemo, useState } from 'react'

export type ReaderPanelId = 'toc' | 'search' | 'comments' | 'assistant'

/**
 * Single-active reader panel state: opening one panel closes the others,
 * so the reading surface never has competing chrome. The returned object is
 * referentially stable except when the active panel changes, so it is safe
 * to use in dependency arrays.
 */
export function usePanels() {
  const [active, setActive] = useState<ReaderPanelId | null>(null)

  const toggle = useCallback((id: ReaderPanelId) => {
    setActive((current) => (current === id ? null : id))
  }, [])

  const open = useCallback((id: ReaderPanelId) => {
    setActive(id)
  }, [])

  const close = useCallback((id: ReaderPanelId) => {
    setActive((current) => (current === id ? null : current))
  }, [])

  const closeAll = useCallback(() => {
    setActive(null)
  }, [])

  const isOpen = useCallback((id: ReaderPanelId) => active === id, [active])

  return useMemo(
    () => ({ active, isOpen, toggle, open, close, closeAll }),
    [active, isOpen, toggle, open, close, closeAll],
  )
}
