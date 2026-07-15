/** Comfortable longest edge at zoom 1 for typical photos / screenshots. */
export const IMAGE_SHEET_TARGET_EDGE = 960

/** Upper cap for very high-resolution sources at zoom 1 (CSS px, longest edge). */
export const IMAGE_SHEET_MAX_EDGE = 2400

export type ImageSheetLayout = {
  sheetWidth: number
  sheetHeight: number
  /** Display sheet size relative to native pixels (sheetWidth / nativeWidth). */
  displayScale: number
}

function displayLongestEdge(nativeLongest: number) {
  if (nativeLongest > IMAGE_SHEET_MAX_EDGE) {
    return IMAGE_SHEET_MAX_EDGE
  }

  if (nativeLongest > IMAGE_SHEET_TARGET_EDGE) {
    return IMAGE_SHEET_TARGET_EDGE
  }

  // Below target: shrink sub-target images so 100% zoom feels closer to the target size.
  return (nativeLongest * nativeLongest) / IMAGE_SHEET_TARGET_EDGE
}

/** Map native pixel dimensions to a consistent on-screen sheet size. */
export function imageSheetLayout(nativeWidth: number, nativeHeight: number): ImageSheetLayout {
  if (nativeWidth <= 0 || nativeHeight <= 0) {
    return { sheetWidth: 1, sheetHeight: 1, displayScale: 1 }
  }

  const nativeLongest = Math.max(nativeWidth, nativeHeight)
  const displayLongest = displayLongestEdge(nativeLongest)
  const scale = displayLongest / nativeLongest

  return {
    sheetWidth: Math.max(1, Math.round(nativeWidth * scale)),
    sheetHeight: Math.max(1, Math.round(nativeHeight * scale)),
    displayScale: scale,
  }
}

/** Shared UI + ink scale for normalized image sheets. */
export function imageUiScale(layout: ImageSheetLayout) {
  const sheetLongest = Math.max(layout.sheetWidth, layout.sheetHeight)
  return Math.min(1, Math.max(0.35, sheetLongest / IMAGE_SHEET_TARGET_EDGE))
}

/** Scale chrome text so it stays proportional to the on-screen image. */
export function imageMetaTextScale(layout: ImageSheetLayout) {
  return imageUiScale(layout)
}

/** Scale ink so stroke width feels consistent across resolutions. */
export function imageStrokeUnitScale(layout: ImageSheetLayout) {
  const sheetLongest = Math.max(layout.sheetWidth, layout.sheetHeight)
  const sizeRatio = Math.min(1, Math.max(0.35, sheetLongest / IMAGE_SHEET_TARGET_EDGE))
  return layout.displayScale < 1 ? layout.displayScale : sizeRatio
}
