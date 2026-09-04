import type { ArcKind } from '@shared/types'

/** Arc hues, matching the CSS custom properties in `styles.css`. */
export const ARC_COLOR: Record<ArcKind, string> = {
  sublayer: 'var(--arc-sublayer)',
  reference: 'var(--arc-reference)',
  payload: 'var(--arc-payload)',
  clip: 'var(--arc-clip)',
  asset: 'var(--arc-asset)',
  unknown: 'var(--arc-unknown)',
}

export const ARC_LABEL: Record<ArcKind, string> = {
  sublayer: 'sublayer',
  reference: 'reference',
  payload: 'payload',
  clip: 'value clip',
  asset: 'texture / asset',
  unknown: 'other',
}

/** One-line explanation shown as a tooltip in the legend. */
export const ARC_HINT: Record<ArcKind, string> = {
  sublayer: 'Layer stacked into this one, strongest opinion first',
  reference: 'Prim composed in from another layer',
  payload: 'Reference that can be unloaded',
  clip: 'Time-sampled data swapped in per frame',
  asset: 'File pointed at by an asset-valued attribute',
  unknown: 'Dependency USD reports that we could not attribute to an arc',
}

export const ARC_ORDER: ArcKind[] = [
  'sublayer',
  'reference',
  'payload',
  'clip',
  'asset',
  'unknown',
]

/** Node accent when a file is the graph's root. */
export const ROOT_COLOR = 'var(--root)'
export const MISSING_COLOR = 'var(--danger)'

export const ICONS = {
  /** Stacked layers — the same glyph as the Assemblies toggle. */
  assembly:
    '<path d="M8 1.8 14.2 5 8 8.2 1.8 5z"/><path d="m1.8 8 6.2 3.2L14.2 8"/><path d="m1.8 11 6.2 3.2L14.2 11"/>',
  missing: '<path d="M8 2.6 14.4 13H1.6z"/><path d="M8 6.4v3.1M8 11.3v.1"/>',
  binary: '<rect x="3" y="2.5" width="10" height="11" rx="1.6"/><path d="M5.6 6h4.8M5.6 8.4h4.8M5.6 10.8h3"/>',
  template: '<path d="M6.2 2.6 4.4 13.4M11.6 2.6 9.8 13.4M2.8 5.8h10.4M2.2 10.2h10.4"/>',
  folder: '<path d="M1.6 4.2A1.6 1.6 0 0 1 3.2 2.6h2.4l1.4 1.6h5.8a1.6 1.6 0 0 1 1.6 1.6v6a1.6 1.6 0 0 1-1.6 1.6H3.2a1.6 1.6 0 0 1-1.6-1.6z"/>',
  file: '<path d="M9 1.8H4.4A1.4 1.4 0 0 0 3 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4V5.8z"/><path d="M9 1.8v4h4"/>',
  drive: '<rect x="1.8" y="3" width="12.4" height="10" rx="1.8"/><path d="M1.8 8.4h12.4"/><circle cx="4.6" cy="10.7" r=".7"/>',
  check: '<path d="m3.4 8.4 3 3 6.2-6.6"/>',
  alert: '<circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.6M8 10.7v.1"/>',
  copy: '<rect x="5.4" y="5.4" width="8" height="8" rx="1.5"/><path d="M10.6 5.4V4A1.4 1.4 0 0 0 9.2 2.6H4A1.4 1.4 0 0 0 2.6 4v5.2A1.4 1.4 0 0 0 4 10.6h1.4"/>',
  target: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6"/><path d="M8 .8v2.4M8 12.8v2.4M.8 8h2.4M12.8 8h2.4"/>',
  external: '<path d="M9 2.6h4.4V7"/><path d="m13.4 2.6-6 6"/><path d="M11.6 9.4v3a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V5.8a1.4 1.4 0 0 1 1.4-1.4h3"/>',
} as const
