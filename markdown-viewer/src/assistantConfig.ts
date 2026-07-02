import { loadOllamaConfig, saveOllamaConfig, type OllamaConfig } from './ollama'

export type AssistantProvider = 'ollama' | 'claude'

export type ClaudeConfig = {
  apiKey: string
  model: string
}

export type AssistantSettings = {
  provider: AssistantProvider
  ollama: OllamaConfig
  claude: ClaudeConfig
}

const DEFAULT_CLAUDE_MODEL = 'claude-3-5-haiku-20241022'

const LEGACY_CLAUDE_MODEL_MAP: Record<string, string> = {
  'claude-3-5-haiku-latest': 'claude-3-5-haiku-20241022',
  'claude-sonnet-4-20250514': 'claude-3-5-haiku-20241022',
  'claude-3-7-sonnet-latest': 'claude-3-5-haiku-20241022',
  'claude-3-5-sonnet-latest': 'claude-3-5-haiku-20241022',
}

export const CLAUDE_MODELS = [
  { id: 'claude-3-5-haiku-20241022', label: 'Claude 3.5 Haiku' },
] as const

function loadProvider(): AssistantProvider {
  try {
    const stored = localStorage.getItem('mdv-assistant-provider')
    return stored === 'claude' ? 'claude' : 'ollama'
  } catch {
    return 'ollama'
  }
}

function loadClaudeConfig(): ClaudeConfig {
  try {
    const apiKey = localStorage.getItem('mdv-claude-api-key') ?? ''
    const stored = localStorage.getItem('mdv-claude-model') ?? DEFAULT_CLAUDE_MODEL
    const model = LEGACY_CLAUDE_MODEL_MAP[stored] ?? stored
    return { apiKey, model }
  } catch {
    return { apiKey: '', model: DEFAULT_CLAUDE_MODEL }
  }
}

export function loadAssistantSettings(): AssistantSettings {
  return {
    provider: loadProvider(),
    ollama: loadOllamaConfig(),
    claude: loadClaudeConfig(),
  }
}

export function saveAssistantProvider(provider: AssistantProvider) {
  try {
    localStorage.setItem('mdv-assistant-provider', provider)
  } catch {
    // ignore persistence errors
  }
}

export function saveClaudeConfig(config: ClaudeConfig) {
  try {
    const model = LEGACY_CLAUDE_MODEL_MAP[config.model] ?? config.model
    localStorage.setItem('mdv-claude-api-key', config.apiKey.trim())
    localStorage.setItem('mdv-claude-model', model)
  } catch {
    // ignore persistence errors
  }
}

export function persistAssistantSettings(settings: AssistantSettings) {
  saveAssistantProvider(settings.provider)
  saveOllamaConfig(settings.ollama)
  saveClaudeConfig(settings.claude)
}
