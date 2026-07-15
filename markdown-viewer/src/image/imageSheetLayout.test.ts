import { describe, expect, it } from 'vitest'
import {
  IMAGE_SHEET_MAX_EDGE,
  imageMetaTextScale,
  imageSheetLayout,
  imageStrokeUnitScale,
} from './imageSheetLayout'

describe('imageSheetLayout', () => {
  it('caps very large images at the max edge', () => {
    const layout = imageSheetLayout(8000, 6000)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBe(IMAGE_SHEET_MAX_EDGE)
    expect(layout.displayScale).toBeCloseTo(0.3, 5)
  })

  it('keeps native layout for sub-max images', () => {
    const layout = imageSheetLayout(640, 480)
    expect(layout.sheetWidth).toBe(640)
    expect(layout.sheetHeight).toBe(480)
    expect(layout.displayScale).toBe(1)
  })

  it('scales meta text down for smaller on-screen sheets', () => {
    expect(imageMetaTextScale(640, 480)).toBeCloseTo(0.667, 2)
    expect(imageMetaTextScale(2400, 1800)).toBe(1)
    expect(imageMetaTextScale(320, 240)).toBe(0.62)
  })

  it('scales ink width down for smaller sheets and normalized hi-res images', () => {
    expect(imageStrokeUnitScale(imageSheetLayout(640, 480))).toBeCloseTo(0.667, 2)
    expect(imageStrokeUnitScale(imageSheetLayout(8000, 6000))).toBeCloseTo(0.3, 5)
  })
})
