import { describe, expect, it } from 'vitest'
import { clipboardImageExtension, clipboardImageFileName } from './clipboardImage'

describe('clipboardImage', () => {
  it('maps common image mime types to clipboard filenames', () => {
    expect(clipboardImageExtension('image/png')).toBe('png')
    expect(clipboardImageExtension('image/jpeg')).toBe('jpg')
    expect(clipboardImageFileName('image/webp')).toBe('clipboard.webp')
  })

  it('falls back to png for unknown image mime types', () => {
    expect(clipboardImageExtension('image/x-custom')).toBe('png')
    expect(clipboardImageFileName('image/x-custom')).toBe('clipboard.png')
  })
})
