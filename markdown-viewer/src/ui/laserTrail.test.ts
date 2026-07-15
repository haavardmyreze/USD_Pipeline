import { describe, expect, it } from 'vitest'
import {
  appendLaserTrailPoint,
  laserColorWithAlpha,
  LASER_TRAIL_MS,
  pruneLaserTrail,
} from './laserTrail'

describe('laserTrail', () => {
  it('builds rgba colors from hex', () => {
    expect(laserColorWithAlpha('#ff0000', 0.5)).toBe('rgba(255, 0, 0, 0.5)')
  })

  it('prunes old trail points', () => {
    const trail = pruneLaserTrail(
      [
        { x: 0, y: 0, time: 0 },
        { x: 10, y: 10, time: 500 },
      ],
      LASER_TRAIL_MS + 500,
    )
    expect(trail).toHaveLength(1)
    expect(trail[0]?.x).toBe(10)
  })

  it('deduplicates nearby trail points', () => {
    const trail = appendLaserTrailPoint([], { x: 0, y: 0, time: 0 })
    const next = appendLaserTrailPoint(trail, { x: 0.5, y: 0.5, time: 1 })
    expect(next).toHaveLength(1)
  })
})
