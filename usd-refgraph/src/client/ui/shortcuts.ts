/**
 * The keyboard reference sheet.
 *
 * The shortcuts themselves are bound in `main.ts`; this is the one place that
 * describes them, so the sheet cannot drift out of date without someone
 * editing the list right next to the binding it documents.
 */

import { clear, el, must } from '../util'
import { dismiss, isPresent, present } from './presence'

export interface ShortcutGroup {
  title: string
  items: { keys: string[]; description: string }[]
}

export const SHORTCUTS: ShortcutGroup[] = [
  {
    title: 'Anywhere',
    items: [
      { keys: ['1', '–', '6'], description: 'Jump to a section' },
      { keys: ['O'], description: 'Open a file or project folder' },
      { keys: ['R'], description: 'Rescan from disk' },
      { keys: ['Ctrl', 'V'], description: 'Open the path on the clipboard' },
      { keys: ['?'], description: 'Show this sheet' },
      { keys: ['Esc'], description: 'Close, or clear the selection' },
    ],
  },
  {
    title: 'Graph',
    items: [
      { keys: ['/'], description: 'Focus the filter box' },
      { keys: ['F'], description: 'Fit the graph to the view' },
      { keys: ['+', 'or', '−'], description: 'Zoom in and out' },
    ],
  },
  {
    title: 'Mouse',
    items: [
      { keys: ['Click'], description: 'Open a node’s details' },
      { keys: ['Double-click'], description: 'Re-crawl from that file' },
      { keys: ['Drag'], description: 'Move a node and everything under it' },
      { keys: ['Alt', 'Drag'], description: 'Move just that one card' },
      { keys: ['Wheel'], description: 'Zoom at the cursor' },
      { keys: ['Hover'], description: 'Light up everything it reaches' },
    ],
  },
]

/** Entries that punctuate a key list rather than naming a key. */
const SEPARATORS = new Set(['–', 'or'])

export class ShortcutSheet {
  private readonly modal = must<HTMLElement>('#shortcuts')
  private readonly body = must<HTMLElement>('#shortcuts-body')

  constructor() {
    must<HTMLElement>('#shortcuts-scrim').addEventListener('click', () => this.close())
    must<HTMLElement>('#shortcuts-close').addEventListener('click', () => this.close())
    this.build()
  }

  get isOpen(): boolean {
    return isPresent(this.modal)
  }

  toggle(): void {
    if (this.isOpen) this.close()
    else this.open()
  }

  open(): void {
    present(this.modal)
  }

  close(): void {
    dismiss(this.modal)
  }

  private build(): void {
    clear(this.body)
    for (const group of SHORTCUTS) {
      const section = el('div', 'shortcuts__group')
      section.appendChild(el('h3', 'shortcuts__title', group.title))
      for (const item of group.items) {
        const row = el('div', 'shortcuts__row')
        const keys = el('span', 'shortcuts__keys')
        for (const key of item.keys) {
          // `–` and `or` join two keys; everything else is a key you press,
          // `/` very much included.
          if (SEPARATORS.has(key)) keys.appendChild(el('span', 'shortcuts__sep', key))
          else keys.appendChild(el('kbd', undefined, key))
        }
        row.appendChild(keys)
        row.appendChild(el('span', 'shortcuts__desc', item.description))
        section.appendChild(row)
      }
      this.body.appendChild(section)
    }
  }
}
