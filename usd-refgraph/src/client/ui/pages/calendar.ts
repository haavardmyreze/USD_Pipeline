/**
 * Publish history.
 *
 * A record of what was published and when, drawn from `export_datetime_unix`.
 * It is deliberately not a schedule: nothing in the USD metadata carries a due
 * date, so there is nothing to plan against here.
 */

import type { TaskRow } from '@shared/project'
import { allTasks, byRecency } from '@shared/project'
import {
  STATUS_COLOR,
  button,
  card,
  emptyState,
  iconButton,
  namedCell,
  statusPill,
  truncated,
} from '../kit'
import { dayKey, el, formatMoment } from '../../util'
import { pageState, type PageContext } from './context'
import { pageShell } from './shell'

const MONTHS = [
  'January', 'February', 'March', 'April', 'May', 'June',
  'July', 'August', 'September', 'October', 'November', 'December',
]
const WEEKDAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']

export function renderCalendar(host: HTMLElement, context: PageContext): void {
  const state = pageState.calendar

  const published = allTasks(context.project)
    .filter((task) => task.layer.pipeline.exportedAt)
    .sort(byRecency)

  const body = pageShell(host, 'Publishes', {
    subtitle: 'When each layer was published — history, not a schedule',
    meta: `${published.length} ${published.length === 1 ? 'publish' : 'publishes'}`,
  })

  if (!published.length) {
    body.appendChild(
      emptyState('No layer carries a publish time yet.', {
        icon: 'clock',
        body: 'Publishing writes `export_datetime_unix` into the layer; nothing here has one.',
      }),
    )
    return
  }

  // Start on the month of the most recent publish, not today's month, or the
  // calendar opens empty on a project that has been quiet for a while.
  if (!state.cursor) {
    const latest = new Date(published[0]!.layer.pipeline.exportedAt!)
    state.cursor = { year: latest.getFullYear(), month: latest.getMonth() }
  }

  const byDay = new Map<string, TaskRow[]>()
  for (const task of published) {
    const key = dayKey(task.layer.pipeline.exportedAt!)
    const list = byDay.get(key)
    if (list) list.push(task)
    else byDay.set(key, [task])
  }

  const split = el('div', 'grid grid--calendar')
  split.appendChild(monthCard(byDay, context))
  split.appendChild(listCard(published, byDay, context))
  body.appendChild(split)
}

function monthCard(byDay: Map<string, TaskRow[]>, context: PageContext): HTMLElement {
  const state = pageState.calendar
  const { year, month } = state.cursor!

  const step = (delta: number): void => {
    const next = month + delta
    state.cursor = {
      year: year + Math.floor(next / 12),
      month: ((next % 12) + 12) % 12,
    }
    context.refresh()
  }

  const nav = el('div', 'cal__nav')
  nav.appendChild(iconButton('chevronLeft', 'Previous month', () => step(-1)))
  nav.appendChild(iconButton('chevronRight', 'Next month', () => step(1)))

  const { root, body } = card(`${MONTHS[month]} ${year}`, { actions: nav })

  const grid = el('div', 'cal')
  for (const day of WEEKDAYS) grid.appendChild(el('div', 'cal__weekday', day))

  // Monday-first offset.
  const offset = (new Date(year, month, 1).getDay() + 6) % 7
  for (let i = 0; i < offset; i++) grid.appendChild(el('div', 'cal__day cal__day--blank'))

  const daysInMonth = new Date(year, month + 1, 0).getDate()
  for (let day = 1; day <= daysInMonth; day++) {
    const key = `${year}-${month}-${day}`
    const tasks = byDay.get(key) ?? []
    const cell = el('button', 'cal__day')
    if (!tasks.length) cell.classList.add('cal__day--quiet')
    if (state.selectedDay === key) cell.classList.add('is-on')

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
        state.selectedDay = state.selectedDay === key ? null : key
        context.refresh()
      })
    } else {
      cell.disabled = true
    }
    grid.appendChild(cell)
  }

  body.appendChild(grid)
  return root
}

function listCard(
  published: TaskRow[],
  byDay: Map<string, TaskRow[]>,
  context: PageContext,
): HTMLElement {
  const state = pageState.calendar
  const showing = state.selectedDay ? byDay.get(state.selectedDay) ?? [] : published

  const { root, body } = card(state.selectedDay ? 'That day' : 'Most recent first', {
    hint: `${showing.length} ${showing.length === 1 ? 'layer' : 'layers'}`,
    flush: true,
    actions: state.selectedDay
      ? button('Show all', {
          variant: 'ghost',
          small: true,
          onClick: () => {
            state.selectedDay = null
            context.refresh()
          },
        })
      : undefined,
  })

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
    main.appendChild(
      namedCell(`${task.entity.name} · ${task.step}`, {
        status: task.layer.pipeline.status,
        strong: true,
      }),
    )
    main.appendChild(el('span', 'timeline__sub', task.layer.pipeline.artist ?? '—'))
    row.appendChild(main)

    row.appendChild(
      truncated(task.layer.pipeline.comment || '', 'timeline__comment'),
    )
    row.appendChild(statusPill(task.layer.pipeline.status, true))
    row.title = `${task.layer.name}\n${formatMoment(at)}`
    list.appendChild(row)
  }

  body.appendChild(list)
  return root
}
