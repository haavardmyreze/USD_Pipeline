import { describe, expect, it } from 'vitest'
import {
  IMAGE_SHEET_TARGET_EDGE,
  imageMetaTextScale,
  imageSheetLayout,
  imageStrokeUnitScale,
} from './imageSheetLayout'

describe('imageSheetLayout', () => {
  it('maps every image longest edge to the target at zoom 1', () => {
    expect(Math.max(imageSheetLayout(8000, 6000).sheetWidth, imageSheetLayout(8000, 6000).sheetHeight)).toBe(
      IMAGE_SHEET_TARGET_EDGE,
    )
    expect(Math.max(imageSheetLayout(640, 480).sheetWidth, imageSheetLayout(640, 480).sheetHeight)).toBe(
      IMAGE_SHEET_TARGET_EDGE,
    )
    expect(Math.max(imageSheetLayout(1920, 1080).sheetWidth, imageSheetLayout(1920, 1080).sheetHeight)).toBe(
      IMAGE_SHEET_TARGET_EDGE,
    )
  })

  it('upscales sub-target images to the target edge', () => {
    const layout = imageSheetLayout(320, 240)
    expect(Math.max(layout.sheetWidth, layout.sheetHeight)).toBe(IMAGE_SHEET_TARGET_EDGE)
    expect(layout.displayScale).toBe(6)
  })

  it('keeps ink and chrome scale constant across resolutions', () => {
    expect(imageStrokeUnitScale(imageSheetLayout(640, 480))).toBe(1)
    expect(imageStrokeUnitScale(imageSheetLayout(8000, 6000))).toBe(1)
    expect(imageMetaTextScale(imageSheetLayout(320, 240))).toBe(1)
  })
})
