/**
 * The conversation with the assistant: one streaming tool-use loop per
 * question, run from the browser with the user's own API key.
 *
 * The model has a single tool, draw_diagram, which replaces the editor's
 * outline. The app draws it and hands back anything it could not read, so the
 * model can correct itself before it answers. While an outline is being
 * written, its partial text is passed to the preview, which builds as it
 * streams.
 */

import Anthropic from '@anthropic-ai/sdk'
import type { Problem } from '../parse'
import type { Mode } from '../render'
import { DRAW_TOOL, MODEL, SYSTEM } from './prompt'

export interface DrawInput {
  mode: Mode
  name: string
  outline: string
}

/** What the conversation needs from the app. */
export interface AssistantHost {
  current(): DrawInput
  /** Put the outline in the editor and return what could not be read. */
  apply(input: DrawInput): Problem[]
  /** Show a partly written outline in the preview only. */
  preview(input: Partial<DrawInput>): void
  endPreview(): void
}

export type ChatItem =
  | { kind: 'user'; text: string }
  | { kind: 'assistant'; text: string }
  | { kind: 'drawn'; name: string; mode: Mode; lines: number; problems: Problem[] }
  | { kind: 'notice'; text: string; error?: boolean }

/** How many model turns one question may take, drawing and correcting. */
const MAX_ROUNDS = 5
const MAX_JSON_RETRIES = 2

export class Assistant {
  readonly items: ChatItem[] = []
  private messages: Anthropic.MessageParam[] = []
  private client: Anthropic | null = null
  private stream: ReturnType<Anthropic['messages']['stream']> | null = null
  private stopped = false
  busy = false
  /** Set when the API turned the key down, so the panel can ask for another. */
  keyRejected = false

  constructor(
    private readonly host: AssistantHost,
    private readonly changed: () => void,
  ) {}

