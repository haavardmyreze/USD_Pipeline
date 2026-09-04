/**
 * Drag-and-drop, and paste, for opening a USD file.
 *
 * A browser never hands over a dropped file's real path — only its name and
 * bytes — but the crawler needs the path to anchor relative asset paths. So a
 * drop is resolved in three steps, best first:
 *
 *   1. Some sources (VS Code, many file managers, a dragged link) attach a
 *      `file://` URI to the drag. That is the exact path, use it.
 *   2. Otherwise ask the backend to find a file of that name and size in the
 *      directories the user has already worked in.
 *   3. If that finds nothing, say so plainly and open the picker.
 *
 * Dragging from Windows Explorer takes route 2.
 */

import { locate } from '../api'
import { clear, el, formatBytes, formatDate, icon, must } from '../util'
import { ICONS } from '../graph/theme'
import type { LocateMatch } from '@shared/types'

const USD_EXTENSIONS = ['.usd', '.usda', '.usdc', '.usdz']

export interface DropCallbacks {
  /** Directories worth searching, nearest first. */
  searchRoots(): string[]
  onOpen(path: string): void
  onToast(message: string, kind?: 'ok' | 'error'): void
  onBrowse(name: string): void
}

export class DropZone {
  private readonly overlay = must<HTMLElement>('#dropzone')
  private readonly overlayText = must<HTMLElement>('#dropzone-text')
  private readonly chooser = must<HTMLElement>('#chooser')
  private readonly chooserList = must<HTMLElement>('#chooser-list')
  private readonly chooserTitle = must<HTMLElement>('#chooser-title')
  private readonly chooserNote = must<HTMLElement>('#chooser-note')

  /** Nested dragenter/dragleave pairs, counted so the overlay does not flicker. */
  private depth = 0
  private searching = false

