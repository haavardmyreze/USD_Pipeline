import { applyToneMapping, readHdr, type ToneMappingType } from 'hdrify'
import UTIF from 'utif'
import { resolveImageKind, type ImageKind } from './imageFormat'
import { readExrBroad } from './readExrBroad'

export type HdrDisplayOptions = {
  exposure: number
  toneMapping: ToneMappingType
}

export type DecodedImage = {
  width: number
  height: number
  kind: ImageKind
  canvas: HTMLCanvasElement
}

function createCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function putRgbOnCanvas(canvas: HTMLCanvasElement, width: number, height: number, rgb: Uint8Array) {
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create image canvas.')
  }

  const rgba = new Uint8ClampedArray(width * height * 4)
  for (let index = 0, rgbaIndex = 0; index < rgb.length; index += 3, rgbaIndex += 4) {
    rgba[rgbaIndex] = rgb[index]
    rgba[rgbaIndex + 1] = rgb[index + 1]
    rgba[rgbaIndex + 2] = rgb[index + 2]
    rgba[rgbaIndex + 3] = 255
  }

  context.putImageData(new ImageData(rgba, width, height), 0, 0)
}

async function decodeStandardImage(data: ArrayBuffer, mimeType: string) {
  const blob = new Blob([data], { type: mimeType || 'application/octet-stream' })
  const bitmap = await createImageBitmap(blob)
  const canvas = createCanvas(bitmap.width, bitmap.height)
  const context = canvas.getContext('2d')
  if (!context) {
    bitmap.close()
    throw new Error('Could not create image canvas.')
  }

  context.drawImage(bitmap, 0, 0)
  bitmap.close()

  return {
    width: canvas.width,
    height: canvas.height,
    kind: 'standard' as const,
    canvas,
  }
}

function decodeTiffImage(data: ArrayBuffer) {
  const ifds = UTIF.decode(data)
  if (!ifds.length) {
    throw new Error('TIFF file contains no images.')
  }

  UTIF.decodeImage(data, ifds[0])
  const rgba = UTIF.toRGBA8(ifds[0])
  const width = ifds[0].width as number
  const height = ifds[0].height as number
  const canvas = createCanvas(width, height)
  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Could not create image canvas.')
  }

  const rgbaClamped = new Uint8ClampedArray(rgba.length)
  rgbaClamped.set(rgba)
  context.putImageData(new ImageData(rgbaClamped, width, height), 0, 0)

  return {
    width,
    height,
    kind: 'tiff' as const,
    canvas,
  }
}

function decodeHdrImage(data: ArrayBuffer, kind: 'exr' | 'hdr', hdrOptions: HdrDisplayOptions) {
  const bytes = new Uint8Array(data)
  const hdrImage = kind === 'exr' ? readExrBroad(bytes) : readHdr(bytes)
  const rgb = applyToneMapping(hdrImage.data, hdrImage.width, hdrImage.height, {
    exposure: hdrOptions.exposure,
    toneMapping: hdrOptions.toneMapping,
    metadata: hdrImage.metadata,
    sourceColorSpace: hdrImage.linearColorSpace,
  })

  const canvas = createCanvas(hdrImage.width, hdrImage.height)
  putRgbOnCanvas(canvas, hdrImage.width, hdrImage.height, rgb)

  return {
    width: hdrImage.width,
    height: hdrImage.height,
    kind,
    canvas,
  }
}

export function guessImageMimeType(fileName: string, kind: ImageKind) {
  const lower = fileName.toLowerCase()
  if (lower.endsWith('.png')) return 'image/png'
  if (lower.endsWith('.jpg') || lower.endsWith('.jpeg')) return 'image/jpeg'
  if (lower.endsWith('.webp')) return 'image/webp'
  if (lower.endsWith('.gif')) return 'image/gif'
  if (lower.endsWith('.bmp')) return 'image/bmp'
  if (lower.endsWith('.avif')) return 'image/avif'
  if (kind === 'tiff') return 'image/tiff'
  if (kind === 'exr') return 'image/x-exr'
  if (kind === 'hdr') return 'image/vnd.radiance'
  return 'application/octet-stream'
}

export async function decodeImageBuffer(
  data: ArrayBuffer,
  fileName: string,
  hdrOptions: HdrDisplayOptions,
): Promise<DecodedImage> {
  const kind = resolveImageKind(fileName, data)

  if (kind === 'tiff') {
    return decodeTiffImage(data)
  }

  if (kind === 'exr' || kind === 'hdr') {
    return decodeHdrImage(data, kind, hdrOptions)
  }

  return decodeStandardImage(data, guessImageMimeType(fileName, kind))
}
