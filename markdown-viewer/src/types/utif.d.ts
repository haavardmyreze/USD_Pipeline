declare module 'utif' {
  type TiffIfd = {
    width: number
    height: number
    data: Uint8Array
  }

  export function decode(buffer: ArrayBuffer): TiffIfd[]
  export function decodeImage(buffer: ArrayBuffer, ifd: TiffIfd): void
  export function toRGBA8(ifd: TiffIfd): Uint8Array
}
