import { useEffect, useRef } from 'react'
import type { Dispatch, RefObject, SetStateAction } from 'react'
import { isEditableKeyboardTarget } from '../readerConfig'
import { clampCanvasZoom, scrubSignedDragDistance, scrubZoomMultiplier } from './canvasZoom'
import { zoomAtPoint, type CsvViewportState } from '../csv/csvViewport'

type ScrubSession = {
  pointerId: number
  startZoom: number
  pivotX: number
  pivotY: number
}

export function useCanvasZoomScrub(
  viewportRef: RefObject<HTMLElement | null>,
  setViewport: Dispatch<SetStateAction<CsvViewportState>>,
  clampViewportPan: (next: CsvViewportState) => CsvViewportState,
  enabled: boolean,
) {
  const zKeyRef = useRef(false)
  const scrubRef = useRef<ScrubSession | null>(null)

  useEffect(() => {
    if (!enabled) {
      return
    }

    const setScrubReady = (active: boolean) => {
      document.body.classList.toggle('canvas-zoom-scrub-ready', active)
    }

    const endScrub = () => {
      scrubRef.current = null
      document.body.classList.remove('canvas-zoom-scrub-dragging')
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.repeat || event.key.toLowerCase() !== 'z') {
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey || isEditableKeyboardTarget(event.target)) {
        return
      }

      zKeyRef.current = true
      setScrubReady(true)
    }

    const onKeyUp = (event: KeyboardEvent) => {
      if (event.key.toLowerCase() !== 'z') {
        return
      }

      zKeyRef.current = false
      setScrubReady(false)
      endScrub()
    }

    const onBlur = () => {
      zKeyRef.current = false
      setScrubReady(false)
      endScrub()
    }

    const onPointerDown = (event: PointerEvent) => {
      if (!zKeyRef.current || event.button !== 0) {
        return
      }

      const viewportElement = viewportRef.current
      if (!viewportElement) {
        return
      }

      event.preventDefault()
      event.stopPropagation()

      setViewport((current) => {
        scrubRef.current = {
          pointerId: event.pointerId,
          startZoom: current.zoom,
          pivotX: event.clientX,
          pivotY: event.clientY,
        }
        return current
      })

      document.body.classList.add('canvas-zoom-scrub-dragging')
      viewportElement.setPointerCapture(event.pointerId)
    }

    const onPointerMove = (event: PointerEvent) => {
      const scrub = scrubRef.current
      if (!scrub || scrub.pointerId !== event.pointerId) {
        return
      }

      event.preventDefault()

      const viewportElement = viewportRef.current
      if (!viewportElement) {
        return
      }

      const deltaX = event.clientX - scrub.pivotX
      const deltaY = event.clientY - scrub.pivotY
      const signedDistance = scrubSignedDragDistance(deltaX, deltaY)
      const nextZoom = clampCanvasZoom(scrub.startZoom * scrubZoomMultiplier(signedDistance))
      const viewportRect = viewportElement.getBoundingClientRect()

      setViewport((current) =>
        clampViewportPan(
          zoomAtPoint(
            current.panX,
            current.panY,
            current.zoom,
            nextZoom,
            scrub.pivotX,
            scrub.pivotY,
            viewportRect,
          ),
        ),
      )
    }

    const onPointerEnd = (event: PointerEvent) => {
      const scrub = scrubRef.current
      if (!scrub || scrub.pointerId !== event.pointerId) {
        return
      }

      const viewportElement = viewportRef.current
      if (viewportElement?.hasPointerCapture(event.pointerId)) {
        viewportElement.releasePointerCapture(event.pointerId)
      }

      endScrub()
    }

    window.addEventListener('keydown', onKeyDown)
    window.addEventListener('keyup', onKeyUp)
    window.addEventListener('blur', onBlur)
    window.addEventListener('pointerdown', onPointerDown, { capture: true })
    window.addEventListener('pointermove', onPointerMove, { capture: true })
    window.addEventListener('pointerup', onPointerEnd, { capture: true })
    window.addEventListener('pointercancel', onPointerEnd, { capture: true })

    return () => {
      window.removeEventListener('keydown', onKeyDown)
      window.removeEventListener('keyup', onKeyUp)
      window.removeEventListener('blur', onBlur)
      window.removeEventListener('pointerdown', onPointerDown, { capture: true })
      window.removeEventListener('pointermove', onPointerMove, { capture: true })
      window.removeEventListener('pointerup', onPointerEnd, { capture: true })
      window.removeEventListener('pointercancel', onPointerEnd, { capture: true })
      setScrubReady(false)
      endScrub()
    }
  }, [clampViewportPan, enabled, setViewport, viewportRef])
}
