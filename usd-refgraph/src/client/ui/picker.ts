/**
 * The in-app file picker.
 *
 * A browser file input hands us a name, not a path, and the crawler needs a
 * real path to anchor relative asset paths against — so the app browses the
 * filesystem through the backend instead.
 */

import { browse } from '../api'
import type { Capabilities, DirEntry, DirListing } from '@shared/types'
import { clear, el, formatBytes, icon, must } from '../util'
import { ICONS } from '../graph/theme'

export class FilePicker {
  private readonly modal = must<HTMLElement>('#picker')
  private readonly scrim = must<HTMLElement>('#picker-scrim')
  private readonly closeBtn = must<HTMLButtonElement>('#picker-close')
  private readonly crumbs = must<HTMLElement>('#crumbs')
  private readonly rootsEl = must<HTMLElement>('#picker-roots')
  private readonly listEl = must<HTMLElement>('#picker-list')
  private readonly input = must<HTMLInputElement>('#picker-path')
  private readonly goBtn = must<HTMLButtonElement>('#picker-go')

  private resolve: ((path: string | null) => void) | null = null
  private entries: DirEntry[] = []
  private activeIndex = -1
  private currentDir = ''

  constructor(private capabilities: Capabilities) {
    this.renderRoots()

    this.scrim.addEventListener('click', () => this.close(null))
    this.closeBtn.addEventListener('click', () => this.close(null))
    this.goBtn.addEventListener('click', () => this.submitTyped())

    this.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter') {
        event.preventDefault()
        this.submitTyped()
      }
    })

    this.listEl.addEventListener('keydown', (event) => this.onListKey(event))
    document.addEventListener('keydown', (event) => {
      if (this.modal.hidden) return
      if (event.key === 'Escape') {
        event.preventDefault()
        this.close(null)
      }
    })
  }

  /** Show the picker; resolves with a file path, or null if dismissed. */
  open(startPath?: string, prefill?: string): Promise<string | null> {
    this.modal.hidden = false
    this.input.value = prefill ?? ''
    const start =
      startPath ??
      this.currentDir ??
      this.capabilities.roots[0]?.path ??
      ''
    void this.navigate(start)
    window.setTimeout(() => this.listEl.focus(), 30)
    return new Promise((resolve) => {
      this.resolve = resolve
    })
  }

  private close(path: string | null): void {
    this.modal.hidden = true
    this.resolve?.(path)
    this.resolve = null
  }

  private submitTyped(): void {
    const typed = this.input.value.trim().replace(/^["']|["']$/g, '')
    if (typed) this.close(typed)
  }

  private renderRoots(): void {
    clear(this.rootsEl)
    this.rootsEl.appendChild(el('div', 'picker__roots-label', 'Places'))
    for (const root of this.capabilities.roots) {
      const button = el('button', 'root-row')
      const glyph = /^[A-Z]:$/i.test(root.label) ? ICONS.drive : ICONS.folder
      button.appendChild(icon(glyph))
      button.appendChild(el('span', undefined, root.label))
      button.title = root.path
      button.addEventListener('click', () => void this.navigate(root.path))
      this.rootsEl.appendChild(button)
    }
  }

  private async navigate(path: string): Promise<void> {
    try {
      const listing = await browse(path)
      this.currentDir = listing.path
      this.renderListing(listing)
    } catch (error) {
      clear(this.listEl)
      const message =
        error instanceof Error ? error.message : 'Could not open that folder'
      this.listEl.appendChild(el('div', 'picker__empty', message))
    }
  }

  private renderListing(listing: DirListing): void {
    this.entries = listing.entries
    this.activeIndex = -1

    clear(this.crumbs)
    listing.crumbs.forEach((crumb, index) => {
      if (index > 0) this.crumbs.appendChild(el('span', 'crumb__sep', '/'))
      const button = el('button', 'crumb', crumb.label)
      button.addEventListener('click', () => void this.navigate(crumb.path))
      this.crumbs.appendChild(button)
    })

    clear(this.listEl)

    if (listing.parent) {
      const up = el('button', 'entry entry--dir')
      up.appendChild(iconEl('<path d="M8 12.6V3.4M3.6 7.8 8 3.4l4.4 4.4"/>'))
      up.appendChild(el('span', 'entry__name', '..'))
      up.addEventListener('click', () => void this.navigate(listing.parent!))
      this.listEl.appendChild(up)
    }

    if (!listing.entries.length) {
      this.listEl.appendChild(el('div', 'picker__empty', 'This folder is empty.'))
      return
    }

    for (const entry of listing.entries) {
      this.listEl.appendChild(this.buildEntry(entry))
    }

    if (listing.truncated) {
      this.listEl.appendChild(
        el('div', 'picker__empty', 'Folder is very large — only the first entries are shown.'),
      )
    }
  }

  private buildEntry(entry: DirEntry): HTMLElement {
    const kind = entry.isDir ? 'dir' : entry.isUsd ? 'usd' : 'other'
    const button = el('button', `entry entry--${kind}`)
    button.appendChild(iconEl(entry.isDir ? ICONS.folder : ICONS.file))
    button.appendChild(el('span', 'entry__name', entry.name))

    if (entry.isUsd) {
      const ext = entry.name.split('.').pop() ?? ''
      button.appendChild(el('span', 'entry__ext', ext))
    }
    if (!entry.isDir) {
      button.appendChild(el('span', 'entry__size', formatBytes(entry.size)))
    }

    button.addEventListener('click', () => {
      if (entry.isDir) void this.navigate(entry.path)
      else this.close(entry.path)
    })
    return button
  }

  private onListKey(event: KeyboardEvent): void {
    const rows = [...this.listEl.querySelectorAll<HTMLElement>('.entry')]
    if (!rows.length) return

    if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
      event.preventDefault()
      const step = event.key === 'ArrowDown' ? 1 : -1
      this.activeIndex = Math.max(
        0,
        Math.min(rows.length - 1, this.activeIndex + step),
      )
      rows.forEach((row, i) => row.classList.toggle('is-active', i === this.activeIndex))
      rows[this.activeIndex]?.scrollIntoView({ block: 'nearest' })
    } else if (event.key === 'Enter' && this.activeIndex >= 0) {
      event.preventDefault()
      rows[this.activeIndex]?.click()
    }
  }
}

function iconEl(paths: string): SVGSVGElement {
  const svg = icon(paths)
  svg.setAttribute('class', 'entry__icon')
  return svg
}
