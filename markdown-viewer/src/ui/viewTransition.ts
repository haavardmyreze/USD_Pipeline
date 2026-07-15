import { flushSync } from 'react-dom'

/**
 * Run a state change inside a View Transition (soft cross-fade) when the
 * browser supports it and the user hasn't asked for reduced motion.
 */
export function withViewTransition(apply: () => void) {
  const reducedMotion =
    window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false

  const doc = document as Document & {
    startViewTransition?: (callback: () => void) => unknown
  }

  if (!reducedMotion && typeof doc.startViewTransition === 'function') {
    doc.startViewTransition(() => {
      flushSync(apply)
    })
  } else {
    apply()
  }
}
