import { type RefObject, useEffect, useState } from 'react'
import { CloseIcon } from './icons'

/**
 * Click-to-zoom for document images. Delegated listener — no per-image
 * wiring, works across view modes. Images inside links are left alone.
 */
export function Lightbox({ scopeRef }: { scopeRef: RefObject<HTMLElement | null> }) {
  const [src, setSrc] = useState<string | null>(null)

  useEffect(() => {
    const scope = scopeRef.current
    if (!scope) {
      return
    }

    const onClick = (event: Event) => {
      const target = event.target as HTMLElement | null
      const image = target?.closest?.('img')
      if (!image || !scope.contains(image) || image.closest('a')) {
        return
      }

      const imgEl = image as HTMLImageElement
      setSrc(imgEl.currentSrc || imgEl.src)
    }

    scope.addEventListener('click', onClick)
    return () => scope.removeEventListener('click', onClick)
  }, [scopeRef])

  useEffect(() => {
    if (!src) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSrc(null)
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [src])

  if (!src) {
    return null
  }

  return (
    <div
      className="lightbox-overlay"
      role="dialog"
      aria-label="Image preview"
      onClick={() => setSrc(null)}
    >
      <img className="lightbox-image" src={src} alt="" />
      <button
        type="button"
        className="icon-button lightbox-close"
        aria-label="Close image preview"
        onClick={() => setSrc(null)}
      >
        <CloseIcon />
      </button>
    </div>
  )
}
