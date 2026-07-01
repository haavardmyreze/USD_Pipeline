import { estimateNumCtxFromMessages } from './contextBudget'

const DEFAULT_BASE_URL = 'http://127.0.0.1:11434'

export type OllamaConfig = {
  baseUrl: string
  model: string
}

export type ChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

function normalizeBaseUrl(url: string) {
  return url.replace(/\/+$/, '')
}

export function loadOllamaConfig(): OllamaConfig {
  try {
    const baseUrl = localStorage.getItem('mdv-ollama-url') ?? DEFAULT_BASE_URL
    const model = localStorage.getItem('mdv-ollama-model') ?? ''
    return { baseUrl: normalizeBaseUrl(baseUrl), model }
  } catch {
    return { baseUrl: DEFAULT_BASE_URL, model: '' }
  }
}

export function saveOllamaConfig(config: OllamaConfig) {
  try {
    localStorage.setItem('mdv-ollama-url', normalizeBaseUrl(config.baseUrl))
    localStorage.setItem('mdv-ollama-model', config.model)
  } catch {
    // ignore persistence errors
  }
}

export async function listOllamaModels(baseUrl: string) {
  const response = await fetch(`${normalizeBaseUrl(baseUrl)}/api/tags`, {
    method: 'GET',
  })

  if (!response.ok) {
    throw new Error(`Ollama returned ${response.status}`)
  }

  const data = (await response.json()) as {
    models?: { name: string }[]
  }

  return (data.models ?? []).map((entry) => entry.name).sort()
}

/** Match `llama3.2` to `llama3.2:latest`, etc. Falls back to first installed model. */
export function resolveOllamaModel(requested: string, available: string[]) {
  if (available.length === 0) {
    return ''
  }

  const trimmed = requested.trim()
  if (!trimmed) {
    return available[0]
  }

  if (available.includes(trimmed)) {
    return trimmed
  }

  const requestedBase = trimmed.split(':')[0]
  const partial = available.find((name) => {
    const base = name.split(':')[0]
    return (
      name === trimmed ||
      name.startsWith(`${trimmed}:`) ||
      base === requestedBase ||
      name.startsWith(`${requestedBase}:`)
    )
  })

  return partial ?? available[0]
}

function parseOllamaErrorBody(text: string) {
  const trimmed = text.trim()
  if (!trimmed) {
    return ''
  }

  try {
    const data = JSON.parse(trimmed) as { error?: string }
    if (data.error) {
      if (/model.*not found/i.test(data.error)) {
        return (
          'That model is not installed. Run `ollama list` to see available models, ' +
          'pull one with `ollama pull <name>`, then pick it under Ollama connection.'
        )
      }
      return data.error
    }
  } catch {
    // not JSON
  }

  return trimmed
}

export async function checkOllamaConnection(baseUrl: string) {
  const models = await listOllamaModels(baseUrl)
  return { ok: true as const, models }
}

const KEEP_ALIVE = '15m'
const DEFAULT_NUM_PREDICT = 480

type StreamHandlers = {
  onToken: (token: string) => void
  signal?: AbortSignal
}

/** Load the model into memory so the first real answer is faster. */
export async function warmOllamaModel(config: OllamaConfig, signal?: AbortSignal) {
  if (!config.model) {
    return
  }

  await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages: [{ role: 'user', content: 'OK' }],
      stream: false,
      keep_alive: KEEP_ALIVE,
      options: { num_predict: 1, temperature: 0 },
    }),
    signal,
  })
}

export async function streamOllamaChat(
  config: OllamaConfig,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  handlers: StreamHandlers,
) {
  const response = await fetch(`${config.baseUrl}/api/chat`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      keep_alive: KEEP_ALIVE,
      options: {
        num_predict: DEFAULT_NUM_PREDICT,
        num_ctx: estimateNumCtxFromMessages(messages),
        temperature: 0.2,
      },
    }),
    signal: handlers.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(parseOllamaErrorBody(text) || `Ollama returned ${response.status}`)
  }

  if (!response.body) {
    throw new Error('Ollama returned an empty response')
  }

  const reader = response.body.getReader()
  const decoder = new TextDecoder()
  let buffer = ''

  while (true) {
    const { done, value } = await reader.read()
    if (done) {
      break
    }

    buffer += decoder.decode(value, { stream: true })
    const lines = buffer.split('\n')
    buffer = lines.pop() ?? ''

    for (const line of lines) {
      if (!line.trim()) {
        continue
      }

      const data = JSON.parse(line) as {
        message?: { content?: string }
        done?: boolean
      }

      if (data.message?.content) {
        handlers.onToken(data.message.content)
      }

      if (data.done) {
        return
      }
    }
  }
}

export function ollamaErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request cancelled.'
  }

  if (error instanceof TypeError) {
    return (
      'Could not reach Ollama. Make sure it is running (ollama serve) and that ' +
      'browser access is allowed. Set OLLAMA_ORIGINS=* if needed.'
    )
  }

  if (error instanceof Error) {
    return parseOllamaErrorBody(error.message) || error.message
  }

  return 'Something went wrong talking to Ollama.'
}
