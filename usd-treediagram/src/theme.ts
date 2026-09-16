/**
 * The colours a diagram is drawn in.
 *
 * Dark is usd-refgraph's scene tree exactly: Apple's dark system colours.
 * Light is the same design in Apple's light counterparts, for documentation
 * pages with a white background.
 */

export interface Theme {
  /** Behind the whole image, when the background is solid. */
  page: string
  /** The panel card, when the frame is a panel. */
  panel: string
  panelLine: string
  fg: string
  fg2: string
  fg3: string
  rail: string
  railSelected: string
  selected: string
  onSelected: string
  onSelectedSoft: string
  onSelectedFill: string
  fill: string
  /** The shade on every other row. */
  stripe: string
  variant: string
  variantFill: string
  callout: string
  danger: string
  strike: string
}

export const THEMES: Record<'dark' | 'light', Theme> = {
  dark: {
    page: '#000000',
    panel: '#161618',
    panelLine: 'rgba(255, 255, 255, 0.08)',
    fg: '#e5e5ea',
    fg2: '#98989f',
    fg3: '#6c6c72',
    rail: 'rgba(255, 255, 255, 0.2)',
    railSelected: 'rgba(255, 255, 255, 0.45)',
    selected: '#0a84ff',
    onSelected: '#ffffff',
    onSelectedSoft: 'rgba(255, 255, 255, 0.75)',
    onSelectedFill: 'rgba(255, 255, 255, 0.18)',
    fill: 'rgba(118, 118, 128, 0.24)',
    stripe: 'rgba(255, 255, 255, 0.03)',
    variant: '#64d2ff',
    variantFill: 'rgba(100, 210, 255, 0.16)',
    callout: '#ff9f0a',
    danger: '#ff453a',
    strike: 'rgba(255, 255, 255, 0.25)',
  },
  light: {
    page: '#ffffff',
    panel: '#f5f5f7',
    panelLine: 'rgba(0, 0, 0, 0.08)',
    fg: '#1d1d1f',
    fg2: '#6e6e73',
    fg3: '#8e8e93',
    rail: 'rgba(0, 0, 0, 0.2)',
    railSelected: 'rgba(255, 255, 255, 0.55)',
    selected: '#007aff',
    onSelected: '#ffffff',
    onSelectedSoft: 'rgba(255, 255, 255, 0.8)',
    onSelectedFill: 'rgba(255, 255, 255, 0.22)',
    fill: 'rgba(118, 118, 128, 0.12)',
    stripe: 'rgba(0, 0, 0, 0.03)',
    variant: '#0071a4',
    variantFill: 'rgba(50, 173, 230, 0.16)',
    callout: '#c93400',
    danger: '#d70015',
    strike: 'rgba(0, 0, 0, 0.3)',
  },
}
