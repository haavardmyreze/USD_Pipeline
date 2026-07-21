import { describe, expect, it } from 'vitest'
import {
  appendLaserTrailPoint,
  buildDenseLaserTrail,
  interpolateLaserTrailPoint,
  laserColorWithAlpha,
  laserTrailStrength,
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
    const next = appendLaserTrailPoint(trail, { x: 0.2, y: 0.2, time: 1 })
    expect(next).toHaveLength(1)
  })

  it('interpolates trail samples along a segment', () => {
    const midpoint = interpolateLaserTrailPoint(
      { x: 0, y: 0, time: 0 },
      { x: 10, y: 20, time: 100 },
      0.5,
    )
    expect(midpoint).toEqual({ x: 5, y: 10, time: 50 })
  })

  it('densifies trail spans for smooth rendering', () => {
    const dense = buildDenseLaserTrail([
      { x: 0, y: 0, time: 0 },
      { x: 10, y: 0, time: 10 },
    ])
    expect(dense.length).toBeGreaterThan(2)
    expect(dense.at(-1)).toEqual({ x: 10, y: 0, time: 10 })
  })

  it('computes fade strength from point age', () => {
    expect(laserTrailStrength({ x: 0, y: 0, time: 100 }, 100)).toBe(1)
    expect(laserTrailStrength({ x: 0, y: 0, time: 0 }, LASER_TRAIL_MS)).toBe(0)
  })
})