  setKey(key: string | null): void {
    // The key goes only to api.anthropic.com. Browser access has to be
    // allowed explicitly: the key is the user's own, typed into their own
    // browser, not a secret shipped with the page.
    this.client = key ? new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true }) : null
  }

  get ready(): boolean {
    return this.client !== null
  }

  /** Forget the conversation. The diagram stays as it is. */
  reset(): void {
    this.stop()
    this.messages = []
    this.items.length = 0
    this.changed()
  }

  stop(): void {
    if (!this.stream) return
    this.stopped = true
    this.stream.abort()
  }

  async send(text: string): Promise<void> {
    const client = this.client
    if (!client || this.busy || !text.trim()) return
    this.busy = true
    this.stopped = false
    this.items.push({ kind: 'user', text })
    this.changed()

    const before = this.messages.length
    this.messages.push({ role: 'user', content: [{ type: 'text', text: withDiagram(this.host.current(), text) }] })

    try {
      await this.run(client)
    } catch (error) {
      if (error instanceof Anthropic.AuthenticationError) this.keyRejected = true
      this.notice(describe(error), true)
      // A question that never got an answer leaves the conversation as it
      // was, so it can simply be asked again.
      if (this.messages.length === before + 1) this.messages.length = before
    } finally {
      this.stream = null
      this.busy = false
      this.host.endPreview()
      this.changed()
    }
  }

  private async run(client: Anthropic): Promise<void> {
    let jsonRetries = 0
    for (let round = 0; round < MAX_ROUNDS; round++) {
      let reply: Extract<ChatItem, { kind: 'assistant' }> | null = null
      const stream = client.messages.stream({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM,
        tools: [DRAW_TOOL],
        messages: this.messages,
        // Caches the conversation so far; the system prompt has its own
        // breakpoint, so the guide stays cached whatever is asked.
        cache_control: { type: 'ephemeral' },
      })
      this.stream = stream

      stream.on('text', (delta) => {
        if (!reply) {
          reply = { kind: 'assistant', text: '' }
          this.items.push(reply)
        }
        reply.text += delta
        this.changed()
      })
      stream.on('inputJson', (_delta, snapshot) => {
        if (snapshot && typeof snapshot === 'object') this.host.preview(snapshot as Partial<DrawInput>)
      })

      let message: Anthropic.Message
      try {
        message = await stream.finalMessage()
        jsonRetries = 0
      } catch (error) {
        if (this.stopped || error instanceof Anthropic.APIUserAbortError) {
          this.notice('Stopped.')
          return
        }
        // Only a tool input the SDK could not parse at all is worth another
        // try; API errors (auth, rate limits, outages) go to the user.
        if (error instanceof Anthropic.APIError || jsonRetries++ >= MAX_JSON_RETRIES) throw error
        continue
      }

      if (message.stop_reason === 'refusal') {
        this.notice('The model declined this request.', true)
        return
      }

      this.messages.push({ role: 'assistant', content: message.content })
      const calls = message.content.filter((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use')
      if (!calls.length) return

      // An outline cut off at the output limit parses as a shorter, valid
      // outline, so it must not be drawn.
      const truncated = message.stop_reason === 'max_tokens'
      const results: Anthropic.ToolResultBlockParam[] = calls.map((call) => this.runTool(call, truncated))
      this.messages.push({ role: 'user', content: results })
      this.changed()
      if (truncated) {
        this.notice('The outline was too long to finish in one reply. Ask for a smaller diagram.', true)
        return
      }
    }
    this.notice('Stopped after several attempts to draw the diagram. Check the problems listed under the editor.', true)
  }

  private runTool(call: Anthropic.ToolUseBlock, truncated: boolean): Anthropic.ToolResultBlockParam {
    const fail = (content: string): Anthropic.ToolResultBlockParam => ({
      type: 'tool_result',
      tool_use_id: call.id,
      is_error: true,
      content,
    })
    if (call.name !== DRAW_TOOL.name) return fail(`Unknown tool ${call.name}`)
    if (truncated) return fail('The outline was cut off at the output limit and was not drawn.')

    const input = validate(call.input)
    if (!input) return fail(JSON.stringify({ INVALID_JSON: JSON.stringify(call.input) }))

    const problems = this.host.apply(input)
    const lines = input.outline.split('\n').filter((line) => line.trim() && !line.trim().startsWith('#')).length
    this.items.push({ kind: 'drawn', name: input.name, mode: input.mode, lines, problems })

    if (!problems.length) {
      return { type: 'tool_result', tool_use_id: call.id, content: `Drawn: "${input.name}", ${lines} lines, no problems.` }
    }
    const list = problems.map((p) => `line ${p.line + 1}: ${p.message}`).join('\n')
    return {
      type: 'tool_result',
      tool_use_id: call.id,
      content: `Drawn, but these lines could not be read:\n${list}\nFix them and call draw_diagram again with the whole outline.`,
    }
  }

  private notice(text: string, error = false): void {
    this.items.push({ kind: 'notice', text, error })
    this.changed()
  }
}

/** The user's words, after the diagram they are looking at. */
function withDiagram(diagram: DrawInput, text: string): string {
  const body = diagram.outline.trim() ? diagram.outline : '(empty)'
  return `<current_diagram mode="${diagram.mode}" name="${escapeAttr(diagram.name)}">\n${body}\n</current_diagram>\n\n${text}`
}

function escapeAttr(text: string): string {
  return text.replace(/&/g, '&amp;').replace(/"/g, '&quot;')
}

/**
 * The tool input, checked by hand: with eager input streaming the API does
 * not validate it, and a malformed input can arrive silently shortened.
 */
function validate(input: unknown): DrawInput | null {
  if (!input || typeof input !== 'object') return null
  const { mode, name, outline } = input as Record<string, unknown>
  if (mode !== 'tree' && mode !== 'graph') return null
  if (typeof name !== 'string' || typeof outline !== 'string') return null
  return { mode, name: name.trim() || 'Untitled', outline }
}

function describe(error: unknown): string {
  if (error instanceof Anthropic.AuthenticationError) return 'The API key was not accepted. Check it and enter it again.'
  if (error instanceof Anthropic.PermissionDeniedError) return 'This API key is not allowed to use the model.'
  if (error instanceof Anthropic.RateLimitError) return 'Rate limited by the API. Wait a moment and try again.'
  if (error instanceof Anthropic.BadRequestError) return `The API rejected the request: ${error.message}`
  if (error instanceof Anthropic.APIConnectionError) return 'Could not reach the Anthropic API. Check the network connection.'
  if (error instanceof Anthropic.InternalServerError) return 'The API is having trouble right now. Try again shortly.'
  if (error instanceof Anthropic.APIError) return `API error ${error.status ?? ''}: ${error.message}`
  return error instanceof Error ? error.message : 'Something went wrong.'
}
