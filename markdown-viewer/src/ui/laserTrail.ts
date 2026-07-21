export type LaserTrailPoint = {
  x: number
  y: number
  time: number
}

export const LASER_TRAIL_MS = 420
export const LASER_HEAD_RADIUS = 5
export const LASER_GLOW_RADIUS = 14
export const LASER_TRAIL_SUBDIVISIONS = 6
export const LASER_TRAIL_MIN_DISTANCE = 0.75

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
  minDistance = LASER_TRAIL_MIN_DISTANCE,
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

export function interpolateLaserTrailPoint(
  start: LaserTrailPoint,
  end: LaserTrailPoint,
  t: number,
): LaserTrailPoint {
  return {
    x: start.x + (end.x - start.x) * t,
    y: start.y + (end.y - start.y) * t,
    time: start.time + (end.time - start.time) * t,
  }
}

/** Densify the sampled trail so fast motion stays smooth. */
export function buildDenseLaserTrail(trail: LaserTrailPoint[]): LaserTrailPoint[] {
  if (trail.length < 2) {
    return [...trail]
  }

  const dense: LaserTrailPoint[] = []
  for (let index = 1; index < trail.length; index += 1) {
    const previous = trail[index - 1]
    const current = trail[index]
    if (!previous || !current) {
      continue
    }

    for (let step = 0; step < LASER_TRAIL_SUBDIVISIONS; step += 1) {
      dense.push(
        interpolateLaserTrailPoint(previous, current, step / LASER_TRAIL_SUBDIVISIONS),
      )
    }
  }

  const tail = trail[trail.length - 1]
  if (tail) {
    dense.push(tail)
  }

  return dense
}

export function laserTrailStrength(point: LaserTrailPoint, now: number) {
  return 1 - (now - point.time) / LASER_TRAIL_MS
}

function fillLaserCapsule(
  context: CanvasRenderingContext2D,
  x0: number,
  y0: number,
  x1: number,
  y1: number,
  radius: number,
) {
  const dx = x1 - x0
  const dy = y1 - y0
  const length = Math.hypot(dx, dy)

  if (length < 1e-4) {
    context.beginPath()
    context.arc(x0, y0, radius, 0, Math.PI * 2)
    context.fill()
    return
  }

  const unitX = dx / length
  const unitY = dy / length
  const normalX = -unitY
  const normalY = unitX
  const angle = Math.atan2(unitY, unitX)

  context.beginPath()
  context.arc(x0, y0, radius, angle + Math.PI / 2, angle - Math.PI / 2)
  context.lineTo(x1 - normalX * radius, y1 - normalY * radius)
  context.arc(x1, y1, radius, angle - Math.PI / 2, angle + Math.PI / 2)
  context.lineTo(x0 + normalX * radius, y0 + normalY * radius)
  context.closePath()
  context.fill()
}

function paintLaserTrail(
  context: CanvasRenderingContext2D,
  trail: LaserTrailPoint[],
  color: string,
  now: number,
) {
  const denseTrail = buildDenseLaserTrail(trail)
  if (denseTrail.length < 2) {
    return
  }

  context.save()
  context.globalCompositeOperation = 'lighter'

  for (let index = 1; index < denseTrail.length; index += 1) {
    const start = denseTrail[index - 1]
    const end = denseTrail[index]
    if (!start || !end) {
      continue
    }

    const startStrength = laserTrailStrength(start, now)
    const endStrength = laserTrailStrength(end, now)
    const strength = Math.max(0, Math.min(startStrength, endStrength))
    if (strength <= 0) {
      continue
    }

    const radius = (1.5 + strength * 4) / 2
    context.fillStyle = laserColorWithAlpha(color, strength * 0.42)
    fillLaserCapsule(context, start.x, start.y, end.x, end.y, radius)
  }

  context.restore()
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
  paintLaserTrail(context, activeTrail, color, now)

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
