import {
  getChannelSemanticName,
  normalizeChannelName,
} from 'hdrify/dist/exr/exrChannelSemantics.js'

const LUMA_ALIASES = new Set([
  'm',
  'mask',
  'matte',
  'depth',
  'z',
  'zdepth',
  'roughness',
  'rough',
  'metal',
  'metallic',
  'spec',
  'specular',
  'ao',
  'occlusion',
  'opacity',
  'coverage',
  'id',
  'objectid',
  'uv',
  'u',
  'v',
])

/** Map VFX-style single-channel EXR names to display semantics. */
export function getBroadChannelSemanticName(name: string): string {
  const semantic = getChannelSemanticName(name)
  if (semantic === 'r' || semantic === 'g' || semantic === 'b' || semantic === 'a' || semantic === 'luma') {
    return semantic
  }

  if (LUMA_ALIASES.has(normalizeChannelName(name))) {
    return 'luma'
  }

  return semantic
}

export function assignExrDisplayRgb(
  channelValues: Record<string, number>,
  channelNames: string[],
): [number, number, number] {
  const r = channelValues.r
  const g = channelValues.g
  const b = channelValues.b

  if (r !== undefined || g !== undefined || b !== undefined) {
    return [r ?? 0, g ?? 0, b ?? 0]
  }

  const luma = channelValues.luma
  if (luma !== undefined) {
    return [luma, luma, luma]
  }

  for (const name of channelNames) {
    const semantic = getBroadChannelSemanticName(name)
    if (semantic === 'a') {
      continue
    }
    const value = channelValues[semantic]
    if (value !== undefined) {
      return [value, value, value]
    }
  }

  return [0, 0, 0]
}
