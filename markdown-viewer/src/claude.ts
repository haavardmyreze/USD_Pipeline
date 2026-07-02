import type { ClaudeConfig } from './assistantConfig'

const ANTHROPIC_VERSION = '2023-06-01'
const DEFAULT_MAX_TOKENS = 1024

/** Proxied in dev/preview to avoid browser CORS blocks on api.anthropic.com */
export const CLAUDE_API_BASE = '/api/anthropic'
const CLAUDE_DIRECT_API_BASE = 'https://api.anthropic.com'

export type ClaudeChatMessage = {
  role: 'user' | 'assistant'
  content: string
}

type StreamHandlers = {
  onToken: (token: string) => void
  signal?: AbortSignal
}

type SystemContentBlock = {
  type: 'text'
  text: string
  cache_control?: { type: 'ephemeral' }
}

type ClaudeUsage = {
  input_tokens?: number
  output_tokens?: number
  cache_creation_input_tokens?: number
  cache_read_input_tokens?: number
}

function buildCachedSystemPrompt(systemPrompt: string): SystemContentBlock[] {
  return [
    {
      type: 'text',
      text: systemPrompt,
      cache_control: { type: 'ephemeral' },
    },
  ]
}

function logClaudeCacheUsage(usage: ClaudeUsage) {
  if (!import.meta.env.DEV) {
    return
  }

  const { cache_read_input_tokens, cache_creation_input_tokens, input_tokens } = usage
  if (!cache_read_input_tokens && !cache_creation_input_tokens) {
    return
  }

  console.debug('[claude] prompt cache', {
    input_tokens,
    cache_read_input_tokens: cache_read_input_tokens ?? 0,
    cache_creation_input_tokens: cache_creation_input_tokens ?? 0,
  })
}

async function fetchClaudeWithFallback(
  path: '/v1/messages' | '/v1/models',
  options: RequestInit,
) {
  const proxyUrl = `${CLAUDE_API_BASE}${path}`
  const response = await fetch(proxyUrl, options)

  // Vercel static deployments can return NOT_FOUND for /api/anthropic.
  // In that case, retry against Anthropic directly.
  if (response.status === 404) {
    const directUrl = `${CLAUDE_DIRECT_API_BASE}${path}`
    return fetch(directUrl, options)
  }

  return response
}

function parseClaudeErrorBody(text: string, status: number) {
  const trimmed = text.trim()
  if (!trimmed) {
    return `Claude API returned ${status}`
  }

  try {
    const data = JSON.parse(trimmed) as {
      error?: { message?: string; type?: string }
    }
    if (data.error?.message) {
      return data.error.message
    }
  } catch {
    // not JSON
  }

  return trimmed
}

export function claudeErrorMessage(error: unknown) {
  if (error instanceof DOMException && error.name === 'AbortError') {
    return 'Request cancelled.'
  }

  if (error instanceof TypeError) {
    return (
      'Could not reach the Claude API. If you see a CORS error, run the app with ' +
      '`npm run dev` or `npm run preview` so requests can go through the built-in proxy.'
    )
  }

  if (error instanceof Error) {
    if (/invalid x-api-key|authentication/i.test(error.message)) {
      return 'Invalid API key. Check your key at console.anthropic.com and try again.'
    }
    if (/model:\s*claude-/i.test(error.message) || /invalid.*model|model.*not found/i.test(error.message)) {
      return (
        'That Claude model is unavailable for this API key. ' +
        'Confirm this key has access to Claude 3.5 Haiku in Anthropic Console.'
      )
    }
    if (/credit balance|billing/i.test(error.message)) {
      return error.message
    }
    return error.message
  }

  return 'Something went wrong talking to Claude.'
}

export async function listClaudeModels(apiKey: string) {
  const response = await fetchClaudeWithFallback('/v1/models', {
    method: 'GET',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(parseClaudeErrorBody(text, response.status))
  }

  const data = (await response.json()) as {
    data?: Array<{ id?: string }>
  }

  return (data.data ?? [])
    .map((entry) => entry.id ?? '')
    .filter(Boolean)
    .sort()
}

export async function checkClaudeConnection(config: ClaudeConfig) {
  const apiKey = config.apiKey.trim()
  if (!apiKey) {
    throw new Error('Enter your Anthropic API key.')
  }
  const models = await listClaudeModels(apiKey)
  return { ok: true as const, models }
}

export async function streamClaudeChat(
  config: ClaudeConfig,
  systemPrompt: string,
  messages: ClaudeChatMessage[],
  handlers: StreamHandlers,
) {
  const apiKey = config.apiKey.trim()
  if (!apiKey) {
    throw new Error('Enter your Anthropic API key in connection settings.')
  }

  const response = await fetchClaudeWithFallback('/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': ANTHROPIC_VERSION,
      'anthropic-dangerous-direct-browser-access': 'true',
    },
    body: JSON.stringify({
      model: config.model,
      max_tokens: DEFAULT_MAX_TOKENS,
      stream: true,
      system: buildCachedSystemPrompt(systemPrompt),
      messages,
    }),
    signal: handlers.signal,
  })

  if (!response.ok) {
    const text = await response.text().catch(() => '')
    throw new Error(parseClaudeErrorBody(text, response.status))
  }

  if (!response.body) {
    throw new Error('Claude returned an empty response')
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
    const chunks = buffer.split('\n\n')
    buffer = chunks.pop() ?? ''

    for (const chunk of chunks) {
      const lines = chunk.split('\n')
      let eventType = ''
      let dataLine = ''

      for (const line of lines) {
        if (line.startsWith('event:')) {
          eventType = line.slice(6).trim()
        } else if (line.startsWith('data:')) {
          dataLine = line.slice(5).trim()
        }
      }

      if (!dataLine || dataLine === '[DONE]') {
        continue
      }

      try {
        const data = JSON.parse(dataLine) as {
          type?: string
          message?: { usage?: ClaudeUsage }
          usage?: ClaudeUsage
          delta?: { type?: string; text?: string }
        }

        if (eventType === 'message_start' || data.type === 'message_start') {
          logClaudeCacheUsage(data.message?.usage ?? {})
        } else if (eventType === 'message_delta' || data.type === 'message_delta') {
          logClaudeCacheUsage(data.usage ?? {})
        }

        if (
          (eventType === 'content_block_delta' || data.type === 'content_block_delta') &&
          data.delta?.type === 'text_delta' &&
          data.delta.text
        ) {
          handlers.onToken(data.delta.text)
        }
      } catch {
        // ignore malformed SSE chunks
      }
    }
  }
}
