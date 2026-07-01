import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { unified } from 'unified'
import remarkParse from 'remark-parse'
import { visit } from 'unist-util-visit'
import { type Theme, THEMES } from './theme'

type ReaderProps = {
  markdown: string
  fileName: string
  theme: Theme
  onSelectTheme: (theme: Theme) => void
  onHome: () => void
}

type TocEntry = {
  id: string
  text: string
  level: number
  chapterId: string
  sectionId: string
}

type PageSize = 'A3' | 'A4' | 'A5'

type PageData = {
  content: string
  header: string
}

const PAGE_SIZES: Record<
  PageSize,
  {
    widthMm: number
    heightMm: number
    paddingTopMm: number
    paddingHorizontalMm: number
  }
> = {
  A3: { widthMm: 297, heightMm: 420, paddingTopMm: 24, paddingHorizontalMm: 20 },
  A4: { widthMm: 210, heightMm: 297, paddingTopMm: 22, paddingHorizontalMm: 18 },
  A5: { widthMm: 148, heightMm: 210, paddingTopMm: 16, paddingHorizontalMm: 13 },
}

const MM_TO_PX = 3.7795275591

function splitMarkdownBlocks(source: string) {
  const lines = source.split('\n')
  const blocks: string[] = []
  let current: string[] = []
  let fenceToken = ''

  const flush = () => {
    if (current.length > 0) {
      const text = current.join('\n').trim()
      if (text) {
        blocks.push(text)
      }
      current = []
    }
  }

  for (const line of lines) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)

    if (fenceMatch) {
      const token = fenceMatch[1]
      if (!fenceToken) {
        fenceToken = token.slice(0, 3)
      } else if (line.trim().startsWith(fenceToken)) {
        fenceToken = ''
      }
      current.push(line)
      continue
    }

    if (!fenceToken && line.trim() === '') {
      flush()
    } else {
      current.push(line)
    }
  }

  flush()
  return blocks
}

