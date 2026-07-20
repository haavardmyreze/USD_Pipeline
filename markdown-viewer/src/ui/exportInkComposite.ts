import type { ImageSheetLayout } from '../image/imageSheetLayout'
import { drawInkStroke } from './inkBrush'
import { storageToViewportPoint, type InkLayer } from './inkLayer'
import { getInkDocumentState } from './inkDocumentStore'
import type { InkViewport } from './inkAnchors'

const SHEET_INK_VIEWPORT: InkViewport = {
  anchorX: 0,
  anchorY: 0,
  contentOffsetX: 0,
  contentOffsetY: 0,
}

export function renderSheetInk(
  context: CanvasRenderingContext2D,
  layers: InkLayer[],
  sheetWidth: number,
  sheetHeight: number,
  contentZoom = 1,
  strokeUnitScale = 1,
) {
  context.save()
  context.beginPath()
  context.rect(0, 0, sheetWidth, sheetHeight)
  context.clip()

  const strokeSizeScale = contentZoom * strokeUnitScale

  for (const layer of layers) {
    if (layer.coordinateSpace !== 'sheet') {
      continue
    }

    for (const stroke of layer.strokes) {
      const points = stroke.points.map((point) =>
        storageToViewportPoint(point, SHEET_INK_VIEWPORT, contentZoom, layer.coordinateSpace),
      )

      drawInkStroke(
        context,
        points,
        stroke.color,
        stroke.brush ?? 'pen',
        true,
        stroke.simulatePressure,
        strokeSizeScale,
      )
    }
  }

  context.restore()
}

/** Flatten a decoded image and sheet-space ink into one canvas at native resolution. */
export function compositeImageWithSheetInk(
  baseCanvas: HTMLCanvasElement,
  docKey: string,
  sheetLayout: ImageSheetLayout,
  strokeUnitScale = 1,
): HTMLCanvasElement {
  const output = document.createElement('canvas')
  output.width = baseCanvas.width
  output.height = baseCanvas.height

  const context = output.getContext('2d')
  if (!context) {
    throw new Error('Could not create export canvas.')
  }

  context.drawImage(baseCanvas, 0, 0)
  context.save()
  context.scale(
    output.width / sheetLayout.sheetWidth,
    output.height / sheetLayout.sheetHeight,
  )

  renderSheetInk(
    context,
    getInkDocumentState(docKey).layers,
    sheetLayout.sheetWidth,
    sheetLayout.sheetHeight,
    1,
    strokeUnitScale,
  )
  context.restore()

  return output
}
