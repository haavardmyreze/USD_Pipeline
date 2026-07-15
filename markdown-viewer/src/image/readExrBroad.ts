/**
 * EXR reader with broader channel support than hdrify's readExr alone.
 * Handles mask/metallic/depth-style single-channel EXRs and partial RGB layouts.
 */
import { chromaticitiesToLinearColorSpace } from 'hdrify/dist/color/colorSpaces.js'
import { decompressPiz } from 'hdrify/dist/exr/decompressPiz.js'
import { decompressPxr24 } from 'hdrify/dist/exr/decompressPxr24.js'
import { decompressRleBlock } from 'hdrify/dist/exr/decompressRle.js'
import { decompressZip } from 'hdrify/dist/exr/decompressZip.js'
import {
  FLOAT32_SIZE,
  INT16_SIZE,
  INT32_SIZE,
  NO_COMPRESSION,
  PIZ_COMPRESSION,
  PXR24_COMPRESSION,
  RLE_COMPRESSION,
  ULONG_SIZE,
  ZIP_COMPRESSION,
  ZIPS_COMPRESSION,
} from 'hdrify/dist/exr/exrConstants.js'
import { parseExrHeader } from 'hdrify/dist/exr/exrHeader.js'
import { decodeFloat16 } from 'hdrify/dist/exr/halfFloat.js'
import { ensureNonNegativeFinite, type HdrifyImage } from 'hdrify/dist/hdrifyImage.js'
import { readExr } from 'hdrify'
import {
  assignExrDisplayRgb,
  getBroadChannelSemanticName,
} from './exrChannelSemanticsBroad.js'

function getPixelTypeSize(pixelType: number) {
  switch (pixelType) {
    case 0:
      return INT32_SIZE
    case 1:
      return INT16_SIZE
    case 2:
      return FLOAT32_SIZE
    default:
      throw new Error(`Unknown pixel type: ${pixelType}`)
  }
}

function readChannelValue(dataView: DataView, offset: number, pixelType: number) {
  switch (pixelType) {
    case 0:
      return dataView.getUint32(offset, true)
    case 1:
      return decodeFloat16(dataView.getUint16(offset, true))
    case 2:
      return dataView.getFloat32(offset, true)
    default:
      throw new Error(`Unknown pixel type: ${pixelType}`)
  }
}

function linearColorSpaceFromHeader(header: Record<string, unknown>) {
  const chromaticities = header.chromaticities
  if (
    chromaticities &&
    typeof chromaticities === 'object' &&
    typeof (chromaticities as { redX?: unknown }).redX === 'number' &&
    typeof (chromaticities as { redY?: unknown }).redY === 'number' &&
    typeof (chromaticities as { greenX?: unknown }).greenX === 'number' &&
    typeof (chromaticities as { greenY?: unknown }).greenY === 'number' &&
    typeof (chromaticities as { blueX?: unknown }).blueX === 'number' &&
    typeof (chromaticities as { blueY?: unknown }).blueY === 'number' &&
    typeof (chromaticities as { whiteX?: unknown }).whiteX === 'number' &&
    typeof (chromaticities as { whiteY?: unknown }).whiteY === 'number'
  ) {
    return (
      chromaticitiesToLinearColorSpace(
        chromaticities as {
          redX: number
          redY: number
          greenX: number
          greenY: number
          blueX: number
          blueY: number
          whiteX: number
          whiteY: number
        },
      ) ?? 'linear-rec709'
    )
  }

  return 'linear-rec709'
}

