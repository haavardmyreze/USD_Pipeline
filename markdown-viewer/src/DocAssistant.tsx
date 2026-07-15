import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import {
  CLAUDE_MODELS,
  loadAssistantSettings,
  persistAssistantSettings,
  type AssistantProvider,
  type AssistantSettings,
  type ClaudeConfig,
} from './assistantConfig'
import { AssistantMarkdown } from './AssistantMarkdown'
import { checkClaudeConnection, claudeErrorMessage, streamClaudeChat } from './claude'
import { ContextMeter } from './ContextMeter'
import {
  computeContextUsage,
  fitChatHistoryToBudget,
  getMaxContextChars,
  messageChars,
} from './contextBudget'
import {
  buildContextForQuestion,
  buildExcerptSystemPrompt,
  buildFullDocumentSystemPrompt,
  chunkDocument,
  getDocumentContextInfo,
  isOverviewQuestion,
  shouldUseFullDocument,
  type DocumentContextMode,
} from './documentChunks'
import { type SectionRef } from './headings'
import {
  checkOllamaConnection,
  ollamaErrorMessage,
  resolveOllamaModel,
  streamOllamaChat,
  warmOllamaModel,
  type OllamaConfig,
} from './ollama'
import {
  extractReferencedSections,
  formatSectionLinkGuide,
  MAX_ASSISTANT_FOOTER_SECTIONS,
} from './sectionLinks'

type DocAssistantProps = {
  open: boolean
  onClose: () => void
  markdown: string
  fileName: string
  sections: SectionRef[]
  onNavigateToSection: (id: string) => void
  /** Text to place in the input (e.g. a quoted selection), once per tick. */
  prefill?: { text: string; tick: number } | null
}

type AssistantMessage = {
  role: 'user' | 'assistant'
  content: string
  relatedSections?: SectionRef[]
}

type SessionContext = {
  docKey: string
  mode: DocumentContextMode
  systemPrompt: string
}

function mergeSectionRefs(...lists: SectionRef[][]) {
  const seen = new Set<string>()
  const merged: SectionRef[] = []

  for (const list of lists) {
    for (const section of list) {
      if (seen.has(section.id)) {
        continue
      }
      seen.add(section.id)
      merged.push(section)
    }
  }

  return merged
}

function providerErrorMessage(provider: AssistantProvider, error: unknown) {
  return provider === 'claude' ? claudeErrorMessage(error) : ollamaErrorMessage(error)
}

function isHaikuModelId(modelId: string) {
  return /haiku/i.test(modelId)
}

function resolveClaudeModel(current: string, available: string[]) {
  const haikuDefault = CLAUDE_MODELS[0].id
  if (available.length === 0) {
    return haikuDefault
  }
  if (available.includes(current)) {
    return current
  }
  for (const known of CLAUDE_MODELS) {
    if (available.includes(known.id)) {
      return known.id
    }
  }
  const haikuFromAccount = available.find((modelId) => isHaikuModelId(modelId))
  if (haikuFromAccount) {
    return haikuFromAccount
  }

  return available.includes(haikuDefault) ? haikuDefault : available[0]
}

