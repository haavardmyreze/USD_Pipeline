import { describe, expect, it } from 'vitest'
import { imageKindFromBytes, imageKindFromFileName, resolveImageKind } from './imageFormat'

describe('imageFormat', () => {
  it('detects common extensions', () => {
    expect(imageKindFromFileName('photo.png')).toBe('standard')
    expect(imageKindFromFileName('scan.TIFF')).toBe('tiff')
    expect(imageKindFromFileName('render.exr')).toBe('exr')
    expect(imageKindFromFileName('env.hdr')).toBe('hdr')
  })

  it('detects png magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer
    expect(imageKindFromBytes(bytes)).toBe('standard')
  })

  it('prefers file extension over magic bytes', () => {
    const bytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0, 0, 0, 0]).buffer
    expect(resolveImageKind('frame.exr', bytes)).toBe('exr')
  })
})
