import { describe, expect, it } from 'vitest'
import {
  IMAGE_SHEET_MAX_EDGE,
  IMAGE_SHEET_TARGET_EDGE,
  imageMetaTextScale,
  imageSheetLayout,
  imageStrokeUnitScale,
  imageUiScale,
} from './imageSheetLayout'

describe('imageSheetLayout', () => {
  it('caps very large images at the max edge', () => {
    const layout = imageSheetLayout(8000, 6000)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBe(IMAGE_SHEET_MAX_EDGE)
    expect(layout.displayScale).toBeCloseTo(0.3, 5)
  })

  it('maps mid-size images to the target edge', () => {
    const layout = imageSheetLayout(1920, 1080)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBe(IMAGE_SHEET_TARGET_EDGE)
    expect(layout.displayScale).toBeCloseTo(0.5, 5)
  })

  it('shrinks sub-target images below their native size', () => {
    const layout = imageSheetLayout(640, 480)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBeCloseTo(427, 0)
    expect(layout.displayScale).toBeCloseTo(0.667, 2)
  })

  it('keeps tiny images usable without over-shrinking', () => {
    const layout = imageSheetLayout(320, 240)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBeCloseTo(107, 0)
  })

  it('scales UI chrome down for smaller on-screen sheets', () => {
    const small = imageSheetLayout(640, 480)
    expect(imageMetaTextScale(small)).toBeCloseTo(0.445, 2)
    expect(imageUiScale(imageSheetLayout(2400, 1800))).toBe(1)
    expect(imageUiScale(imageSheetLayout(320, 240))).toBe(0.35)
  })

  it('scales ink width down for smaller sheets and normalized hi-res images', () => {
    expect(imageStrokeUnitScale(imageSheetLayout(640, 480))).toBeCloseTo(0.667, 2)
    expect(imageStrokeUnitScale(imageSheetLayout(8000, 6000))).toBeCloseTo(0.3, 5)
    expect(imageStrokeUnitScale(imageSheetLayout(1920, 1080))).toBeCloseTo(0.5, 5)
  })
})
