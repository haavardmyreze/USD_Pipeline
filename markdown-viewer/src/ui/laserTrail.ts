export type LaserTrailPoint = {
  x: number
  y: number
  time: number
}

export const LASER_TRAIL_MS = 420
export const LASER_HEAD_RADIUS = 5
export const LASER_GLOW_RADIUS = 14

export function parseLaserColor(hex: string) {
  const normalized = hex.replace('#', '')
  if (normalized.length !== 6) {
    return { r: 232, g: 72, b: 70 }
  }

  return {
    r: Number.parseInt(normalized.slice(0, 2), 16),
    g: Number.parseInt(normalized.slice(2, 4), 16),
    b: Number.parseInt(normalized.slice(4, 6), 16),
  }
}

export function laserColorWithAlpha(hex: string, alpha: number) {
  const { r, g, b } = parseLaserColor(hex)
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, alpha))})`
}

export function pruneLaserTrail(trail: LaserTrailPoint[], now: number) {
  return trail.filter((point) => now - point.time <= LASER_TRAIL_MS)
}

export function appendLaserTrailPoint(
  trail: LaserTrailPoint[],
  point: LaserTrailPoint,
  minDistance = 1.75,
) {
  const last = trail[trail.length - 1]
  if (last) {
    const dx = point.x - last.x
    const dy = point.y - last.y
    if (dx * dx + dy * dy < minDistance * minDistance) {
      return trail
    }
  }

  return [...trail, point]
}

export function paintLaserPointer(
  context: CanvasRenderingContext2D,
  cssWidth: number,
  cssHeight: number,
  trail: LaserTrailPoint[],
  head: { x: number; y: number } | null,
  color: string,
  now: number,
) {
  context.clearRect(0, 0, cssWidth, cssHeight)

  const activeTrail = pruneLaserTrail(trail, now)

  if (activeTrail.length >= 2) {
    for (let index = 1; index < activeTrail.length; index += 1) {
      const previous = activeTrail[index - 1]
      const current = activeTrail[index]
      const age = now - current.time
      const strength = 1 - age / LASER_TRAIL_MS

      context.strokeStyle = laserColorWithAlpha(color, strength * 0.9)
      context.lineWidth = 1.5 + strength * 4
      context.lineCap = 'round'
      context.beginPath()
      context.moveTo(previous.x, previous.y)
      context.lineTo(current.x, current.y)
      context.stroke()
    }
  }

  if (!head) {
    return activeTrail
  }

  const glow = context.createRadialGradient(
    head.x,
    head.y,
    0,
    head.x,
    head.y,
    LASER_GLOW_RADIUS,
  )
  glow.addColorStop(0, laserColorWithAlpha(color, 0.55))
  glow.addColorStop(1, laserColorWithAlpha(color, 0))
  context.fillStyle = glow
  context.beginPath()
  context.arc(head.x, head.y, LASER_GLOW_RADIUS, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = color
  context.beginPath()
  context.arc(head.x, head.y, LASER_HEAD_RADIUS, 0, Math.PI * 2)
  context.fill()

  context.fillStyle = laserColorWithAlpha('#ffffff', 0.85)
  context.beginPath()
  context.arc(head.x - 1.2, head.y - 1.2, 1.6, 0, Math.PI * 2)
  context.fill()

  return activeTrail
}
