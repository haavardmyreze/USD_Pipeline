/** Aligns with Ollama `num_ctx` ceiling and reserved output tokens. */
export const MAX_CONTEXT_TOKENS = 16_384
export const CLAUDE_MAX_CONTEXT_CHARS = 180_000
export const RESERVED_OUTPUT_TOKENS = 736
export const CHARS_PER_TOKEN = 3.5

export const MAX_CONTEXT_CHARS = Math.floor(
  (MAX_CONTEXT_TOKENS - RESERVED_OUTPUT_TOKENS) * CHARS_PER_TOKEN,
)

export function getMaxContextChars(provider: 'ollama' | 'claude' = 'ollama') {
  return provider === 'claude' ? CLAUDE_MAX_CONTEXT_CHARS : MAX_CONTEXT_CHARS
}

const MESSAGE_OVERHEAD_CHARS = 24

export function formatCharCount(chars: number) {
  if (chars < 1000) {
    return `${chars} characters`
  }
  const thousands = chars / 1000
  if (thousands >= 10) {
    return `${Math.round(thousands)}k characters`
  }
  return `${thousands.toFixed(1).replace(/\.0$/, '')}k characters`
}

export function messageChars(content: string) {
  return content.length + MESSAGE_OVERHEAD_CHARS
}

export function totalMessageChars(messages: { content: string }[]) {
  return messages.reduce((sum, message) => sum + messageChars(message.content), 0)
}

export function estimateTokensFromChars(chars: number) {
  return Math.ceil(chars / CHARS_PER_TOKEN)
}

export function estimateNumCtxFromMessages(messages: { content: string }[]) {
  const chars = messages.reduce(
    (sum, message) => sum + messageChars(message.content),
    0,
  )
  const tokens = estimateTokensFromChars(chars)
  const rounded = Math.ceil(tokens / 2048) * 2048
  return Math.min(MAX_CONTEXT_TOKENS, Math.max(4096, rounded))
}

export function fitChatHistoryToBudget<T extends { content: string }>(
  history: T[],
  reservedChars: number,
  maxChars: number = MAX_CONTEXT_CHARS,
) {
  const budget = Math.max(0, maxChars - reservedChars)
  const kept: T[] = []
  let used = 0

  for (let index = history.length - 1; index >= 0; index -= 1) {
    const message = history[index]
    const size = messageChars(message.content)
    if (used + size <= budget) {
      kept.unshift(message)
      used += size
    }
  }

  return {
    messages: kept,
    dropped: history.length - kept.length,
    usedChars: used,
    budgetChars: budget,
  }
}

export function computeContextUsage(
  parts: {
    systemChars: number
    history: { content: string }[]
    draftQuestion: string
  },
  maxChars: number = MAX_CONTEXT_CHARS,
) {
  const systemChars = parts.systemChars + MESSAGE_OVERHEAD_CHARS
  const historyChars = totalMessageChars(parts.history)
  const draft = parts.draftQuestion.trim()
  const questionChars = draft ? messageChars(draft) : 0
  const used = systemChars + historyChars + questionChars
  const percent = Math.min(100, (used / maxChars) * 100)

  return {
    used,
    max: maxChars,
    percent,
    systemChars,
    historyChars,
    questionChars,
    isOverBudget: used > maxChars,
  }
}
