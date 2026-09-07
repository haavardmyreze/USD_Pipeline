/** Shared presentation for pipeline status and entity categories. */

import type { Status } from '@shared/project'
import { el } from './util'

export const STATUS_LABEL: Record<Status, string> = {
  placeholder: 'Placeholder',
  production_ready: 'Production ready',
  locked: 'Locked',
  unknown: 'No status',
}

/** Short form for tight spaces like grid cells. */
export const STATUS_SHORT: Record<Status, string> = {
  placeholder: 'Placeholder',
  production_ready: 'Ready',
  locked: 'Locked',
  unknown: '—',
}

/**
 * Amber for work in progress, blue once it is usable downstream, green when
 * it is signed off. Matches the CSS custom properties in `styles.css`.
 */
export const STATUS_COLOR: Record<Status, string> = {
  placeholder: 'var(--status-placeholder)',
  production_ready: 'var(--status-ready)',
  locked: 'var(--status-locked)',
  unknown: 'var(--status-unknown)',
}

export const STATUS_HINT: Record<Status, string> = {
  placeholder: 'Stand-in, not ready for anyone downstream',
  production_ready: 'Good to build on',
  locked: 'Signed off; do not change without talking to the owner',
  unknown: 'No status was written into this layer',
}

/** Colour per asset category prefix (guide §15.2). */
export const CATEGORY_COLOR: Record<string, string> = {
  character: 'var(--cat-character)',
  prop: 'var(--cat-prop)',
  environment: 'var(--cat-environment)',
  vehicle: 'var(--cat-vehicle)',
  fx: 'var(--cat-fx)',
  set: 'var(--cat-set)',
}

export function statusPill(status: Status, short = false): HTMLElement {
  const pill = el('span', `pill pill--${status}`, short ? STATUS_SHORT[status] : STATUS_LABEL[status])
  pill.title = STATUS_HINT[status]
  return pill
}

export function statusDot(status: Status): HTMLElement {
  const dot = el('span', `dot dot--${status}`)
  dot.title = STATUS_LABEL[status]
  return dot
}

/** `1788769845000` -> `6 Sep 2026, 14:30`. */
export function formatMoment(ms: number | null | undefined): string {
  if (!ms) return '—'
  return new Date(ms).toLocaleString(undefined, {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  })
}

/** `2026-09-06`, for grouping by day without timezone surprises. */
export function dayKey(ms: number): string {
  const date = new Date(ms)
  const month = `${date.getMonth() + 1}`.padStart(2, '0')
  const day = `${date.getDate()}`.padStart(2, '0')
  return `${date.getFullYear()}-${month}-${day}`
}

export function relativeDay(ms: number): string {
  const days = Math.floor((Date.now() - ms) / 86_400_000)
  if (days <= 0) return 'today'
  if (days === 1) return 'yesterday'
  if (days < 30) return `${days} days ago`
  if (days < 365) return `${Math.round(days / 30)} months ago`
  return `${Math.round(days / 365)} years ago`
}
