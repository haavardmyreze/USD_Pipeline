/**
 * Which HIP file writes which layer.
 *
 * Publishing records the workfile and the ROP that produced each layer, so the
 * provenance is already in the files — this just inverts it: one box per
 * workfile, listing everything it writes and the ROP each came out of.
 */

import type { Project, TaskRow } from '@shared/project'
import { allTasks } from '@shared/project'
import { formatMoment, relativeDay, statusDot, statusPill } from '../../pipeline'
import { el } from '../../util'
import { pageShell } from './shell'

const UNRECORDED = '— no workfile recorded —'

/** Which workfile is open; null collapses them all. */
let expanded: string | null = null

export function renderWorkfiles(host: HTMLElement, project: Project): void {
  const rerender = (): void => renderWorkfiles(host, project)

  const byHip = new Map<string, TaskRow[]>()
  for (const task of allTasks(project)) {
    const hip = task.layer.pipeline.hipFile ?? UNRECORDED
    const list = byHip.get(hip)
    if (list) list.push(task)
    else byHip.set(hip, [task])
  }

  // Most recently used workfile first; the unrecorded bucket always last.
  const hips = [...byHip.keys()].sort((a, b) => {
    if (a === UNRECORDED) return 1
    if (b === UNRECORDED) return -1
    return latest(byHip.get(b)!) - latest(byHip.get(a)!)
  })

  const body = pageShell(host, 'Workfiles', {
    subtitle: 'Which HIP file writes which layer',
    actions: el(
      'div',
      'page__meta',
      `${hips.length} ${hips.length === 1 ? 'workfile' : 'workfiles'} · ${
        byHip.size ? allTasks(project).length : 0
      } layers`,
    ),
  })

  if (!hips.length) {
    const card = el('section', 'card')
    card.appendChild(el('p', 'muted', 'No published layers found.'))
    body.appendChild(card)
    return
  }

  // With a single workfile there is nothing to choose between, so open it.
  if (hips.length === 1 && expanded === null) expanded = hips[0]!

  const stack = el('div', 'stack__list')
  for (const hip of hips) {
    stack.appendChild(hipBox(hip, byHip.get(hip)!, rerender))
  }
  body.appendChild(stack)
}

function latest(rows: TaskRow[]): number {
  return Math.max(0, ...rows.map((row) => row.layer.pipeline.exportedAt ?? 0))
}

function hipBox(hip: string, rows: TaskRow[], rerender: () => void): HTMLElement {
  const isOpen = expanded === hip
  const unrecorded = hip === UNRECORDED

  const box = el('div', 'ebox')
  if (isOpen) box.classList.add('is-open')
  if (expanded !== null && !isOpen) box.classList.add('is-dim')

  const row = el('button', 'ebox__row')

  const icon = el('span', 'hip__icon')
  icon.innerHTML =
    '<svg viewBox="0 0 16 16"><path d="M9.6 1.8H4.6A1.4 1.4 0 0 0 3.2 3.2v9.6a1.4 1.4 0 0 0 1.4 1.4h6.8a1.4 1.4 0 0 0 1.4-1.4V5.2z"/><path d="M9.6 1.8v3.6h3.2"/><path d="M5.6 9h4.8M5.6 11.2h3"/></svg>'
  row.appendChild(icon)

  const name = el('span', 'hip__name', hip)
  if (unrecorded) name.classList.add('hip__name--none')
  row.appendChild(name)

  const artists = [
    ...new Set(rows.map((r) => r.layer.pipeline.artist).filter(Boolean)),
  ] as string[]
  if (artists.length) {
    row.appendChild(el('span', 'hip__artist', artists.join(', ')))
  }

  const right = el('span', 'ebox__right')
  const when = latest(rows)
  if (when) {
    const stamp = el('span', 'ebox__count', relativeDay(when))
    stamp.title = formatMoment(when)
    right.appendChild(stamp)
  }
  right.appendChild(
    el('span', 'ebox__count', `${rows.length} ${rows.length === 1 ? 'layer' : 'layers'}`),
  )
  right.appendChild(el('span', 'ebox__hint', isOpen ? 'Hide' : 'Expand'))
  row.appendChild(right)

  row.addEventListener('click', () => {
    expanded = isOpen ? null : hip
    rerender()
  })
  box.appendChild(row)

  if (isOpen) box.appendChild(outputs(rows, unrecorded))
  return box
}

function outputs(rows: TaskRow[], unrecorded: boolean): HTMLElement {
  const panel = el('div', 'epanel')

  if (unrecorded) {
    panel.appendChild(
      el(
        'p',
        'muted',
        'These layers carry no hip_file, so what produced them cannot be traced.',
      ),
    )
  }

  // Sorting by ROP keeps the outputs of one part of the stage together, since
  // ROP paths share a prefix per network.
  const sorted = [...rows].sort(
    (a, b) =>
      (a.layer.pipeline.ropPath ?? '').localeCompare(b.layer.pipeline.ropPath ?? '') ||
      a.entity.name.localeCompare(b.entity.name),
  )

  const head = el('div', 'hiprow hiprow--head')
  for (const label of ['ROP', 'Writes', 'Status']) {
    head.appendChild(el('span', undefined, label))
  }
  panel.appendChild(head)

  const list = el('div', 'stack__list')
  for (const row of sorted) list.appendChild(outputRow(row))
  panel.appendChild(list)
  return panel
}

/** `/stage/Bob_Lookdev/mz_usd_rop2` reads better as `Bob_Lookdev / mz_usd_rop2`. */
function ropLabel(path: string | undefined): string {
  if (!path) return '—'
  const parts = path.split('/').filter(Boolean)
  if (parts[0] === 'stage') parts.shift()
  return parts.join(' / ') || path
}

function outputRow(row: TaskRow): HTMLElement {
  const line = el('div', 'hiprow hiprow--item')

  const rop = el('span', 'hiprow__rop', ropLabel(row.layer.pipeline.ropPath))
  rop.title = row.layer.pipeline.ropPath ?? 'No rop_path recorded'
  line.appendChild(rop)

  const target = el('span', 'hiprow__target')
  target.appendChild(statusDot(row.entity.status))
  target.appendChild(el('span', undefined, row.layer.name))
  target.title = row.layer.path
  line.appendChild(target)

  const status = el('span', 'hiprow__status')
  status.appendChild(statusPill(row.layer.pipeline.status))
  line.appendChild(status)

  return line
}