function DocAssistant({
  open,
  onClose,
  markdown,
  fileName,
  sections,
  onNavigateToSection,
  prefill,
}: DocAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const lastPrefillTickRef = useRef(0)
  const [loading, setLoading] = useState(false)
  const [warming, setWarming] = useState(false)
  const [error, setError] = useState('')
  const [settings, setSettings] = useState<AssistantSettings>(() => loadAssistantSettings())
  const [ollamaModels, setOllamaModels] = useState<string[]>([])
  const [claudeModels, setClaudeModels] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<
    'idle' | 'checking' | 'ok' | 'error'
  >('idle')
  const [showSetup, setShowSetup] = useState(false)

  const provider = settings.provider
  const contextMaxChars = getMaxContextChars(provider)

  const chunks = useMemo(() => chunkDocument(markdown), [markdown])
  const docKey = `${fileName}:${markdown.length}`
  const useFullDocument = useMemo(() => shouldUseFullDocument(markdown), [markdown])
  const contextInfo = useMemo(() => getDocumentContextInfo(markdown), [markdown])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)

  // Selection-menu "Ask": drop the quoted passage into the input.
  useEffect(() => {
    if (!open || !prefill || prefill.tick === lastPrefillTickRef.current) {
      return
    }
    lastPrefillTickRef.current = prefill.tick
    setInput(prefill.text)
  }, [open, prefill])
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const warmAbortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<SessionContext | null>(null)

  const activeOllamaModel = resolveOllamaModel(settings.ollama.model, ollamaModels)
  const ollamaReady =
    connectionState === 'ok' &&
    ollamaModels.length > 0 &&
    Boolean(activeOllamaModel)
  const activeClaudeModel = resolveClaudeModel(settings.claude.model, claudeModels)
  const claudeReady = connectionState === 'ok' && Boolean(settings.claude.apiKey.trim())
  const assistantReady = provider === 'ollama' ? ollamaReady : claudeReady

  useEffect(() => {
    setMessages([])
    setError('')
    setInput('')
    sessionRef.current = null
  }, [markdown, fileName])

  useEffect(() => {
    if (!open) {
      abortRef.current?.abort()
      warmAbortRef.current?.abort()
      setLoading(false)
      setWarming(false)
      return
    }

    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [open, messages, loading])

  useEffect(() => {
    if (!open) {
      return
    }

    const panel = panelRef.current
    const messagesEl = messagesRef.current
    if (!panel || !messagesEl) {
      return
    }

    const onWheel = (event: WheelEvent) => {
      const target = event.target as HTMLElement | null
      const field = target?.closest('textarea, input, select') as HTMLElement | null

      if (field && field.scrollHeight > field.clientHeight) {
        const atTop = field.scrollTop <= 0
        const atBottom = field.scrollTop + field.clientHeight >= field.scrollHeight - 1
        const scrollingUp = event.deltaY < 0
        const scrollingDown = event.deltaY > 0

        if ((scrollingUp && !atTop) || (scrollingDown && !atBottom)) {
          return
        }
      }

      event.preventDefault()
      event.stopPropagation()
      messagesEl.scrollTop += event.deltaY
    }

    panel.addEventListener('wheel', onWheel, { passive: false })
    return () => panel.removeEventListener('wheel', onWheel)
  }, [open])

  useEffect(() => {
    if (!open) {
      return
    }

    const needsSetup =
      connectionState === 'error' ||
      (provider === 'ollama' && connectionState === 'ok' && ollamaModels.length === 0) ||
      (provider === 'claude' && !settings.claude.apiKey.trim())

    if (needsSetup) {
      setShowSetup(true)
    }
  }, [open, connectionState, ollamaModels.length, provider, settings.claude.apiKey])

  useEffect(() => {
    if (!open) {
      return
    }

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [open, onClose])

  const persistSettings = (next: AssistantSettings) => {
    setSettings(next)
    persistAssistantSettings(next)
  }

  const updateProvider = (nextProvider: AssistantProvider) => {
    persistSettings({ ...settings, provider: nextProvider })
    setConnectionState('idle')
    setError('')
  }

  const updateOllama = (ollama: OllamaConfig) => {
    persistSettings({ ...settings, ollama })
  }

  const updateClaude = (claude: ClaudeConfig) => {
    persistSettings({ ...settings, claude })
  }

  const testConnection = useCallback(async () => {
    setConnectionState('checking')
    setError('')

    try {
      if (provider === 'claude') {
        const result = await checkClaudeConnection(settings.claude)
        const supportedModels = result.models.filter((id) => isHaikuModelId(id))
        if (supportedModels.length === 0) {
          setConnectionState('error')
          setClaudeModels([])
          setError(
            'No Haiku model is exposed for this API key/account. Check Anthropic Console model access for Haiku.',
          )
          return
        }
        setClaudeModels(supportedModels)
        const resolved = resolveClaudeModel(settings.claude.model, supportedModels)
        if (resolved !== settings.claude.model) {
          const next = { ...settings, claude: { ...settings.claude, model: resolved } }
          persistSettings(next)
        }
        setOllamaModels([])
        setConnectionState('ok')
        return
      }

      const result = await checkOllamaConnection(settings.ollama.baseUrl)
      setOllamaModels(result.models)
      setConnectionState('ok')

      if (result.models.length === 0) {
        setError(
          'Ollama is running but no models are installed. Run `ollama pull llama3.2` (or another model).',
        )
        return
      }

      setSettings((current) => {
        const resolved = resolveOllamaModel(current.ollama.model, result.models)
        if (!resolved || resolved === current.ollama.model) {
          return current
        }
        const next = {
          ...current,
          ollama: { ...current.ollama, model: resolved },
        }
        persistAssistantSettings(next)
        return next
      })

      const resolved = resolveOllamaModel(settings.ollama.model, result.models)
      if (resolved) {
        warmAbortRef.current?.abort()
        const warmController = new AbortController()
        warmAbortRef.current = warmController
        setWarming(true)
        void warmOllamaModel(
          { baseUrl: settings.ollama.baseUrl, model: resolved },
          warmController.signal,
        )
          .catch(() => {
            // warm-up is best-effort
          })
          .finally(() => {
            if (!warmController.signal.aborted) {
              setWarming(false)
            }
          })
      }
    } catch (connectionError) {
      setConnectionState('error')
      setError(providerErrorMessage(provider, connectionError))
    }
  }, [provider, settings, settings.claude, settings.ollama.baseUrl, settings.ollama.model])

  useEffect(() => {
    if (!open) {
      return
    }
    void testConnection()
  }, [open, testConnection])

  const resolveSystemPrompt = (question: string) => {
    const linkGuide = formatSectionLinkGuide(sections)
    const existing = sessionRef.current
    if (existing && existing.docKey === docKey && existing.mode === 'full') {
      return {
        systemPrompt: existing.systemPrompt,
        mode: existing.mode,
        relatedSections: [] as SectionRef[],
      }
    }

    const forceFullDocument = provider === 'claude'
    if (forceFullDocument || useFullDocument) {
      const systemPrompt = buildFullDocumentSystemPrompt(fileName, markdown, linkGuide)
      sessionRef.current = { docKey, mode: 'full', systemPrompt }
      return {
        systemPrompt,
        mode: 'full' as const,
        relatedSections: [] as SectionRef[],
      }
    }

    const { contextBlock, relatedSections } = buildContextForQuestion(chunks, question)
    const systemPrompt = buildExcerptSystemPrompt(
      fileName,
      contextBlock,
      isOverviewQuestion(question),
      linkGuide,
    )
    return { systemPrompt, mode: 'excerpts' as const, relatedSections }
  }

  const estimateSystemPromptChars = useCallback(
    (question: string) => {
      const session = sessionRef.current
      if (session && session.docKey === docKey && session.mode === 'full') {
        return session.systemPrompt.length
      }

      const forceFullDocument = provider === 'claude'
      if (forceFullDocument || useFullDocument) {
        return buildFullDocumentSystemPrompt(
          fileName,
          markdown,
          formatSectionLinkGuide(sections),
        ).length
      }

      const sampleQuestion = question.trim() || 'overview'
      const { contextBlock } = buildContextForQuestion(chunks, sampleQuestion)
      return buildExcerptSystemPrompt(
        fileName,
        contextBlock,
        isOverviewQuestion(sampleQuestion),
        formatSectionLinkGuide(sections),
      ).length
    },
    [chunks, docKey, fileName, markdown, provider, sections, useFullDocument],
  )

  const contextUsage = useMemo(() => {
    const history = messages.filter((message) => message.content.trim())
    return computeContextUsage(
      {
        systemChars: estimateSystemPromptChars(input),
        history,
        draftQuestion: input,
      },
      contextMaxChars,
    )
  }, [contextMaxChars, estimateSystemPromptChars, input, messages])

  const appendAssistantToken = (assistantText: string) => {
    setMessages((current) => {
      const next = [...current]
      const last = next[next.length - 1]
      next[next.length - 1] = {
        ...last,
        role: 'assistant',
        content: assistantText,
      }
      return next
    })
  }

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const question = input.trim()
    if (!question || loading) {
      return
    }

    if (provider === 'ollama') {
      if (ollamaModels.length === 0) {
        setError('No Ollama model available. Pull a model and test the connection first.')
        setShowSetup(true)
        return
      }
    } else if (!settings.claude.apiKey.trim()) {
      setError('Enter your Anthropic API key in connection settings.')
      setShowSetup(true)
      return
    }
    let activeClaude = settings.claude
    if (provider === 'claude') {
      const resolved = resolveClaudeModel(settings.claude.model, claudeModels)
      if (resolved !== settings.claude.model) {
        activeClaude = { ...settings.claude, model: resolved }
        persistSettings({ ...settings, claude: activeClaude })
      } else {
        activeClaude = { ...settings.claude, model: resolved }
      }
    }


    let activeOllama = settings.ollama
    if (provider === 'ollama') {
      const resolved = resolveOllamaModel(settings.ollama.model, ollamaModels)
      if (!resolved) {
        setError('Pick an installed model under connection settings.')
        setShowSetup(true)
        return
      }
      if (resolved !== settings.ollama.model) {
        activeOllama = { ...settings.ollama, model: resolved }
        persistSettings({ ...settings, ollama: activeOllama })
      } else {
        activeOllama = { ...settings.ollama, model: resolved }
      }
    }

    const { systemPrompt, relatedSections: contextSections } =
      resolveSystemPrompt(question)

    const requestUsage = computeContextUsage(
      {
        systemChars: systemPrompt.length,
        history: messages.filter((message) => message.content.trim()),
        draftQuestion: question,
      },
      contextMaxChars,
    )
    if (requestUsage.isOverBudget) {
      setError(
        'This question would exceed the context window. Shorten your message or start fresh on a smaller topic.',
      )
      return
    }

    setInput('')
    setError('')
    setLoading(true)

    const userMessage: AssistantMessage = { role: 'user', content: question }
    setMessages((current) => [...current, userMessage])

    const controller = new AbortController()
    abortRef.current = controller

    let assistantText = ''
    setMessages((current) => [
      ...current,
      { role: 'assistant', content: '', relatedSections: contextSections },
    ])

    const reservedChars = messageChars(systemPrompt) + messageChars(question)
    const { messages: priorMessages } = fitChatHistoryToBudget(
      messages.filter((message) => message.content.trim()),
      reservedChars,
      contextMaxChars,
    )

    const chatHistory = priorMessages.map((message) => ({
      role: message.role,
      content: message.content,
    }))

    try {
      if (provider === 'claude') {
        await streamClaudeChat(
          activeClaude,
          systemPrompt,
          [...chatHistory, { role: 'user', content: question }],
          {
            signal: controller.signal,
            onToken: (token) => {
              assistantText += token
              appendAssistantToken(assistantText)
            },
          },
        )
      } else {
        await streamOllamaChat(
          activeOllama,
          [
            { role: 'system', content: systemPrompt },
            ...chatHistory,
            { role: 'user', content: question },
          ],
          {
            signal: controller.signal,
            onToken: (token) => {
              assistantText += token
              appendAssistantToken(assistantText)
            },
          },
        )
      }

      const relatedSections = mergeSectionRefs(
        extractReferencedSections(assistantText, sections),
        contextSections,
      ).slice(0, MAX_ASSISTANT_FOOTER_SECTIONS)

      setMessages((current) => {
        const next = [...current]
        const last = next[next.length - 1]
        if (last?.role === 'assistant') {
          next[next.length - 1] = {
            ...last,
            relatedSections,
          }
        }
        return next
      })
    } catch (sendError) {
      setMessages((current) => {
        if (
          current.length > 0 &&
          current[current.length - 1].role === 'assistant' &&
          !current[current.length - 1].content
        ) {
          return current.slice(0, -1)
        }
        return current
      })
      setError(providerErrorMessage(provider, sendError))
    } finally {
      setLoading(false)
      abortRef.current = null
    }
  }

  if (!open) {
    return null
  }

  const connectionLabel =
    connectionState === 'checking'
      ? 'Checking connection…'
      : connectionState === 'ok'
        ? provider === 'claude'
          ? `Connected · ${activeClaudeModel}`
          : activeOllamaModel
            ? `Connected · ${activeOllamaModel}`
            : ollamaModels.length === 0
              ? 'Connected — no models installed'
              : 'Connected'
        : connectionState === 'error'
          ? 'Not connected'
          : 'Connection not checked'

  const checkingLabel =
    provider === 'claude' ? 'Checking Claude connection…' : 'Checking Ollama connection…'

  const setupPlaceholder =
    provider === 'claude'
      ? 'Add your API key above to start asking questions…'
      : 'Connect Ollama above to start asking questions…'

  return (
    <aside
      ref={panelRef}
      className="assistant-panel"
      role="dialog"
      aria-label="Document assistant"
    >
      <header className="assistant-header">
        <h2 className="assistant-title">Document assistant</h2>
        <div className="assistant-header-actions">
          <button
            type="button"
            className={
              showSetup
                ? 'icon-button assistant-conn-button active'
                : 'icon-button assistant-conn-button'
            }
            aria-label="Connection settings"
            aria-expanded={showSetup}
            onClick={() => setShowSetup((value) => !value)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M12 22v-5" />
              <path d="M9 8V2" />
              <path d="M15 8V2" />
              <path d="M6 12H2" />
              <path d="M22 12h-4" />
              <path d="M12 6a2 2 0 0 0-2 2v2a6 6 0 0 0 6 6 6 6 0 0 0 6-6v-2a2 2 0 0 0-2-2z" />
            </svg>
            <span
              className={
                assistantReady
                  ? 'assistant-conn-dot assistant-conn-dot-ok'
                  : connectionState === 'error' ||
                      (provider === 'ollama' &&
                        connectionState === 'ok' &&
                        ollamaModels.length === 0)
                    ? 'assistant-conn-dot assistant-conn-dot-error'
                    : 'assistant-conn-dot'
              }
            />
          </button>
          <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              aria-hidden="true"
            >
              <path d="M18 6L6 18" />
              <path d="M6 6l12 12" />
            </svg>
          </button>
        </div>
      </header>

      {showSetup ? (
        <div className="assistant-setup-popover">
          <p className="assistant-setup-status">{connectionLabel}</p>
          <div className="assistant-context-info">
            <span className="assistant-context-label">Document context</span>
            <p className="assistant-context-summary">{contextInfo.summary}</p>
            <p className="assistant-context-detail">{contextInfo.detail}</p>
          </div>

          <div className="assistant-provider-toggle" role="group" aria-label="AI provider">
            <button
              type="button"
              className={
                provider === 'ollama'
                  ? 'assistant-provider-option active'
                  : 'assistant-provider-option'
              }
              onClick={() => updateProvider('ollama')}
            >
              Ollama
            </button>
            <button
              type="button"
              className={
                provider === 'claude'
                  ? 'assistant-provider-option active'
                  : 'assistant-provider-option'
              }
              onClick={() => updateProvider('claude')}
            >
              Claude
            </button>
          </div>

          {provider === 'ollama' ? (
            <>
              <label className="assistant-field">
                <span>Server URL</span>
                <input
                  type="url"
                  value={settings.ollama.baseUrl}
                  onChange={(event) =>
                    updateOllama({ ...settings.ollama, baseUrl: event.target.value })
                  }
                  placeholder="http://127.0.0.1:11434"
                />
              </label>
              <label className="assistant-field">
                <span>Model</span>
                {ollamaModels.length > 0 ? (
                  <select
                    value={resolveOllamaModel(settings.ollama.model, ollamaModels)}
                    onChange={(event) =>
                      updateOllama({ ...settings.ollama, model: event.target.value })
                    }
                  >
                    {ollamaModels.map((model) => (
                      <option key={model} value={model}>
                        {model}
                      </option>
                    ))}
                  </select>
                ) : (
                  <input
                    type="text"
                    value={settings.ollama.model}
                    onChange={(event) =>
                      updateOllama({ ...settings.ollama, model: event.target.value })
                    }
                    placeholder="Run ollama list"
                  />
                )}
              </label>
              <button type="button" className="assistant-test" onClick={testConnection}>
                Test connection
              </button>
              <p className="assistant-hint">
                Requires{' '}
                <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
                  Ollama
                </a>{' '}
                running locally. Run <code>ollama pull &lt;model&gt;</code> if no models appear.
              </p>
            </>
          ) : (
            <>
              <label className="assistant-field">
                <span>API key</span>
                <input
                  type="password"
                  value={settings.claude.apiKey}
                  onChange={(event) =>
                    updateClaude({ ...settings.claude, apiKey: event.target.value })
                  }
                  placeholder="sk-ant-…"
                  autoComplete="off"
                />
              </label>
              <label className="assistant-field">
                <span>Model</span>
                <select
                  value={activeClaudeModel}
                  onChange={(event) =>
                    updateClaude({ ...settings.claude, model: event.target.value })
                  }
                >
                  {(claudeModels.length > 0
                    ? claudeModels
                    : CLAUDE_MODELS.map((model) => model.id)
                  ).map((modelId) => (
                    <option key={modelId} value={modelId}>
                      {CLAUDE_MODELS.find((entry) => entry.id === modelId)?.label ??
                        (isHaikuModelId(modelId) ? `Claude Haiku (${modelId})` : modelId)}
                    </option>
                  ))}
                </select>
              </label>
              <button type="button" className="assistant-test" onClick={testConnection}>
                Test connection
              </button>
              <p className="assistant-hint">
                Get an API key from{' '}
                <a
                  href="https://console.anthropic.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                >
                  console.anthropic.com
                </a>
                . Stored locally in your browser. Use <code>npm run dev</code> or{' '}
                <code>npm run preview</code> so requests go through the built-in proxy.
              </p>
            </>
          )}
        </div>
      ) : null}

      <div className="assistant-messages" ref={messagesRef}>
        {!assistantReady && connectionState !== 'checking' ? (
          <div className="assistant-setup-guide">
            {provider === 'claude' ? (
              <>
                <h3>Connect Claude to get started</h3>
                <p>
                  Use Anthropic&apos;s Claude API for cloud-powered answers about this document.
                  Your API key stays in the browser on this machine.
                </p>
                <ol className="assistant-setup-steps">
                  <li>
                    <strong>Get an API key</strong>
                    <span>
                      Sign in at{' '}
                      <a
                        href="https://console.anthropic.com/"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        console.anthropic.com
                      </a>{' '}
                      and create an API key.
                    </span>
                  </li>
                  <li>
                    <strong>Run the app locally</strong>
                    <span>
                      Claude requests use a dev proxy to avoid browser CORS blocks. Start with:
                    </span>
                    <code>npm run dev</code>
                  </li>
                  <li>
                    <strong>Add your key</strong>
                    <span>
                      Click the connection icon, choose Claude, paste your API key, pick a model,
                      then click Test connection.
                    </span>
                  </li>
                </ol>
              </>
            ) : (
              <>
                <h3>Connect Ollama to get started</h3>
                <p>
                  The assistant runs a local AI on your machine via{' '}
                  <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
                    Ollama
                  </a>
                  . Nothing is sent to the cloud. Or switch to Claude in connection settings.
                </p>
                <ol className="assistant-setup-steps">
                  <li>
                    <strong>Install Ollama</strong>
                    <span>
                      Download from{' '}
                      <a
                        href="https://ollama.com/download"
                        target="_blank"
                        rel="noopener noreferrer"
                      >
                        ollama.com/download
                      </a>{' '}
                      and run the installer.
                    </span>
                  </li>
                  <li>
                    <strong>Pull a model</strong>
                    <span>Open a terminal and run:</span>
                    <code>ollama pull llama3.2</code>
                  </li>
                  <li>
                    <strong>Test connection</strong>
                    <span>
                      Click the connection icon, confirm the server URL, pick a model, then click
                      Test connection.
                    </span>
                  </li>
                </ol>
              </>
            )}
            {connectionState === 'error' && error ? (
              <p className="assistant-error">{error}</p>
            ) : provider === 'ollama' && connectionState === 'ok' && ollamaModels.length === 0 ? (
              <p className="assistant-error">
                Ollama is running but no models are installed yet. Run{' '}
                <code>ollama pull llama3.2</code> in a terminal.
              </p>
            ) : null}
            <button type="button" className="assistant-test" onClick={testConnection}>
              Test connection
            </button>
          </div>
        ) : connectionState === 'checking' && messages.length === 0 ? (
          <p className="assistant-empty">{checkingLabel}</p>
        ) : messages.length === 0 ? (
          <div className="assistant-empty">
            <p>Ask anything about this document.</p>
            <div className="assistant-suggestions">
              {[
                'What is this document about?',
                'Summarize the key points',
                'What are the main topics?',
              ].map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  className="assistant-suggestion"
                  disabled={loading || warming}
                  onClick={() => setInput(suggestion)}
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message, index) => (
            <div
              key={`${message.role}-${index}`}
              className={
                message.role === 'user'
                  ? 'assistant-message assistant-message-user'
                  : 'assistant-message assistant-message-assistant'
              }
            >
              {message.role === 'assistant' ? (
                <div className="assistant-message-body">
                  {message.content ? (
                    <AssistantMarkdown
                      content={message.content}
                      sections={sections}
                      onNavigateToSection={onNavigateToSection}
                    />
                  ) : loading && index === messages.length - 1 ? (
                    <span className="assistant-typing">Thinking…</span>
                  ) : null}
                </div>
              ) : (
                message.content
              )}

              {message.role === 'assistant' &&
              message.relatedSections &&
              message.relatedSections.length > 0 &&
              message.content ? (
                <div className="assistant-section-links">
                  <span className="assistant-section-links-label">
                    {message.relatedSections.length === 1 ? 'Go to section' : 'Go to sections'}
                  </span>
                  {message.relatedSections.map((section) => (
                    <button
                      key={section.id}
                      type="button"
                      className="assistant-section-link"
                      onClick={() => onNavigateToSection(section.id)}
                    >
                      {section.text}
                    </button>
                  ))}
                </div>
              ) : null}
            </div>
          ))
        )}
        <div ref={messagesEndRef} />
      </div>

      {error && assistantReady ? <p className="assistant-error">{error}</p> : null}

      <form className="assistant-form" onSubmit={sendMessage}>
        <textarea
          value={input}
          onChange={(event) => setInput(event.target.value)}
          placeholder={
            assistantReady ? 'Ask about this document…' : setupPlaceholder
          }
          rows={3}
          disabled={loading || !assistantReady}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && !event.shiftKey) {
              event.preventDefault()
              void sendMessage(event)
            }
          }}
        />
        <div className="assistant-form-actions">
          {assistantReady ? <ContextMeter percent={contextUsage.percent} /> : null}
          <button
            type="submit"
            className="assistant-send"
            disabled={
              loading ||
              warming ||
              !input.trim() ||
              !assistantReady ||
              contextUsage.isOverBudget
            }
          >
            {warming ? 'Loading model…' : loading ? 'Thinking…' : 'Send'}
          </button>
        </div>
      </form>
    </aside>
  )
}

export default DocAssistant