function cleanInline(text: string) {
  return text.replace(/[`*_]/g, '').trim()
}

function computeBlockMeta(sourceBlocks: string[]) {
  let h1 = ''
  let h2 = ''
  return sourceBlocks.map((block) => {
    const firstLine = block.split('\n', 1)[0]?.trim() ?? ''
    const h1Match = /^#(?!#)\s+(.+)$/.exec(firstLine)
    const h2Match = /^##(?!#)\s+(.+)$/.exec(firstLine)
    const h3Match = /^###(?!#)\s+(.+)$/.exec(firstLine)

    let isBreak = false
    let isSubHeader = false
    if (h1Match) {
      h1 = cleanInline(h1Match[1])
      h2 = ''
    } else if (h2Match) {
      h2 = cleanInline(h2Match[1])
      isBreak = true
      isSubHeader = true
    } else if (h3Match) {
      isSubHeader = true
    }

    return { isBreak, isSubHeader, header: h2 || h1 }
  })
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// Heading ids must be a *pure* function of the heading text so the ids computed
// for the TOC always match the ids rendered into the DOM.
function headingId(text: string) {
  return slugify(text) || 'section'
}

type MdastNode = { type: string; value?: string; children?: MdastNode[] }

function mdastText(node: MdastNode): string {
  if (typeof node.value === 'string') {
    return node.value
  }
  if (Array.isArray(node.children)) {
    return node.children.map(mdastText).join('')
  }
  return ''
}

function extractToc(markdown: string) {
  const entries: TocEntry[] = []
  let currentChapterId = ''
  let currentSectionId = ''
  const tree = unified().use(remarkParse).parse(markdown)

  visit(tree, 'heading', (node: MdastNode & { depth: number }) => {
    if (node.depth < 1 || node.depth > 3) {
      return
    }

    const text = mdastText(node).trim()

    if (!text) {
      return
    }

    const id = headingId(text)
    if (node.depth === 1) {
      currentChapterId = id
      currentSectionId = id
    } else if (node.depth === 2) {
      currentSectionId = id
    }

    entries.push({
      id,
      text,
      level: node.depth,
      chapterId: currentChapterId || id,
      sectionId: currentSectionId || id,
    })
  })

  return entries
}

function getNodeText(node: ReactNode): string {
  if (typeof node === 'string' || typeof node === 'number') {
    return String(node)
  }

  if (Array.isArray(node)) {
    return node.map((item) => getNodeText(item)).join('')
  }

  if (node && typeof node === 'object' && 'props' in node) {
    const withProps = node as { props?: { children?: ReactNode } }
    return getNodeText(withProps.props?.children)
  }

  return ''
}

function getHeadingElement(id: string, scope?: ParentNode | null) {
  const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  const root = scope ?? document
  return root.querySelector<HTMLElement>(`#${escapedId}`)
}

function captureAnchorFromViewport(scope: ParentNode | null, headingIds: string[]) {
  if (headingIds.length === 0) {
    return ''
  }

  const activationLine = Math.max(160, window.innerHeight * 0.35)
  let anchorId = headingIds[0]

  for (const id of headingIds) {
    const element = getHeadingElement(id, scope)
    if (!element) {
      continue
    }

    if (element.getBoundingClientRect().top - activationLine <= 0) {
      anchorId = id
    } else {
      break
    }
  }

  return anchorId
}

const SettingsIcon = () => (
  <svg
    width="18"
    height="18"
    viewBox="0 0 24 24"
    fill="none"
    stroke="currentColor"
    strokeWidth="1.8"
    strokeLinecap="round"
    strokeLinejoin="round"
    aria-hidden="true"
  >
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" />
  </svg>
)

function Reader({ markdown, fileName, theme, onSelectTheme, onHome }: ReaderProps) {
  const [isPaged, setIsPaged] = useState(false)
  const [pageSize, setPageSize] = useState<PageSize>('A4')
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [pageScale, setPageScale] = useState(1)
  const [pagedContent, setPagedContent] = useState<PageData[]>([
    { content: markdown, header: '' },
  ])

  const measureHostRef = useRef<HTMLDivElement | null>(null)
  const tocPanelRef = useRef<HTMLElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const docColRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollAnchorRef = useRef<string | null>(null)

  const blocks = useMemo(() => splitMarkdownBlocks(markdown), [markdown])
  const blockMeta = useMemo(() => computeBlockMeta(blocks), [blocks])
  const toc = useMemo(() => extractToc(markdown), [markdown])

  const activeChapterId = useMemo(() => {
    const activeEntry = toc.find((entry) => entry.id === activeHeadingId)
    if (!activeEntry) {
      return toc.find((entry) => entry.level === 1)?.id ?? ''
    }
    return activeEntry.level === 1 ? activeEntry.id : activeEntry.chapterId
  }, [toc, activeHeadingId])
  const activeSectionId = useMemo(() => {
    const activeEntry = toc.find((entry) => entry.id === activeHeadingId)
    if (!activeEntry) {
      return ''
    }
    return activeEntry.level === 3 ? activeEntry.sectionId : activeEntry.id
  }, [toc, activeHeadingId])

  const createMarkdownComponents = useCallback(() => {
    const makeHeading =
      (tagName: 'h1' | 'h2' | 'h3') =>
      ({ children }: { children?: ReactNode }) => {
        const id = headingId(getNodeText(children))
        return tagName === 'h1' ? (
          <h1 id={id}>{children}</h1>
        ) : tagName === 'h2' ? (
          <h2 id={id}>{children}</h2>
        ) : (
          <h3 id={id}>{children}</h3>
        )
      }

    return {
      h1: makeHeading('h1'),
      h2: makeHeading('h2'),
      h3: makeHeading('h3'),
    }
  }, [])

  // Reset reading position when the document changes.
  useEffect(() => {
    setActiveHeadingId('')
    setTocOpen(false)
    setSettingsOpen(false)
    pendingScrollAnchorRef.current = null
  }, [markdown])

  const captureScrollAnchor = useCallback(() => {
    const scope = docColRef.current
    const headingIds = toc.map((item) => item.id)
    const anchorId = captureAnchorFromViewport(scope, headingIds)
    if (anchorId) {
      pendingScrollAnchorRef.current = anchorId
    }
  }, [toc])

  const changeViewMode = (paged: boolean) => {
    if (paged === isPaged) {
      return
    }
    captureScrollAnchor()
    setIsPaged(paged)
  }

  const changePageSize = (size: PageSize) => {
    if (size === pageSize) {
      return
    }
    captureScrollAnchor()
    setPageSize(size)
  }

  // After layout reflows from a view-mode or page-size change, restore scroll
  // position by anchoring to the same heading — not a raw scroll offset.
  // Scoped to .doc-col so we never hit duplicate ids in the hidden measure host.
  useLayoutEffect(() => {
    const anchorId = pendingScrollAnchorRef.current
    if (!anchorId) {
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    let cancelled = false

    const restore = () => {
      if (cancelled) {
        return
      }

      const target = getHeadingElement(anchorId, scope)
      if (!target) {
        return
      }

      target.scrollIntoView({ behavior: 'auto', block: 'start' })
      setActiveHeadingId(anchorId)
      pendingScrollAnchorRef.current = null
    }

    requestAnimationFrame(() => {
      requestAnimationFrame(restore)
    })

    return () => {
      cancelled = true
    }
  }, [isPaged, pageSize, pagedContent, pageScale])

  // Layout-aware pagination: measure real element heights off-screen, then pack
  // blocks into pages, forcing a break before every h2.
  useLayoutEffect(() => {
    if (!isPaged) {
      setPagedContent([{ content: markdown, header: blockMeta[0]?.header ?? '' }])
      return
    }

    const host = measureHostRef.current
    const pageEl = host?.querySelector<HTMLElement>('.measure-page')
    if (!pageEl) {
      return
    }

    const children = Array.from(pageEl.children) as HTMLElement[]
    if (children.length === 0) {
      setPagedContent([{ content: markdown, header: blockMeta[0]?.header ?? '' }])
      return
    }

    const page = PAGE_SIZES[pageSize]
    // Small safety margin: pages have a fixed height with overflow hidden, so
    // err toward breaking a hair early rather than clipping the last block.
    const SAFETY_PX = 6
    const contentHeightPx =
      (page.heightMm - page.paddingTopMm * 2) * MM_TO_PX - SAFETY_PX

    const sampleLine = pageEl.querySelector<HTMLElement>('p, li, h2, h3')
    const lineHeightPx = sampleLine
      ? parseFloat(getComputedStyle(sampleLine).lineHeight) || 25
      : 25
    const WIDOW_LINES = 4
    const widowThresholdPx = lineHeightPx * WIDOW_LINES

    const nextPages: PageData[] = []
    let startIndex = 0
    let pageTop = children[0].offsetTop

    const pushPage = (endIndex: number) => {
      const content = blocks.slice(startIndex, endIndex).join('\n\n').trim()
      if (content) {
        nextPages.push({
          content,
          header: blockMeta[startIndex]?.header ?? '',
        })
      }
    }

    for (let index = 0; index < children.length; index += 1) {
      const element = children[index]
      const isSectionStart = blockMeta[index]?.isBreak ?? false
      const isSubHeader = blockMeta[index]?.isSubHeader ?? false

      if (index > startIndex && isSectionStart) {
        pushPage(index)
        startIndex = index
        pageTop = element.offsetTop
        continue
      }

      // Avoid sub-headers (h2/h3) sitting alone at the bottom of a page with
      // only a few lines of space — break to the next page instead.
      if (index > startIndex && isSubHeader) {
        const spaceLeft = contentHeightPx - (element.offsetTop - pageTop)
        if (spaceLeft < widowThresholdPx) {
          pushPage(index)
          startIndex = index
          pageTop = element.offsetTop
          continue
        }
      }

      const elementBottom = element.offsetTop + element.offsetHeight
      if (index > startIndex && elementBottom - pageTop > contentHeightPx) {
        pushPage(index)
        startIndex = index
        pageTop = element.offsetTop
      }
    }

    pushPage(children.length)

    setPagedContent(
      nextPages.length > 0
        ? nextPages
        : [{ content: markdown, header: blockMeta[0]?.header ?? '' }],
    )
  }, [blocks, blockMeta, isPaged, markdown, pageSize])

  // Scale true-size pages down to fit the available column width (never up).
  useLayoutEffect(() => {
    if (!isPaged) {
      setPageScale(1)
      return
    }

    const el = docColRef.current
    if (!el) {
      return
    }

    const pageWidthPx = PAGE_SIZES[pageSize].widthMm * MM_TO_PX
    const update = () => {
      const available = el.clientWidth
      if (available > 0) {
        setPageScale(Math.min(1, available / pageWidthPx))
      }
    }

    update()
    const observer = new ResizeObserver(update)
    observer.observe(el)
    return () => observer.disconnect()
  }, [isPaged, pageSize])

  // Scroll-spy: activate the heading occupying the reading zone (~35% down).
  useEffect(() => {
    if (toc.length === 0) {
      setActiveHeadingId('')
      return
    }

    const scope = docColRef.current
    const headingIds = toc.map((item) => item.id)

    const onScroll = () => {
      const activationLine = Math.max(160, window.innerHeight * 0.35)
      let activeId = ''

      for (const id of headingIds) {
        const element = getHeadingElement(id, scope)
        if (!element) {
          continue
        }

        if (element.getBoundingClientRect().top - activationLine <= 0) {
          activeId = id
        } else {
          break
        }
      }

      const scrollEl = document.scrollingElement ?? document.documentElement
      const atBottom =
        scrollEl.scrollHeight - (window.scrollY + window.innerHeight) < 4
      if (atBottom) {
        activeId = headingIds[headingIds.length - 1]
      }

      if (!activeId) {
        activeId = headingIds[0]
      }

      setActiveHeadingId((current) => (current === activeId ? current : activeId))
    }

    const raf = window.requestAnimationFrame(onScroll)
    window.addEventListener('scroll', onScroll, { passive: true })
    window.addEventListener('resize', onScroll)
    return () => {
      window.cancelAnimationFrame(raf)
      window.removeEventListener('scroll', onScroll)
      window.removeEventListener('resize', onScroll)
    }
  }, [toc, isPaged, pagedContent, pageScale])

  useEffect(() => {
    const updateFromHash = () => {
      const hash = decodeURIComponent(window.location.hash.replace('#', ''))
      if (!hash) {
        return
      }
      setActiveHeadingId(hash)
    }

    updateFromHash()
    window.addEventListener('hashchange', updateFromHash)
    return () => window.removeEventListener('hashchange', updateFromHash)
  }, [])

  useEffect(() => {
    if (!settingsOpen) {
      return
    }

    const onPointerDown = (event: Event) => {
      if (
        settingsRef.current &&
        !settingsRef.current.contains(event.target as Node)
      ) {
        setSettingsOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setSettingsOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [settingsOpen])

  useEffect(() => {
    if (!activeHeadingId || !tocPanelRef.current) {
      return
    }

    const activeLink = tocPanelRef.current.querySelector<HTMLAnchorElement>(
      `a[href="#${CSS.escape(activeHeadingId)}"]`,
    )

    activeLink?.scrollIntoView({ block: 'nearest' })
  }, [activeHeadingId])

  const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()

    const target = getHeadingElement(id, docColRef.current)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
    setActiveHeadingId(id)
    setTocOpen(false)
  }

  const page = PAGE_SIZES[pageSize]
  const canvasStyle = {
    '--page-width': `${page.widthMm}mm`,
    '--page-height': `${page.heightMm}mm`,
    '--page-padding': `${page.paddingTopMm}mm ${page.paddingHorizontalMm}mm`,
    '--page-pad-x': `${page.paddingHorizontalMm}mm`,
    '--page-pad-y': `${page.paddingTopMm}mm`,
    '--page-scale': pageScale,
  } as CSSProperties

  return (
    <div className="reader-root">
      <div className="topbar-shell reader-topbar-shell">
        <header className="app-topbar topbar-pill reader-topbar">
        <div className="topbar-lead">
          <button
            type="button"
            className="ghost-button home-link"
            onClick={onHome}
            aria-label="Back to library"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M15 18l-6-6 6-6" />
            </svg>
            <span>Library</span>
          </button>
          <span className="topbar-divider" aria-hidden="true" />
          <p className="doc-name" title={fileName}>
            {fileName}
          </p>
        </div>
        <div className="controls">
          <button
            type="button"
            className="ghost-button toc-toggle"
            aria-label="Toggle contents"
            aria-expanded={tocOpen}
            onClick={() => setTocOpen((value) => !value)}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.9"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M8 6h13" />
              <path d="M8 12h13" />
              <path d="M8 18h13" />
              <path d="M3 6h.01" />
              <path d="M3 12h.01" />
              <path d="M3 18h.01" />
            </svg>
            <span>Contents</span>
          </button>

          <div className="controls-actions" ref={settingsRef}>
            <button
              type="button"
              className={settingsOpen ? 'icon-button active' : 'icon-button'}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => setSettingsOpen((value) => !value)}
            >
              <SettingsIcon />
            </button>

            {settingsOpen ? (
              <div className="settings-popover" role="dialog" aria-label="Settings">
                <div className="settings-group">
                  <p className="settings-label">View</p>
                  <div className="segmented">
                    <button
                      type="button"
                      className={!isPaged ? 'seg active' : 'seg'}
                      onClick={() => changeViewMode(false)}
                    >
                      Continuous
                    </button>
                    <button
                      type="button"
                      className={isPaged ? 'seg active' : 'seg'}
                      onClick={() => changeViewMode(true)}
                    >
                      Pages
                    </button>
                  </div>
                </div>

                <div className="settings-group">
                  <p className="settings-label">Page size</p>
                  <div className="segmented">
                    {(['A3', 'A4', 'A5'] as PageSize[]).map((size) => (
                      <button
                        type="button"
                        key={size}
                        className={pageSize === size ? 'seg active' : 'seg'}
                        onClick={() => changePageSize(size)}
                      >
                        {size}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="settings-group">
                  <p className="settings-label">Theme</p>
                  <div className="theme-grid">
                    {THEMES.map((option) => (
                      <button
                        type="button"
                        key={option.id}
                        className={theme === option.id ? 'theme-chip active' : 'theme-chip'}
                        onClick={() => onSelectTheme(option.id)}
                      >
                        <span className="theme-swatch" data-theme={option.id} />
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      </header>
      </div>

      <div className="reader-canvas" data-theme={theme} style={canvasStyle}>
        <aside
          className={tocOpen ? 'toc-panel toc-open' : 'toc-panel'}
          aria-label="Table of contents"
          ref={tocPanelRef}
        >
          <h2>Contents</h2>
          {toc.length === 0 ? (
            <p className="toc-empty">No headings in this document yet.</p>
          ) : (
            <nav>
              {toc.map((entry) =>
                entry.level === 1 ||
                (entry.level === 2 && entry.chapterId === activeChapterId) ||
                (entry.level === 3 &&
                  entry.chapterId === activeChapterId &&
                  entry.sectionId === activeSectionId) ? (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    onClick={(event) => navigateToHeading(event, entry.id)}
                    className={[
                      'toc-link',
                      `toc-l${entry.level}`,
                      activeHeadingId === entry.id ? 'active' : '',
                      entry.level === 1 && entry.id === activeChapterId
                        ? 'active-chapter'
                        : '',
                      entry.level === 2 && entry.id === activeSectionId
                        ? 'active-section'
                        : '',
                      entry.level === 3 && entry.sectionId === activeSectionId
                        ? 'in-active-section'
                        : '',
                    ]
                      .filter(Boolean)
                      .join(' ')}
                  >
                    {entry.text}
                  </a>
                ) : null,
              )}
            </nav>
          )}
        </aside>

        <div className="doc-col" ref={docColRef}>
          {isPaged ? (
            <section className="page-stack">
              {pagedContent.map((pageData, index) => (
                <article className="paper-page" key={`page-${index}`}>
                  <div className="page-running-header">{pageData.header}</div>
                  <div className="page-body">
                    <ReactMarkdown
                      components={createMarkdownComponents()}
                      rehypePlugins={[rehypeRaw]}
                      remarkPlugins={[remarkGfm]}
                    >
                      {pageData.content}
                    </ReactMarkdown>
                  </div>
                  <div className="page-number">{index + 1}</div>
                </article>
              ))}
            </section>
          ) : (
            <article className="paper-scroll">
              <ReactMarkdown
                components={createMarkdownComponents()}
                rehypePlugins={[rehypeRaw]}
                remarkPlugins={[remarkGfm]}
              >
                {markdown}
              </ReactMarkdown>
            </article>
          )}
        </div>

        {isPaged ? (
          <div className="measure-host" ref={measureHostRef} aria-hidden="true">
            <div className="paper-page measure-page">
              <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                {markdown}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Reader
