/**
 * Every inline icon in the app, in one place.
 *
 * All of them are drawn on a 16×16 grid as stroked paths with no fills, so
 * `svg { fill: none; stroke: currentColor }` in the stylesheet is the only
 * styling any of them need and they inherit weight and colour from wherever
 * they land.
 */

export const ICONS = {
  /** Stacked layers — the same glyph as the Assemblies toggle. */
  assembly:
    '<path d="M8 1.8 14.2 5 8 8.2 1.8 5z"/><path d="m1.8 8 6.2 3.2L14.2 8"/><path d="m1.8 11 6.2 3.2L14.2 11"/>',
  missing: '<path d="M8 2.6 14.4 13H1.6z"/><path d="M8 6.4v3.1M8 11.3v.1"/>',
  template: '<path d="M6.2 2.6 4.4 13.4M11.6 2.6 9.8 13.4M2.8 5.8h10.4M2.2 10.2h10.4"/>',
  folder:
    '<path d="M1.6 4.2A1.6 1.6 0 0 1 3.2 2.6h2.4l1.4 1.6h5.8a1.6 1.6 0 0 1 1.6 1.6v6a1.6 1.6 0 0 1-1.6 1.6H3.2a1.6 1.6 0 0 1-1.6-1.6z"/>',
  file: '<path d="M9 1.8H4.4A1.4 1.4 0 0 0 3 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h7.2a1.4 1.4 0 0 0 1.4-1.4V5.8z"/><path d="M9 1.8v4h4"/>',
  drive:
    '<rect x="1.8" y="3" width="12.4" height="10" rx="1.8"/><path d="M1.8 8.4h12.4"/><circle cx="4.6" cy="10.7" r=".7"/>',
  check: '<path d="m3.4 8.4 3 3 6.2-6.6"/>',
  alert: '<circle cx="8" cy="8" r="6.2"/><path d="M8 5v3.6M8 10.7v.1"/>',
  copy: '<rect x="5.4" y="5.4" width="8" height="8" rx="1.5"/><path d="M10.6 5.4V4A1.4 1.4 0 0 0 9.2 2.6H4A1.4 1.4 0 0 0 2.6 4v5.2A1.4 1.4 0 0 0 4 10.6h1.4"/>',
  target: '<circle cx="8" cy="8" r="5.6"/><circle cx="8" cy="8" r="1.6"/><path d="M8 .8v2.4M8 12.8v2.4M.8 8h2.4M12.8 8h2.4"/>',
  external:
    '<path d="M9 2.6h4.4V7"/><path d="m13.4 2.6-6 6"/><path d="M11.6 9.4v3a1.4 1.4 0 0 1-1.4 1.4H3.6a1.4 1.4 0 0 1-1.4-1.4V5.8a1.4 1.4 0 0 1 1.4-1.4h3"/>',
  /** Three connected nodes — the mark for "open this in the graph". */
  graph:
    '<circle cx="3.4" cy="8" r="1.8"/><circle cx="12.6" cy="4.2" r="1.8"/><circle cx="12.6" cy="11.8" r="1.8"/><path d="m5.1 7.3 5.9-2.4M5.1 8.7l5.9 2.4"/>',
  arrowUp: '<path d="M8 12.6V3.4M3.6 7.8 8 3.4l4.4 4.4"/>',
  chevronLeft: '<path d="M10 3.5 5.5 8l4.5 4.5"/>',
  chevronRight: '<path d="m6 3.5 4.5 4.5L6 12.5"/>',
  search: '<circle cx="7" cy="7" r="4.6"/><path d="m10.6 10.6 3 3"/>',
  user: '<circle cx="8" cy="5.6" r="2.6"/><path d="M3 13.4a5 5 0 0 1 10 0"/>',
  clock: '<circle cx="8" cy="8" r="6.2"/><path d="M8 4.4V8l2.4 1.6"/>',
  hip: '<path d="M9.6 1.8H4.6A1.4 1.4 0 0 0 3.2 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.2z"/><path d="M9.6 1.8v3.6h3.2"/><path d="M5.6 9h4.8M5.6 11.2h3"/>',
  keyboard:
    '<rect x="1.4" y="3.6" width="13.2" height="8.8" rx="1.6"/><path d="M4 6.4h.01M6.6 6.4h.01M9.4 6.4h.01M12 6.4h.01M4 9h.01M12 9h.01M6.4 9h3.2"/>',
  inbox:
    '<path d="M1.8 8.6h3.2l1 2h4l1-2h3.2"/><path d="M3.6 3.2h8.8l1.8 5.4v3.6a1.4 1.4 0 0 1-1.4 1.4H3.2a1.4 1.4 0 0 1-1.4-1.4V8.6z"/>',
} as const

export type IconName = keyof typeof ICONS
