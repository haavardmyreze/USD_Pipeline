/**
 * The assistant's column: the conversation, the question box, and the
 * API key.
 *
 * The key is kept for this browser tab only, unless the user asks to have it
 * remembered on this computer. It is sent nowhere but the Anthropic API.
 */

import { Assistant, type AssistantHost, type ChatItem } from './chat'
import { MODEL_LABEL } from './prompt'

const KEY = 'usd-treediagram:api-key'

const SUGGESTIONS = [
  'Flowchart of char-robot: its model, rig and lookdev blocks and the assembly',
  'Tree of a shot scene graph with two characters, a prop, a camera and lights',
  'Flowchart of kilo-0010 with its blocks, the set and the assets it references',
  'Where does a shot’s 3d render output go, and what is the file called?',
]

export interface PanelElements {
  root: HTMLElement
  log: HTMLElement
  form: HTMLFormElement
  input: HTMLTextAreaElement
  send: HTMLButtonElement
  keyForm: HTMLFormElement
  keyInput: HTMLInputElement
  keyRemember: HTMLInputElement
  keyButton: HTMLButtonElement
  resetButton: HTMLButtonElement
  model: HTMLElement
}

export class AssistantPanel {
  private readonly assistant: Assistant
  private editingKey = false

  constructor(
    private readonly ui: PanelElements,
    host: AssistantHost,
  ) {
    this.assistant = new Assistant(host, () => this.render())
    this.assistant.setKey(loadKey())
    ui.model.textContent = MODEL_LABEL

    ui.form.addEventListener('submit', (event) => {
      event.preventDefault()
      if (this.assistant.busy) this.assistant.stop()
      else this.ask(ui.input.value)
    })
    ui.input.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey && !event.isComposing) {
        event.preventDefault()
        ui.form.requestSubmit()
      }
    })
    ui.input.addEventListener('input', () => this.fitInput())

    ui.keyForm.addEventListener('submit', (event) => {
      event.preventDefault()
      const key = ui.keyInput.value.trim()
      if (!key) return
      saveKey(key, ui.keyRemember.checked)
      this.assistant.setKey(key)
      ui.keyInput.value = ''
      this.editingKey = false
      this.render()
      ui.input.focus()
    })
    ui.keyButton.addEventListener('click', () => {
      this.editingKey = !this.editingKey || !this.assistant.ready
      this.render()
      if (this.editingKey) ui.keyInput.focus()
    })
    ui.keyForm.querySelector('.chat__forget')!.addEventListener('click', () => this.forgetKey())
    ui.resetButton.addEventListener('click', () => this.assistant.reset())

    this.render()
  }

  /** Put the question box in reach, for the toggle that opens the column. */
  focus(): void {
    ;(this.assistant.ready ? this.ui.input : this.ui.keyInput).focus()
  }

  private ask(text: string): void {
    if (!text.trim() || !this.assistant.ready) return
    this.ui.input.value = ''
    this.fitInput()
    void this.assistant.send(text.trim()).then(() => this.ui.input.focus())
  }

  private fitInput(): void {
    const input = this.ui.input
    input.style.height = 'auto'
    input.style.height = `${Math.min(input.scrollHeight, 180)}px`
  }

  private render(): void {
    const { ui, assistant } = this
    if (assistant.keyRejected) {
      assistant.keyRejected = false
      this.editingKey = true
    }
    const needsKey = !assistant.ready || this.editingKey
    ui.keyForm.hidden = !needsKey
    ui.form.hidden = needsKey && !assistant.ready
    ui.keyButton.textContent = assistant.ready ? 'Key' : 'Add key'
    ui.keyButton.title = assistant.ready ? 'Change or forget the API key' : 'Enter an Anthropic API key'
    ui.resetButton.disabled = !assistant.items.length
    ui.send.textContent = assistant.busy ? 'Stop' : 'Send'
    ui.send.classList.toggle('is-stop', assistant.busy)
    ui.input.disabled = !assistant.ready
    ui.keyForm.querySelector<HTMLButtonElement>('.chat__forget')!.hidden = !assistant.ready

    const stick = ui.log.scrollHeight - ui.log.scrollTop - ui.log.clientHeight < 40
    ui.log.replaceChildren(...(assistant.items.length ? assistant.items.map(renderItem) : [this.emptyState()]))
    if (assistant.busy) ui.log.appendChild(el('div', 'chat__working', 'Working…'))
    if (stick || assistant.busy) ui.log.scrollTop = ui.log.scrollHeight
  }

  private emptyState(): HTMLElement {
    const box = el('div', 'chat__empty')
    box.appendChild(el('p', 'chat__hello', 'Describe a diagram and I will draw it, following the studio’s pipeline guide.'))
    for (const text of SUGGESTIONS) {
      const chip = el('button', 'chat__suggestion', text)
      chip.type = 'button'
      chip.disabled = !this.assistant.ready
      chip.addEventListener('click', () => this.ask(text))
      box.appendChild(chip)
    }
    return box
  }

  private forgetKey(): void {
    saveKey(null, false)
    this.assistant.setKey(null)
    this.editingKey = false
    this.render()
  }
}

function renderItem(item: ChatItem): HTMLElement {
  switch (item.kind) {
    case 'user':
      return el('div', 'msg msg--user', item.text)
    case 'assistant': {
      const node = el('div', 'msg msg--assistant')
      node.innerHTML = formatText(item.text)
      return node
    }
    case 'drawn': {
      const node = el('div', `msg msg--drawn${item.problems.length ? ' has-problems' : ''}`)
      const what = item.mode === 'graph' ? 'Flowchart' : 'Tree'
      node.appendChild(el('span', 'msg__badge', what))
      node.appendChild(el('span', 'msg__title', item.name))
      node.appendChild(
        el(
          'span',
          'msg__meta',
          item.problems.length
            ? `${item.problems.length} line${item.problems.length === 1 ? '' : 's'} to fix`
            : `${item.lines} lines · Ctrl+Z undoes`,
        ),
      )
      return node
    }
    case 'notice':
      return el('div', `msg msg--notice${item.error ? ' is-error' : ''}`, item.text)
  }
}

/** Just enough Markdown for short replies: code, bold, lists, paragraphs. */
function formatText(text: string): string {
  const escaped = text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
  const blocks = escaped.split(/\n{2,}/)
  return blocks
    .map((block) => {
      const inline = (s: string) =>
        s.replace(/`([^`]+)`/g, '<code>$1</code>').replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>')
      const lines = block.split('\n')
      if (lines.every((line) => /^\s*[-*] /.test(line))) {
        return `<ul>${lines.map((line) => `<li>${inline(line.replace(/^\s*[-*] /, ''))}</li>`).join('')}</ul>`
      }
      if (lines.every((line) => /^\s*\d+\. /.test(line))) {
        return `<ol>${lines.map((line) => `<li>${inline(line.replace(/^\s*\d+\. /, ''))}</li>`).join('')}</ol>`
      }
      return `<p>${inline(block).replace(/\n/g, '<br>')}</p>`
    })
    .join('')
}

function el<K extends keyof HTMLElementTagNameMap>(tag: K, className: string, text?: string): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag)
  node.className = className
  if (text !== undefined) node.textContent = text
  return node
}

function loadKey(): string | null {
  try {
    return sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY)
  } catch {
    return null
  }
}

function saveKey(key: string | null, remember: boolean): void {
  try {
    sessionStorage.removeItem(KEY)
    localStorage.removeItem(KEY)
    if (!key) return
    ;(remember ? localStorage : sessionStorage).setItem(KEY, key)
  } catch {
    // Storage blocked: the key still works until the page is reloaded.
  }
}
