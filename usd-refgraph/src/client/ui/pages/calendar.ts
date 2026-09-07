/**
 * Publish history.
 *
 * This is a record of what was published and when, drawn from
 * `export_datetime_unix`. It is deliberately not a schedule: nothing in the USD
 * metadata carries a due date, so there is nothing to plan against here.
 */

import type { Project, TaskRow } from '@shared/project'
import { allTasks } from '@shared/project'
import { STATUS_COLOR, formatMoment, statusDot, statusPill } from '../../pipeline'
import { el } from '../../util'
import { pageShell } from './shell'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

let cursor: { year: number; month: number } | null = null
let selectedDay: string | null = null

export function renderCalendar(host: HTMLElement, project: Project): void {
  const rerender = (): void => renderCalendar(host, project)

  const published = allTasks(project)
    .filter((task) => task.layer.pipeline.exportedAt)
    .sort((a, b) => (b.layer.pipeline.exportedAt ?? 0) - (a.layer.pipeline.exportedAt ?? 0))

  const body = pageShell(host, 'Publishes', {
    subtitle: 'When each layer was published — history, not a schedule',
  })

  if (!published.length) {
    const card = el('section', 'card')
    card.appendChild(el('p', 'muted', 'No layer carries a publish time yet.'))
    body.appendChild(card)
    return
  }

  // Start on the month of the most recent publish, not today's month, or the
  // calendar opens empty on a project that has been quiet for a while.
  if (!cursor) {
    const latest = new Date(published[0]!.layer.pipeline.exportedAt!)
    cursor = { year: latest.getFullYear(), month: latest.getMonth() }
  }

  const byDay = new Map<string, TaskRow[]>()
  for (const task of published) {
    const key = localDayKey(task.layer.pipeline.exportedAt!)
    const list = byDay.get(key)
    if (list) list.push(task)
    else byDay.set(key, [task])
  }

  const split = el('div', 'grid grid--calendar')
  split.appendChild(monthCard(byDay, rerender))
  split.appendChild(listCard(published, byDay, rerender))
  body.appendChild(split)
}

function localDayKey(ms: number): string {
  const date = new Date(ms)
  return `${date.getFullYear()}-${date.getMonth()}-${date.getDate()}`
}

function monthCard(byDay: Map<string, TaskRow[]>, rerender: () => void): HTMLElement {
  const card = el('section', 'card')
  const { year, month } = cursor!

  const head = el('div', 'cal__head')
  const back = el('button', 'iconbtn')
  back.innerHTML = '<svg viewBox="0 0 16 16"><path d="M10 3.5 5.5 8l4.5 4.5"/></svg>'
  back.title = 'Previous month'
  back.addEventListener('click', () => {
    cursor = month === 0 ? { year: year - 1, month: 11 } : { year, month: month - 1 }
    rerender()
  })
  head.appendChild(back)

  head.appendChild(el('h2', 'cal__title', `${MONTHS[month]} ${year}`))

  const forward = el('button', 'iconbtn')
  forward.innerHTML = '<svg viewBox="0 0 16 16"><path d="m6 3.5 4.5 4.5L6 12.5"/></svg>'
  forward.title = 'Next month'
  forward.addEventListener('click', () => {
    cursor = month === 11 ? { year: year + 1, month: 0 } : { year, month: month + 1 }
    rerender()
  })
  head.appendChild(forward)
  card.appendChild(head)

  const grid = el('div', 'cal')
  for (const day of WEEKDAYS) grid.appendChild(el('div', 'cal__weekday', day))

  // Monday-first offset.
  const first = new Date(year, month, 1)
  const offset = (first.getDay() + 6) % 7
  for (let i = 0; i < offset; i++) grid.appendChild(el('div', 'cal__day cal__day--blank'))

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`
    const tasks = byDay.get(key) ?? []
    const cell = el('button', 'cal__day')
    if (!tasks.length) cell.classList.add('cal__day--quiet')
    if (selectedDay === key) cell.classList.add('is-on')

    cell.appendChild(el('span', 'cal__num', String(day)))

    if (tasks.length) {
      const dots = el('span', 'cal__dots')
      for (const task of tasks.slice(0, 6)) {
        const dot = el('span', 'cal__dot')
        dot.style.background = STATUS_COLOR[task.layer.pipeline.status]
        dots.appendChild(dot)
      }
      cell.appendChild(dots)
      cell.title = `${tasks.length} publish${tasks.length === 1 ? '' : 'es'}`
      cell.addEventListener('click', () => {
        selectedDay = selectedDay === key ? null : key
        rerender()
      })
    } else {
      cell.disabled = true
    }
    grid.appendChild(cell)
  }

  card.appendChild(grid)
  return card
}

function listCard(
  published: TaskRow[],
  byDay: Map<string, TaskRow[]>,
  rerender: () => void,
): HTMLElement {
  const card = el('section', 'card card--flush')

  const head = el('div', 'card__bar')
  const showing = selectedDay ? byDay.get(selectedDay) ?? [] : published
  head.appendChild(
    el(
      'h2',
      'card__title',
      selectedDay ? 'That day' : 'Everything, most recent first',
    ),
  )
  if (selectedDay) {
    const clearBtn = el('button', 'btn btn--small', 'Show all')
    clearBtn.addEventListener('click', () => {
      selectedDay = null
      rerender()
    })
    head.appendChild(clearBtn)
  }
  card.appendChild(head)

  const list = el('div', 'timeline')
  let lastDay = ''
  for (const task of showing) {
    const at = task.layer.pipeline.exportedAt!
    const dayLabel = new Date(at).toLocaleDateString(undefined, {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })
    if (dayLabel !== lastDay) {
      list.appendChild(el('div', 'timeline__day', dayLabel))
      lastDay = dayLabel
    }

    const row = el('div', 'timeline__row')
    row.appendChild(
      el(
        'span',
        'timeline__time',
        new Date(at).toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' }),
      ),
    )

    const main = el('span', 'timeline__main')
    const title = el('span', 'timeline__name')
    title.appendChild(statusDot(task.layer.pipeline.status))
    title.appendChild(el('span', undefined, `${task.entity.name} · ${task.step}`))
    main.appendChild(title)
    main.appendChild(el('span', 'timeline__sub', task.layer.pipeline.artist ?? ''))
    row.appendChild(main)

    // The comment gets the space between the name and the status.
    if (task.layer.pipeline.comment) {
      const comment = el('span', 'timeline__comment', task.layer.pipeline.comment)
      comment.title = task.layer.pipeline.comment
      row.appendChild(comment)
    }

    row.appendChild(statusPill(task.layer.pipeline.status, true))
    row.title = `${task.layer.name}\n${formatMoment(at)}`
    list.appendChild(row)
  }

  card.appendChild(list)
  return card
}
