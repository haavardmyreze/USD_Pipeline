/**
 * The outline travels inside every exported PNG, as an `iTXt` chunk, so a
 * picture in the docs can be dropped back into the tool and edited — no
 * separate source file to keep beside it.
 */

const KEYWORD = 'usd-treediagram'
const SIGNATURE = [137, 80, 78, 71, 13, 10, 26, 10]

/** A copy of `png` carrying `data` as JSON, just before its image data. */
export async function embed(png: Blob, data: unknown): Promise<Blob> {
  const bytes = new Uint8Array(await png.arrayBuffer())
  const chunk = makeChunk('iTXt', [
    ...latin1(KEYWORD),
    0, // keyword terminator
    0, // not compressed
    0, // compression method
    0, // no language tag
    0, // no translated keyword
    ...new TextEncoder().encode(JSON.stringify(data)),
  ])
  // IHDR is always first, and a chunk may go anywhere after it.
  const ihdrEnd = 8 + 12 + readUint32(bytes, 8)
  return new Blob([bytes.slice(0, ihdrEnd), chunk, bytes.slice(ihdrEnd)], { type: 'image/png' })
}

/** The data `embed` stored in a PNG, or null if it has none. */
export async function extract(file: Blob): Promise<unknown> {
  const bytes = new Uint8Array(await file.arrayBuffer())
  if (!SIGNATURE.every((value, index) => bytes[index] === value)) return null
  let offset = 8
  while (offset + 12 <= bytes.length) {
    const length = readUint32(bytes, offset)
    const type = String.fromCharCode(...bytes.slice(offset + 4, offset + 8))
    const body = bytes.slice(offset + 8, offset + 8 + length)
    if (type === 'iTXt') {
      const nul = body.indexOf(0)
      if (String.fromCharCode(...body.slice(0, nul)) === KEYWORD) {
        // Skip the compression flag, method, and the two empty strings.
        let start = nul + 3
        start = body.indexOf(0, start) + 1
        start = body.indexOf(0, start) + 1
        try {
          return JSON.parse(new TextDecoder().decode(body.slice(start)))
        } catch {
          return null
        }
      }
    }
    if (type === 'IEND') break
    offset += 12 + length
  }
  return null
}

function makeChunk(type: string, data: number[]): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(12 + data.length)
  const view = new DataView(out.buffer)
  view.setUint32(0, data.length)
  out.set(latin1(type), 4)
  out.set(data, 8)
  view.setUint32(8 + data.length, crc32(out.subarray(4, 8 + data.length)))
  return out
}

function latin1(text: string): number[] {
  return Array.from(text, (char) => char.charCodeAt(0))
}

function readUint32(bytes: Uint8Array, offset: number): number {
  return new DataView(bytes.buffer, bytes.byteOffset).getUint32(offset)
}

let table: Uint32Array | null = null

function crc32(bytes: Uint8Array): number {
  if (!table) {
    table = new Uint32Array(256)
    for (let n = 0; n < 256; n++) {
      let c = n
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
      table[n] = c >>> 0
    }
  }
  let crc = 0xffffffff
  for (const byte of bytes) crc = table[(crc ^ byte) & 0xff]! ^ (crc >>> 8)
  return (crc ^ 0xffffffff) >>> 0
}
