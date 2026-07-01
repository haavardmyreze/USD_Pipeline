import {
  type FormEvent,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import { AssistantMarkdown } from './AssistantMarkdown'
import { ContextMeter } from './ContextMeter'
import {
  computeContextUsage,
  fitChatHistoryToBudget,
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
import { formatSectionLinkGuide } from './sectionLinks'
import {
  checkOllamaConnection,
  loadOllamaConfig,
  ollamaErrorMessage,
  resolveOllamaModel,
  saveOllamaConfig,
  streamOllamaChat,
  warmOllamaModel,
  type OllamaConfig,
} from './ollama'

type DocAssistantProps = {
  open: boolean
  onClose: () => void
  markdown: string
  fileName: string
  sections: SectionRef[]
  onNavigateToSection: (id: string) => void
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

function findMentionedSections(answer: string, sections: SectionRef[]) {
  const lower = answer.toLowerCase()
  return sections
    .filter((section) => {
      const heading = section.text.toLowerCase()
      return heading.length >= 5 && lower.includes(heading)
    })
    .sort((left, right) => right.text.length - left.text.length)
}

function DocAssistant({
  open,
  onClose,
  markdown,
  fileName,
  sections,
  onNavigateToSection,
}: DocAssistantProps) {
  const [messages, setMessages] = useState<AssistantMessage[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [warming, setWarming] = useState(false)
  const [error, setError] = useState('')
  const [config, setConfig] = useState<OllamaConfig>(() => loadOllamaConfig())
  const [models, setModels] = useState<string[]>([])
  const [connectionState, setConnectionState] = useState<
    'idle' | 'checking' | 'ok' | 'error'
  >('idle')
  const [showSetup, setShowSetup] = useState(false)

  const chunks = useMemo(() => chunkDocument(markdown), [markdown])
  const docKey = `${fileName}:${markdown.length}`
  const useFullDocument = useMemo(() => shouldUseFullDocument(markdown), [markdown])
  const contextInfo = useMemo(() => getDocumentContextInfo(markdown), [markdown])

  const messagesEndRef = useRef<HTMLDivElement | null>(null)
  const messagesRef = useRef<HTMLDivElement | null>(null)
  const panelRef = useRef<HTMLElement | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const warmAbortRef = useRef<AbortController | null>(null)
  const sessionRef = useRef<SessionContext | null>(null)

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
    const messages = messagesRef.current
    if (!panel || !messages) {
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
      messages.scrollTop += event.deltaY
    }

    panel.addEventListener('wheel', onWheel, { passive: false })
    return () => panel.removeEventListener('wheel', onWheel)
  }, [open])

  useEffect(() => {
    if (open && (connectionState === 'error' || (connectionState === 'ok' && models.length === 0))) {
      setShowSetup(true)
    }
  }, [open, connectionState, models.length])

  const activeModel = resolveOllamaModel(config.model, models)
  const ollamaReady = connectionState === 'ok' && models.length > 0 && Boolean(activeModel)

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

  const persistConfig = (next: OllamaConfig) => {
    setConfig(next)
    saveOllamaConfig(next)
  }

  const testConnection = useCallback(async () => {
    setConnectionState('checking')
    setError('')
    try {
      const result = await checkOllamaConnection(config.baseUrl)
      setModels(result.models)
      setConnectionState('ok')
      if (result.models.length === 0) {
        setError(
          'Ollama is running but no models are installed. Run `ollama pull llama3.2` (or another model).',
        )
        return
      }
      setConfig((current) => {
        const resolved = resolveOllamaModel(current.model, result.models)
        if (!resolved || resolved === current.model) {
          return current
        }
        const next = { ...current, model: resolved }
        saveOllamaConfig(next)
        return next
      })

      const resolved = resolveOllamaModel(config.model, result.models)
      if (resolved) {
        warmAbortRef.current?.abort()
        const warmController = new AbortController()
        warmAbortRef.current = warmController
        setWarming(true)
        void warmOllamaModel(
          { baseUrl: config.baseUrl, model: resolved },
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
      setError(ollamaErrorMessage(connectionError))
    }
  }, [config.baseUrl, config.model])

  useEffect(() => {
    if (!open) {
      return
    }
    void testConnection()
  }, [open, testConnection])

  const resolveSystemPrompt = (question: string) => {
    const existing = sessionRef.current
    if (existing && existing.docKey === docKey && existing.mode === 'full') {
      return {
        systemPrompt: existing.systemPrompt,
        mode: existing.mode,
        relatedSections: [] as SectionRef[],
      }
    }

    if (useFullDocument) {
      const systemPrompt = buildFullDocumentSystemPrompt(fileName, markdown)
      sessionRef.current = { docKey, mode: 'full', systemPrompt }
      return {
        systemPrompt,
        mode: 'full' as const,
        relatedSections: [] as SectionRef[],
      }
    }

    const { contextBlock, relatedSections } = buildContextForQuestion(chunks, question)
    const linkGuide = formatSectionLinkGuide(relatedSections)
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

      if (useFullDocument) {
        return buildFullDocumentSystemPrompt(fileName, markdown).length
      }

      const sampleQuestion = question.trim() || 'overview'
      const { contextBlock, relatedSections } = buildContextForQuestion(
        chunks,
        sampleQuestion,
      )
      const linkGuide = formatSectionLinkGuide(relatedSections)
      return buildExcerptSystemPrompt(
        fileName,
        contextBlock,
        isOverviewQuestion(sampleQuestion),
        linkGuide,
      ).length
    },
    [chunks, docKey, fileName, markdown, useFullDocument],
  )

  const contextUsage = useMemo(() => {
    const history = messages.filter((message) => message.content.trim())
    return computeContextUsage({
      systemChars: estimateSystemPromptChars(input),
      history,
      draftQuestion: input,
    })
  }, [estimateSystemPromptChars, input, messages])

  const sendMessage = async (event: FormEvent) => {
    event.preventDefault()
    const question = input.trim()
    if (!question || loading) {
      return
    }

    if (models.length === 0) {
      setError('No Ollama model available. Pull a model and test the connection first.')
      setShowSetup(true)
      return
    }

    const activeConfig = (() => {
      const resolved = resolveOllamaModel(config.model, models)
      if (resolved && resolved !== config.model) {
        const next = { ...config, model: resolved }
        persistConfig(next)
        return next
      }
      return { ...config, model: resolved || config.model }
    })()
    if (!activeConfig.model) {
      setError('Pick an installed model under Ollama connection.')
      setShowSetup(true)
      return
    }

    const { systemPrompt, relatedSections: contextSections } =
      resolveSystemPrompt(question)

    const requestUsage = computeContextUsage({
      systemChars: systemPrompt.length,
      history: messages.filter((message) => message.content.trim()),
      draftQuestion: question,
    })
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
    )

    try {
      await streamOllamaChat(
        activeConfig,
        [
          { role: 'system', content: systemPrompt },
          ...priorMessages.map((message) => ({
            role: message.role,
            content: message.content,
          })),
          { role: 'user', content: question },
        ],
        {
          signal: controller.signal,
          onToken: (token) => {
            assistantText += token
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
          },
        },
      )

      const relatedSections = mergeSectionRefs(
        contextSections,
        findMentionedSections(assistantText, sections),
      ).slice(0, 5)

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
      setError(ollamaErrorMessage(sendError))
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
        ? activeModel
          ? `Connected · ${activeModel}`
          : models.length === 0
            ? 'Connected — no models installed'
            : 'Connected'
        : connectionState === 'error'
          ? 'Not connected'
          : 'Connection not checked'

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
                  connectionState === 'ok' && ollamaReady
                    ? 'assistant-conn-dot assistant-conn-dot-ok'
                    : connectionState === 'error' ||
                        (connectionState === 'ok' && models.length === 0)
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
            <label className="assistant-field">
              <span>Server URL</span>
              <input
                type="url"
                value={config.baseUrl}
                onChange={(event) =>
                  persistConfig({ ...config, baseUrl: event.target.value })
                }
                placeholder="http://127.0.0.1:11434"
              />
            </label>
            <label className="assistant-field">
              <span>Model</span>
              {models.length > 0 ? (
                <select
                  value={resolveOllamaModel(config.model, models)}
                  onChange={(event) =>
                    persistConfig({ ...config, model: event.target.value })
                  }
                >
                  {models.map((model) => (
                    <option key={model} value={model}>
                      {model}
                    </option>
                  ))}
                </select>
              ) : (
                <input
                  type="text"
                  value={config.model}
                  onChange={(event) =>
                    persistConfig({ ...config, model: event.target.value })
                  }
                  placeholder="Run ollama list"
                />
              )}
            </label>
            <button type="button" className="assistant-test" onClick={testConnection}>
              Test connection
            </button>
            <p className="assistant-hint">
              Requires <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">Ollama</a> running locally. Run <code>ollama pull &lt;model&gt;</code> if no models appear.
            </p>
          </div>
        ) : null}

        <div className="assistant-messages" ref={messagesRef}>
          {!ollamaReady && connectionState !== 'checking' ? (
            <div className="assistant-setup-guide">
              <h3>Connect Ollama to get started</h3>
              <p>
                The assistant runs a local AI on your machine via{' '}
                <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
                  Ollama
                </a>
                . Nothing is sent to the cloud.
              </p>
              <ol className="assistant-setup-steps">
                <li>
                  <strong>Install Ollama</strong>
                  <span>
                    Download from{' '}
                    <a href="https://ollama.com/download" target="_blank" rel="noopener noreferrer">
                      ollama.com/download
                    </a>{' '}
                    and run the installer. On Windows, Ollama usually starts automatically in the
                    tray.
                  </span>
                </li>
                <li>
                  <strong>Pull a model</strong>
                  <span>Open a terminal and run:</span>
                  <code>ollama pull llama3.2</code>
                  <span className="assistant-setup-note">
                    Smaller models like <code>phi3</code> or <code>llama3.2:1b</code> are faster.
                  </span>
                </li>
                <li>
                  <strong>Start the server</strong>
                  <span>If the app is not already running:</span>
                  <code>ollama serve</code>
                </li>
                <li>
                  <strong>Allow browser access</strong>
                  <span>
                    If connection fails from the browser, set this environment variable and restart
                    Ollama:
                  </span>
                  <code>OLLAMA_ORIGINS=*</code>
                  <span className="assistant-setup-note">
                    Windows: System Properties → Environment Variables → add under User variables,
                    then restart Ollama.
                  </span>
                </li>
                <li>
                  <strong>Test connection</strong>
                  <span>
                    Click the connection icon in the header, confirm the server URL is{' '}
                    <code>http://127.0.0.1:11434</code>, pick a model, then click Test
                    connection.
                  </span>
                </li>
              </ol>
              {connectionState === 'error' && error ? (
                <p className="assistant-error">{error}</p>
              ) : connectionState === 'ok' && models.length === 0 ? (
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
            <p className="assistant-empty">Checking Ollama connection…</p>
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
                    <span className="assistant-section-links-label">Go to section</span>
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

        {error && ollamaReady ? <p className="assistant-error">{error}</p> : null}

        <form className="assistant-form" onSubmit={sendMessage}>
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder={
              ollamaReady
                ? 'Ask about this document…'
                : 'Connect Ollama above to start asking questions…'
            }
            rows={3}
            disabled={loading || !ollamaReady}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && !event.shiftKey) {
                event.preventDefault()
                void sendMessage(event)
              }
            }}
          />
          <div className="assistant-form-actions">
            {ollamaReady ? <ContextMeter percent={contextUsage.percent} /> : null}
            <button
              type="submit"
              className="assistant-send"
              disabled={
                loading ||
                warming ||
                !input.trim() ||
                !ollamaReady ||
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
