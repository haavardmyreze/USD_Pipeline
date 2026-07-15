import { describe, expect, it } from 'vitest'
import {
  assignExrDisplayRgb,
  getBroadChannelSemanticName,
} from './exrChannelSemanticsBroad'

describe('exrChannelSemanticsBroad', () => {
  it('maps common mask and data channels to luma', () => {
    expect(getBroadChannelSemanticName('M')).toBe('luma')
    expect(getBroadChannelSemanticName('mask')).toBe('luma')
    expect(getBroadChannelSemanticName('depth')).toBe('luma')
    expect(getBroadChannelSemanticName('Z')).toBe('luma')
  })

  it('keeps standard rgb and luma names', () => {
    expect(getBroadChannelSemanticName('R')).toBe('r')
    expect(getBroadChannelSemanticName('G')).toBe('g')
    expect(getBroadChannelSemanticName('B')).toBe('b')
    expect(getBroadChannelSemanticName('Y')).toBe('luma')
    expect(getBroadChannelSemanticName('A')).toBe('a')
  })

  it('displays arbitrary single channels as grayscale', () => {
    expect(assignExrDisplayRgb({ custom: 0.75 }, ['custom'])).toEqual([0.75, 0.75, 0.75])
  })

  it('displays partial rgb with zero fill', () => {
    expect(assignExrDisplayRgb({ r: 0.2, g: 0.5 }, ['R', 'G'])).toEqual([0.2, 0.5, 0])
  })

  it('prefers explicit luma over unknown channels', () => {
    expect(assignExrDisplayRgb({ luma: 0.4, custom: 0.9 }, ['Y', 'custom'])).toEqual([
      0.4, 0.4, 0.4,
    ])
  })
})
