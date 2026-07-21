import { useCallback, useEffect, useRef, useState } from 'react'
import { isEditableKeyboardTarget } from '../readerConfig'
import { DEFAULT_INK_COLOR, INK_COLOR_OPTIONS } from './inkConfig'
import {
  appendLaserTrailPoint,
  paintLaserPointer,
  type LaserTrailPoint,
} from './laserTrail'
import { LaserToolbar } from './LaserToolbar'

type LaserPointerProps = {
  active: boolean
}

export function LaserPointer({ active }: LaserPointerProps) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null)
  const contextRef = useRef<CanvasRenderingContext2D | null>(null)
  const trailRef = useRef<LaserTrailPoint[]>([])
  const headRef = useRef<{ x: number; y: number } | null>(null)
  const frameRef = useRef<number | null>(null)
  const colorRef = useRef(DEFAULT_INK_COLOR)

  const [color, setColor] = useState(DEFAULT_INK_COLOR)

  colorRef.current = color

  const resizeCanvas = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) {
      return
    }

    const width = window.innerWidth
    const height = window.innerHeight
    const dpr = Math.min(window.devicePixelRatio || 1, 2)

    canvas.width = Math.max(1, Math.floor(width * dpr))
    canvas.height = Math.max(1, Math.floor(height * dpr))
    canvas.style.width = `${width}px`
    canvas.style.height = `${height}px`

    const context = canvas.getContext('2d')
    if (!context) {
      return
    }

    context.setTransform(dpr, 0, 0, dpr, 0, 0)
    contextRef.current = context
  }, [])

  const paintFrame = useCallback(() => {
    const context = contextRef.current
    if (!context || !active) {
      return
    }

    const now = performance.now()
    trailRef.current = paintLaserPointer(
      context,
      window.innerWidth,
      window.innerHeight,
      trailRef.current,
      headRef.current,
      colorRef.current,
      now,
    )
  }, [active])

  useEffect(() => {
    if (!active) {
      trailRef.current = []
      headRef.current = null
      document.body.classList.remove('laser-pointer-active')
      return
    }

    resizeCanvas()
    document.body.classList.add('laser-pointer-active')

    const onPointerMove = (event: PointerEvent) => {
      const events =
        typeof event.getCoalescedEvents === 'function'
          ? event.getCoalescedEvents()
          : [event]
      const now = performance.now()

      for (const sample of events) {
        headRef.current = { x: sample.clientX, y: sample.clientY }
        trailRef.current = appendLaserTrailPoint(trailRef.current, {
          x: sample.clientX,
          y: sample.clientY,
          time: now,
        })
      }
    }

    const onPointerLeave = () => {
      headRef.current = null
    }

    const onResize = () => {
      resizeCanvas()
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (isEditableKeyboardTarget(event.target)) {
        return
      }

      if (event.ctrlKey || event.metaKey || event.altKey) {
        return
      }

      if (event.key.toLowerCase() !== 'c') {
        return
      }

      event.preventDefault()
      setColor((current) => {
        const index = INK_COLOR_OPTIONS.findIndex((option) => option.value === current)
        const nextIndex = index >= 0 ? (index + 1) % INK_COLOR_OPTIONS.length : 0
        return INK_COLOR_OPTIONS[nextIndex]?.value ?? DEFAULT_INK_COLOR
      })
    }

    window.addEventListener('pointermove', onPointerMove)
    window.addEventListener('pointerdown', onPointerMove)
    window.addEventListener('blur', onPointerLeave)
    document.documentElement.addEventListener('mouseleave', onPointerLeave)
    window.addEventListener('resize', onResize)
    window.addEventListener('keydown', onKeyDown)

    const loop = () => {
      paintFrame()
      frameRef.current = window.requestAnimationFrame(loop)
    }
    frameRef.current = window.requestAnimationFrame(loop)

    return () => {
      window.removeEventListener('pointermove', onPointerMove)
      window.removeEventListener('pointerdown', onPointerMove)
      window.removeEventListener('blur', onPointerLeave)
      document.documentElement.removeEventListener('mouseleave', onPointerLeave)
      window.removeEventListener('resize', onResize)
      window.removeEventListener('keydown', onKeyDown)
      if (frameRef.current !== null) {
        window.cancelAnimationFrame(frameRef.current)
        frameRef.current = null
      }
      trailRef.current = []
      headRef.current = null
      document.body.classList.remove('laser-pointer-active')
    }
  }, [active, paintFrame, resizeCanvas])

  if (!active) {
    return null
  }

  return (
    <>
      <LaserToolbar color={color} onColorChange={setColor} />
      <canvas ref={canvasRef} className="laser-overlay-canvas" aria-hidden="true" />
    </>
  )
}
