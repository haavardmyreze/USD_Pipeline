/** Upper cap for very high-resolution sources at zoom 1 (CSS px, longest edge). */
export const IMAGE_SHEET_MAX_EDGE = 2400

export type ImageSheetLayout = {
  sheetWidth: number
  sheetHeight: number
  /** Display sheet size relative to native pixels (sheetWidth / nativeWidth). */
  displayScale: number
}

/** Map native pixel dimensions to a manageable on-screen sheet size. */
export function imageSheetLayout(nativeWidth: number, nativeHeight: number): ImageSheetLayout {
  if (nativeWidth <= 0 || nativeHeight <= 0) {
    return { sheetWidth: 1, sheetHeight: 1, displayScale: 1 }
  }

  const longest = Math.max(nativeWidth, nativeHeight)
  const scale = longest > IMAGE_SHEET_MAX_EDGE ? IMAGE_SHEET_MAX_EDGE / longest : 1

  return {
    sheetWidth: Math.max(1, Math.round(nativeWidth * scale)),
    sheetHeight: Math.max(1, Math.round(nativeHeight * scale)),
    displayScale: scale,
  }
}

/** Scale chrome text so it stays proportional to the on-screen image. */
export function imageMetaTextScale(sheetWidth: number, sheetHeight: number) {
  const longest = Math.max(sheetWidth, sheetHeight)
  return Math.min(1, Math.max(0.62, longest / 960))
}

/** Scale ink so stroke width feels consistent across resolutions. */
export function imageStrokeUnitScale(layout: ImageSheetLayout) {
  const sheetLongest = Math.max(layout.sheetWidth, layout.sheetHeight)
  const sizeRatio = Math.min(1, Math.max(0.35, sheetLongest / 960))
  return layout.displayScale < 1 ? layout.displayScale : sizeRatio
}