export function readExrFlexible(exrBuffer: Uint8Array): HdrifyImage {
  const dataView = new DataView(exrBuffer.buffer, exrBuffer.byteOffset, exrBuffer.byteLength)
  const { header: parsedHeader, offset } = parseExrHeader(exrBuffer)
  const { header, dataWindow, channels, compression } = parsedHeader
  const width = dataWindow.xMax - dataWindow.xMin + 1
  const height = dataWindow.yMax - dataWindow.yMin + 1

  if (channels.length === 0) {
    throw new Error('Invalid EXR file: no channels found.')
  }

  const channelNames = channels.map((channel) => channel.name)
  const hasR = channels.some((channel) => getBroadChannelSemanticName(channel.name) === 'r')
  const hasG = channels.some((channel) => getBroadChannelSemanticName(channel.name) === 'g')
  const hasB = channels.some((channel) => getBroadChannelSemanticName(channel.name) === 'b')
  const hasLuma = channels.some((channel) => getBroadChannelSemanticName(channel.name) === 'luma')
  const isRgbMode = hasR && hasG && hasB
  const isLumaMode = !isRgbMode && hasLuma

  const rChannel = isRgbMode
    ? channels.find((channel) => getBroadChannelSemanticName(channel.name) === 'r')
    : undefined
  const gChannel = isRgbMode
    ? channels.find((channel) => getBroadChannelSemanticName(channel.name) === 'g')
    : undefined
  const bChannel = isRgbMode
    ? channels.find((channel) => getBroadChannelSemanticName(channel.name) === 'b')
    : undefined

  const primaryChannelOrUndef = isRgbMode && rChannel
    ? rChannel
    : (channels.find((channel) => getBroadChannelSemanticName(channel.name) === 'luma') ??
      channels[0])

  if (!primaryChannelOrUndef) {
    throw new Error('Invalid EXR file: no usable channel for pixel type.')
  }

  const primaryChannel = primaryChannelOrUndef
  const numChannels = channels.length
  const blockHeight =
    compression === PIZ_COMPRESSION
      ? 32
      : compression === ZIP_COMPRESSION || compression === PXR24_COMPRESSION
        ? 16
        : 1
  const expectedBlockCount = Math.ceil(height / blockHeight)

  const scanlineBlockOffsets: number[] = []
  const offsetTableStart = offset
  let readOffset = offset
  const maxOffsets = expectedBlockCount

  for (let index = 0; index < maxOffsets && readOffset + ULONG_SIZE <= exrBuffer.length; index += 1) {
    let offsetValue = Number(dataView.getBigUint64(readOffset, true))
    if (offsetValue > exrBuffer.length && offsetValue < Number.MAX_SAFE_INTEGER) {
      const low32 = dataView.getUint32(readOffset, true)
      const high32 = dataView.getUint32(readOffset + 4, true)
      if (high32 === 0 && low32 < exrBuffer.length) {
        offsetValue = low32
      } else if (low32 === 0 && high32 < exrBuffer.length) {
        offsetValue = high32
      }
    }

    const canReadBlockHeader = offsetValue >= 0 && offsetValue + 8 <= exrBuffer.length
    const notInHeader = offsetValue >= offsetTableStart
    if (canReadBlockHeader && notInHeader) {
      scanlineBlockOffsets.push(offsetValue)
    } else if (scanlineBlockOffsets.length > 0) {
      break
    }

    readOffset += ULONG_SIZE
  }

  let actualBlockHeightFinal = blockHeight
  if (scanlineBlockOffsets.length >= 2) {
    const firstOffset = scanlineBlockOffsets[0]
    const secondOffset = scanlineBlockOffsets[1]
    if (
      firstOffset !== undefined &&
      secondOffset !== undefined &&
      firstOffset < exrBuffer.length &&
      secondOffset < exrBuffer.length &&
      firstOffset >= 0 &&
      secondOffset >= 0
    ) {
      try {
        const firstY = dataView.getInt32(firstOffset, true)
        const secondY = dataView.getInt32(secondOffset, true)
        if (secondY === firstY + 1) {
          actualBlockHeightFinal = 1
          if (scanlineBlockOffsets.length > height) {
            scanlineBlockOffsets.length = height
          }
        }
      } catch {
        // Keep default block height.
      }
    }
  }

  const blockCount = scanlineBlockOffsets.length
  if (blockCount === 0) {
    throw new Error('Invalid EXR file: no valid scanline block offsets found')
  }

  const pixelData = new Float32Array(width * height * 4)
  for (let blockIdx = 0; blockIdx < blockCount; blockIdx += 1) {
    const scanlineBlockOffset = scanlineBlockOffsets[blockIdx]
    if (scanlineBlockOffset === undefined) {
      throw new Error(`Missing scanline block offset for block ${blockIdx}`)
    }
    if (scanlineBlockOffset >= exrBuffer.length || scanlineBlockOffset < 0) {
      throw new Error(
        `Invalid scanline block offset ${scanlineBlockOffset} for block ${blockIdx} (file size: ${exrBuffer.length})`,
      )
    }

    let scanlinePos = scanlineBlockOffset
    if (scanlinePos + INT32_SIZE > exrBuffer.length) {
      throw new Error(`Invalid scanline block: not enough data for Y coordinate at offset ${scanlinePos}`)
    }

    const firstLineY = dataView.getInt32(scanlinePos, true)
    scanlinePos += INT32_SIZE
    if (scanlinePos + INT32_SIZE > exrBuffer.length) {
      throw new Error(`Invalid scanline block: not enough data for data size at offset ${scanlinePos}`)
    }

    const dataSize = dataView.getUint32(scanlinePos, true)
    scanlinePos += INT32_SIZE
    const available = exrBuffer.length - scanlinePos
    if (dataSize <= 0 || dataSize > available) {
      const looksLikeFormatMismatch = dataSize > exrBuffer.length || dataSize > 100 * 1024 * 1024
      if (looksLikeFormatMismatch) {
        throw new Error(
          `Unsupported or invalid EXR format: scanline block ${blockIdx} has invalid data size (${dataSize} bytes, ${available} available). ` +
            `This file may use a compression or layout not supported by this reader. Supported: none, RLE, ZIPS, ZIP, PIZ, PXR24.`,
        )
      }
      throw new Error(
        `Invalid scanline block data size: ${dataSize} at offset ${scanlinePos - 4} (file size: ${exrBuffer.length}, available: ${available})`,
      )
    }

    const linesInBlock = Math.min(actualBlockHeightFinal, height - firstLineY)
    const expectedUncompressedSize =
      linesInBlock * width * numChannels * getPixelTypeSize(primaryChannel.pixelType)

    let decompressedData: Uint8Array
    let isPlanarBlock =
      compression === RLE_COMPRESSION ||
      compression === ZIP_COMPRESSION ||
      compression === ZIPS_COMPRESSION ||
      compression === PXR24_COMPRESSION

    if (compression === NO_COMPRESSION) {
      decompressedData = new Uint8Array(
        exrBuffer.buffer,
        exrBuffer.byteOffset + scanlinePos,
        dataSize,
      )
    } else if (compression === ZIP_COMPRESSION || compression === ZIPS_COMPRESSION) {
      const compressedData = new Uint8Array(
        exrBuffer.buffer,
        exrBuffer.byteOffset + scanlinePos,
        dataSize,
      )
      decompressedData = decompressZip(compressedData)
    } else if (compression === RLE_COMPRESSION) {
      const compressedData = new Uint8Array(
        exrBuffer.buffer,
        exrBuffer.byteOffset + scanlinePos,
        dataSize,
      )
      decompressedData = decompressRleBlock(compressedData, expectedUncompressedSize)
    } else if (compression === PIZ_COMPRESSION) {
      if (dataSize <= 0 || scanlinePos + dataSize > exrBuffer.length) {
        throw new Error(
          `Invalid PIZ data size: ${dataSize} at offset ${scanlinePos} (file size: ${exrBuffer.length})`,
        )
      }
      const compressedData = new Uint8Array(
        exrBuffer.buffer,
        exrBuffer.byteOffset + scanlinePos,
        dataSize,
      )
      if (dataSize === expectedUncompressedSize) {
        decompressedData = compressedData
        isPlanarBlock = true
      } else {
        decompressedData = decompressPiz(compressedData, width, channels, dataSize, linesInBlock)
      }
    } else if (compression === PXR24_COMPRESSION) {
      if (dataSize <= 0 || scanlinePos + dataSize > exrBuffer.length) {
        throw new Error(
          `Invalid PXR24 data size: ${dataSize} at offset ${scanlinePos} (file size: ${exrBuffer.length})`,
        )
      }
      const compressedData = new Uint8Array(
        exrBuffer.buffer,
        exrBuffer.byteOffset + scanlinePos,
        dataSize,
      )
      decompressedData = decompressPxr24(compressedData, width, channels, dataSize, linesInBlock)
    } else {
      throw new Error(`Unsupported compression type: ${compression}`)
    }

    const blockDataView = new DataView(
      decompressedData.buffer,
      decompressedData.byteOffset,
      decompressedData.byteLength,
    )
    const bytesPerScanline = width * numChannels * getPixelTypeSize(primaryChannel.pixelType)
    const bytesPerChannel = getPixelTypeSize(primaryChannel.pixelType)

    for (let lineInBlock = 0; lineInBlock < linesInBlock; lineInBlock += 1) {
      const y = firstLineY + lineInBlock
      if (y >= height) {
        break
      }

      const lineOffset = compression === NO_COMPRESSION ? 0 : lineInBlock * bytesPerScanline
      for (let x = 0; x < width; x += 1) {
        const pixelIndex = (y * width + x) * 4
        const channelValues: Record<string, number> = {}
        const usePxr24RgbBlockOrder =
          isRgbMode &&
          isPlanarBlock &&
          compression === PXR24_COMPRESSION &&
          numChannels === 3

        if (usePxr24RgbBlockOrder && rChannel && gChannel && bChannel) {
          channelValues.r = readChannelValue(
            blockDataView,
            lineOffset + 2 * width * bytesPerChannel + x * bytesPerChannel,
            primaryChannel.pixelType,
          )
          channelValues.g = readChannelValue(
            blockDataView,
            lineOffset + 1 * width * bytesPerChannel + x * bytesPerChannel,
            primaryChannel.pixelType,
          )
          channelValues.b = readChannelValue(
            blockDataView,
            lineOffset + 0 * width * bytesPerChannel + x * bytesPerChannel,
            primaryChannel.pixelType,
          )
        } else {
          for (let channelIndex = 0; channelIndex < channels.length; channelIndex += 1) {
            const channel = channels[channelIndex]
            if (!channel) {
              continue
            }
            const pixelOffset = isPlanarBlock
              ? lineOffset + channelIndex * width * bytesPerChannel + x * bytesPerChannel
              : lineOffset + x * numChannels * bytesPerChannel + channelIndex * bytesPerChannel
            const value = readChannelValue(blockDataView, pixelOffset, channel.pixelType)
            channelValues[getBroadChannelSemanticName(channel.name)] = value
          }
        }

        if (isRgbMode) {
          pixelData[pixelIndex] = channelValues.r ?? 0
          pixelData[pixelIndex + 1] = channelValues.g ?? 0
          pixelData[pixelIndex + 2] = channelValues.b ?? 0
        } else if (isLumaMode) {
          const luma = channelValues.luma ?? 0
          pixelData[pixelIndex] = luma
          pixelData[pixelIndex + 1] = luma
          pixelData[pixelIndex + 2] = luma
        } else {
          const [displayR, displayG, displayB] = assignExrDisplayRgb(channelValues, channelNames)
          pixelData[pixelIndex] = displayR
          pixelData[pixelIndex + 1] = displayG
          pixelData[pixelIndex + 2] = displayB
        }

        pixelData[pixelIndex + 3] = channelValues.a ?? 1.0
      }
    }
  }

  ensureNonNegativeFinite(pixelData)

  return {
    width,
    height,
    data: pixelData,
    linearColorSpace: linearColorSpaceFromHeader(header),
    metadata: header,
  }
}

export function readExrBroad(exrBuffer: Uint8Array): HdrifyImage {
  try {
    return readExr(exrBuffer)
  } catch (error) {
    if (
      error instanceof Error &&
      error.message.includes('Non-RGB EXR files are not supported')
    ) {
      return readExrFlexible(exrBuffer)
    }
    throw error
  }
}