  constructor(private readonly callbacks: DropCallbacks) {
    this.bindDrag()
    this.bindPaste()

    must<HTMLElement>('#chooser-scrim').addEventListener('click', () => this.closeChooser())
    must<HTMLElement>('#chooser-close').addEventListener('click', () => this.closeChooser())
    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && !this.chooser.hidden) {
        event.preventDefault()
        this.closeChooser()
      }
    })
  }

  // -- drag ---------------------------------------------------------------

  private bindDrag(): void {
    const carriesFile = (event: DragEvent): boolean =>
      Array.from(event.dataTransfer?.types ?? []).some(
        (type) => type === 'Files' || type === 'text/uri-list' || type === 'text/plain',
      )

    window.addEventListener('dragenter', (event) => {
      if (!carriesFile(event)) return
      event.preventDefault()
      this.depth++
      this.show()
    })

    window.addEventListener('dragover', (event) => {
      if (!carriesFile(event)) return
      event.preventDefault()
      if (event.dataTransfer) event.dataTransfer.dropEffect = 'copy'
    })

    window.addEventListener('dragleave', (event) => {
      if (!carriesFile(event)) return
      this.depth = Math.max(0, this.depth - 1)
      if (!this.depth) this.hide()
    })

    window.addEventListener('drop', (event) => {
      if (!carriesFile(event)) return
      event.preventDefault()
      this.depth = 0
      this.hide()
      void this.handleDrop(event.dataTransfer)
    })
  }

  private show(): void {
    this.overlay.hidden = false
  }

  private hide(): void {
    this.overlay.hidden = true
    this.overlayText.textContent = 'Drop a USD file'
  }

  private async handleDrop(data: DataTransfer | null): Promise<void> {
    if (!data || this.searching) return

    // 1. An exact path, when the drag source was kind enough to include one.
    const fromUri = pathFromDragText(data)
    if (fromUri) {
      if (!isUsd(fromUri)) {
        this.callbacks.onToast(`${baseName(fromUri)} is not a USD file`, 'error')
        return
      }
      this.callbacks.onOpen(fromUri)
      return
    }

    const file = data.files[0]
    if (!file) return

    if (!isUsd(file.name)) {
      this.callbacks.onToast(`${file.name} is not a USD file`, 'error')
      return
    }

    // 2. Only a name and a size — go and find it.
    await this.search(file.name, file.size)
  }

  private async search(name: string, size: number): Promise<void> {
    const roots = this.callbacks.searchRoots()
    this.searching = true
    this.overlay.hidden = false
    this.overlayText.textContent = `Looking for ${name}…`

    try {
      const result = await locate(name, size, roots)
      const exact = result.matches.filter((m) => m.sizeMatches)
      const candidates = exact.length ? exact : result.matches

      if (candidates.length === 1) {
        this.callbacks.onOpen(candidates[0]!.path)
        return
      }
      if (candidates.length > 1) {
        this.openChooser(name, candidates, result.truncated)
        return
      }

      this.callbacks.onToast(
        `Could not find ${name} on disk — browsers do not reveal a dropped file's path`,
        'error',
      )
      this.callbacks.onBrowse(name)
    } catch {
      this.callbacks.onToast(`Could not search for ${name}`, 'error')
    } finally {
      this.searching = false
      this.hide()
    }
  }

  // -- disambiguation -----------------------------------------------------

  private openChooser(name: string, matches: LocateMatch[], truncated: boolean): void {
    this.chooserTitle.textContent = name
    this.chooserNote.textContent =
      `${matches.length} files with this name were found` +
      (truncated ? ', and the search was cut short' : '')

    clear(this.chooserList)
    for (const match of matches.slice(0, 30)) {
      const row = el('button', 'match')
      const glyph = icon(ICONS.file)
      glyph.setAttribute('class', 'match__icon')
      row.appendChild(glyph)

      // Show the path in full and let it wrap. These rows exist to tell two
      // near-identical paths apart, and any truncation hides the one segment
      // that actually differs.
      const main = el('div', 'match__main')
      main.appendChild(el('div', 'match__dir', match.dir))

      const meta = el('div', 'match__meta')
      meta.appendChild(
        el('span', undefined, `${formatBytes(match.size)} · ${formatDate(match.mtime)}`),
      )
      if (match.sizeMatches) {
        meta.appendChild(el('span', 'match__badge', 'same size'))
      }
      main.appendChild(meta)
      row.appendChild(main)

      row.addEventListener('click', () => {
        this.closeChooser()
        this.callbacks.onOpen(match.path)
      })
      this.chooserList.appendChild(row)
    }

    this.chooser.hidden = false
  }

  private closeChooser(): void {
    this.chooser.hidden = true
    clear(this.chooserList)
  }

  // -- paste --------------------------------------------------------------

  /** Pasting a path works everywhere a drop might not, so support both. */
  private bindPaste(): void {
    window.addEventListener('paste', (event) => {
      const target = event.target
      if (target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement) {
        return
      }
      const text = event.clipboardData?.getData('text/plain')?.trim()
      if (!text) return
      const path = normalisePath(text.replace(/^["']|["']$/g, ''))
      if (!isUsd(path)) return
      event.preventDefault()
      this.callbacks.onOpen(path)
    })
  }
}

// ---------------------------------------------------------------------------

function isUsd(path: string): boolean {
  const lower = path.toLowerCase()
  return USD_EXTENSIONS.some((ext) => lower.endsWith(ext))
}

function baseName(path: string): string {
  return path.split(/[\\/]/).pop() ?? path
}

/** Pull a filesystem path out of a drag's text payloads, if there is one. */
function pathFromDragText(data: DataTransfer): string | null {
  for (const type of ['text/uri-list', 'text/plain']) {
    const raw = data.getData(type)
    if (!raw) continue
    for (const line of raw.split(/\r?\n/)) {
      const text = line.trim()
      if (!text || text.startsWith('#')) continue
      const path = normalisePath(text)
      if (isUsd(path)) return path
    }
  }
  return null
}

/** Turn a `file://` URI into an OS path, and leave plain paths alone. */
function normalisePath(text: string): string {
  if (!/^file:\/\//i.test(text)) return text
  try {
    const url = new URL(text)
    let path = decodeURIComponent(url.pathname)
    // `file:///C:/x` decodes to `/C:/x` on Windows.
    if (/^\/[A-Za-z]:/.test(path)) path = path.slice(1)
    if (url.hostname) path = `\\\\${url.hostname}${path.replace(/\//g, '\\')}`
    return path.includes(':') ? path.replace(/\//g, '\\') : path
  } catch {
    return text
  }
}
