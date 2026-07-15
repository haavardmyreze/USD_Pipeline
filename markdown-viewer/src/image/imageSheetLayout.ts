/** Every image maps to this longest edge at zoom 1 so ink and chrome stay consistent. */
export const IMAGE_SHEET_TARGET_EDGE = 1920

export type ImageSheetLayout = {
  sheetWidth: number
  sheetHeight: number
  /** Display sheet size relative to native pixels (sheetWidth / nativeWidth). */
  displayScale: number
}

/** Map native pixel dimensions to a fixed on-screen sheet size. */
export function imageSheetLayout(nativeWidth: number, nativeHeight: number): ImageSheetLayout {
  if (nativeWidth <= 0 || nativeHeight <= 0) {
    return { sheetWidth: 1, sheetHeight: 1, displayScale: 1 }
  }

  const nativeLongest = Math.max(nativeWidth, nativeHeight)
  const scale = IMAGE_SHEET_TARGET_EDGE / nativeLongest

  return {
    sheetWidth: Math.max(1, Math.round(nativeWidth * scale)),
    sheetHeight: Math.max(1, Math.round(nativeHeight * scale)),
    displayScale: scale,
  }
}

/** Chrome text scale — constant because every sheet normalizes to the same edge. */
export function imageMetaTextScale(_layout: ImageSheetLayout) {
  return 1
}

/** Ink scale — constant because sheet coordinates share the same display size. */
export function imageStrokeUnitScale(_layout: ImageSheetLayout) {
  return 1
}
