const MIME_EXTENSION: Record<string, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
  'image/gif': 'gif',
  'image/bmp': 'bmp',
  'image/tiff': 'tiff',
  'image/x-exr': 'exr',
  'image/vnd.radiance': 'hdr',
}

export function clipboardImageExtension(mimeType: string) {
  return MIME_EXTENSION[mimeType.toLowerCase()] ?? 'png'
}

export function clipboardImageFileName(mimeType: string) {
  return `clipboard.${clipboardImageExtension(mimeType)}`
}

/** First image file on the clipboard, normalized to a stable import name. */
export function readClipboardImageFile(dataTransfer: DataTransfer): File | null {
  for (const item of dataTransfer.items) {
    if (item.kind !== 'file') {
      continue
    }

    const type = item.type.toLowerCase()
    if (!type.startsWith('image/')) {
      continue
    }

    const file = item.getAsFile()
    if (!file) {
      continue
    }

    return new File([file], clipboardImageFileName(type), { type: file.type || type })
  }

  for (const file of dataTransfer.files) {
    const type = file.type.toLowerCase()
    if (!type.startsWith('image/')) {
      continue
    }

    return new File([file], clipboardImageFileName(type), { type: file.type || type })
  }

  return null
}

export async function writeCanvasToClipboard(canvas: HTMLCanvasElement) {
  if (!navigator.clipboard?.write || typeof ClipboardItem === 'undefined') {
    throw new Error('Image copy is not supported in this browser.')
  }

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, 'image/png')
  })

  if (!blob) {
    throw new Error('Could not copy image.')
  }

  await navigator.clipboard.write([
    new ClipboardItem({
      'image/png': blob,
    }),
  ])
}
