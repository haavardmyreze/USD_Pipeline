import type { ArcKind } from '@shared/types'

/**
 * How the graph encodes its two dimensions.
 *
 * They deliberately use different visual channels, because a picture that says
 * two things in colour says neither clearly:
 *
 * - **Nodes carry colour.** A card's tint is the tier the file belongs to —
 *   asset, set or shot. Areas hold colour well, and a tint still reads when
 *   the whole graph is zoomed out to fit.
 * - **Arcs carry line style.** Every wire is drawn in the same neutral grey
 *   and told apart by the rhythm of its stroke. Only the sublayer is solid;
 *   the rest are dash patterns spaced far enough apart to stay distinct. Lines
 *   are thin, so pattern survives on them where a hue would just fight the
 *   cards behind it.
 *
 * The patterns themselves live in `styles.css` as `.edge--<kind>`, so the
 * legend can draw a real sample with the same class rather than a copy of it.
 */

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

/** How each kind is drawn, in words, for the legend's tooltip. */
export const ARC_STROKE: Record<ArcKind, string> = {
  sublayer: 'as the one solid line',
  reference: 'as long dashes',
  payload: 'as short dashes',
  clip: 'as dash-dot',
  asset: 'as a fine faint stipple',
  unknown: 'as tight ticks',
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

/** The tier tint a card carries, and the accent the inspector echoes. */
export const TIER_TINT: Record<string, string> = {
  asset: 'var(--tier-asset)',
  set: 'var(--tier-set)',
  shot: 'var(--tier-shot)',
}

/**
 * A short sample of one arc kind's line, for the legend and the detail panel.
 *
 * It is drawn with the very same `.edge .edge--<kind>` classes the graph uses,
 * so a sample cannot fall out of step with the wire it stands for. The default
 * width is long enough to show a full cycle and a bit of the next one, which
 * is what makes a long dash read as different from a short one.
 */
export function arcSample(kind: ArcKind, width = 34): SVGSVGElement {
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg')
  svg.setAttribute('class', 'arcsample')
  svg.setAttribute('viewBox', `0 0 ${width} 6`)
  svg.setAttribute('aria-hidden', 'true')

  const line = document.createElementNS('http://www.w3.org/2000/svg', 'path')
  line.setAttribute('class', `edge edge--${kind}`)
  line.setAttribute('d', `M0.5 3 H${width - 0.5}`)
  svg.appendChild(line)
  return svg
}
