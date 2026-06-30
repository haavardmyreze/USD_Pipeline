import {
  type CSSProperties,
  type ChangeEvent,
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
import './App.css'
import {
  getDocIdFromUrl,
  getLibraryContent,
  getLibraryDoc,
  libraryDocs,
  type LibraryDoc,
} from './library'

const fallbackMarkdown = '# No document\n\nAdd `.md` files to `markdown-viewer/library/` or load a file from disk.'

type TocEntry = {
  id: string
  text: string
  level: number
  chapterId: string
  sectionId: string
}

type PageSize = 'A3' | 'A4' | 'A5'

type Theme =
  | 'slate'
  | 'sepia'
  | 'ink'
  | 'crimson'
  | 'notion'
  | 'nord'
  | 'forest'
  | 'dusk'

type PageData = {
  content: string
  header: string
}

const THEMES: { id: Theme; label: string }[] = [
  { id: 'slate', label: 'Slate' },
  { id: 'notion', label: 'Notion' },
  { id: 'nord', label: 'Nord' },
  { id: 'forest', label: 'Forest' },
  { id: 'dusk', label: 'Dusk' },
  { id: 'crimson', label: 'Crimson' },
  { id: 'sepia', label: 'Sepia' },
  { id: 'ink', label: 'Ink' },
]

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

    let isBreak = false
    if (h1Match) {
      h1 = cleanInline(h1Match[1])
      h2 = ''
    } else if (h2Match) {
      h2 = cleanInline(h2Match[1])
      isBreak = true
    }

    return { isBreak, header: h2 || h1 }
  })
}

function slugify(text: string) {
  return text
    .toLowerCase()
    .replace(/[^\w\s-]/g, '')
    .trim()
    .replace(/\s+/g, '-')
}

// Heading ids must be a *pure* function of the heading text. A stateful
// de-duplicating slugger drifts under React's dev double-invocation (the same
// slugger instance is reused across both render passes), producing "-1"
// suffixes in the DOM that never match the ids computed once in extractToc.
function headingId(text: string) {
  return slugify(text) || 'section'
}

type MdastNode = { type: string; value?: string; children?: MdastNode[] }

// Mirror getNodeText: collect every text/inlineCode value across the subtree so
// headings containing emphasis, strong, delete, links, etc. slugify the same way
// the rendered React children do.
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

function getHeadingElement(id: string) {
  const escapedId = typeof CSS !== 'undefined' && CSS.escape ? CSS.escape(id) : id
  return (
    document.getElementById(id) ??
    document.querySelector<HTMLElement>(`[id="${escapedId}"]`)
  )
}

function resolveInitialDocument() {
  const fromUrl = getDocIdFromUrl()
  if (fromUrl) {
    const doc = getLibraryDoc(fromUrl)
    const content = getLibraryContent(fromUrl)
    if (doc && content) {
      return { content, fileName: doc.fileName, libraryId: doc.id }
    }
  }

  try {
    const stored = localStorage.getItem('mdv-library-doc')
    if (stored) {
      const doc = getLibraryDoc(stored)
      const content = getLibraryContent(stored)
      if (doc && content) {
        return { content, fileName: doc.fileName, libraryId: doc.id }
      }
    }
  } catch {
    // ignore persistence errors (e.g. private mode)
  }

  const firstDoc = libraryDocs[0]
  if (firstDoc) {
    const content = getLibraryContent(firstDoc.id)
    if (content) {
      return { content, fileName: firstDoc.fileName, libraryId: firstDoc.id }
    }
  }

  return { content: fallbackMarkdown, fileName: 'No library documents', libraryId: '' }
}

function App() {
  const initialDocument = useMemo(() => resolveInitialDocument(), [])
  const [markdown, setMarkdown] = useState(initialDocument.content)
  const [isPaged, setIsPaged] = useState(false)
  const [fileName, setFileName] = useState(initialDocument.fileName)
  const [activeLibraryId, setActiveLibraryId] = useState(initialDocument.libraryId)
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [pageSize, setPageSize] = useState<PageSize>('A4')
  const [theme, setTheme] = useState<Theme>(() => {
    try {
      const stored = localStorage.getItem('mdv-theme') as Theme | null
      return stored && THEMES.some((option) => option.id === stored)
        ? stored
        : 'slate'
    } catch {
      return 'slate'
    }
  })
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [libraryOpen, setLibraryOpen] = useState(false)
  const [pagedContent, setPagedContent] = useState<PageData[]>([
    { content: initialDocument.content, header: '' },
  ])
  const measureHostRef = useRef<HTMLDivElement | null>(null)
  const tocPanelRef = useRef<HTMLElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const libraryRef = useRef<HTMLDivElement | null>(null)

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
    const contentHeightPx = (page.heightMm - page.paddingTopMm * 2) * MM_TO_PX

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

      if (index > startIndex && isSectionStart) {
        pushPage(index)
        startIndex = index
        pageTop = element.offsetTop
        continue
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

  useEffect(() => {
    if (toc.length === 0) {
      setActiveHeadingId('')
      return
    }

    const headingIds = toc.map((item) => item.id)

    const onScroll = () => {
      // Activate the heading whose section currently occupies the reading zone
      // (~35% down the viewport) rather than the very top, so the highlight
      // tracks what's actually on screen instead of lagging a section behind.
      const activationLine = Math.max(160, window.innerHeight * 0.35)
      let activeId = ''

      for (const id of headingIds) {
        const element = getHeadingElement(id)
        if (!element) {
          continue
        }

        if (element.getBoundingClientRect().top - activationLine <= 0) {
          activeId = id
        } else {
          break
        }
      }

      // When scrolled to the bottom, the last section may be too short to ever
      // cross the activation line — force it active so the end is reachable.
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
  }, [toc, isPaged, pagedContent])

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
    document.documentElement.dataset.theme = theme
    try {
      localStorage.setItem('mdv-theme', theme)
    } catch {
      // ignore persistence errors (e.g. private mode)
    }
  }, [theme])

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
    if (!libraryOpen) {
      return
    }

    const onPointerDown = (event: Event) => {
      if (
        libraryRef.current &&
        !libraryRef.current.contains(event.target as Node)
      ) {
        setLibraryOpen(false)
      }
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setLibraryOpen(false)
      }
    }

    document.addEventListener('mousedown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('mousedown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [libraryOpen])

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

    const target = getHeadingElement(id)
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'start' })
    }

    window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
    setActiveHeadingId(id)
  }

  const loadLibraryDoc = (doc: LibraryDoc) => {
    const content = getLibraryContent(doc.id)
    if (!content) {
      return
    }

    setMarkdown(content)
    setFileName(doc.fileName)
    setActiveLibraryId(doc.id)
    setActiveHeadingId('')
    setLibraryOpen(false)
    setSettingsOpen(false)
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.set('doc', doc.id)
    url.hash = ''
    window.history.replaceState(null, '', url)

    try {
      localStorage.setItem('mdv-library-doc', doc.id)
    } catch {
      // ignore persistence errors (e.g. private mode)
    }
  }

  const onFileUpload = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0]
    if (!file) {
      return
    }

    const content = await file.text()
    setMarkdown(content)
    setFileName(file.name)
    setActiveLibraryId('')
    setActiveHeadingId('')
    window.scrollTo({ top: 0, behavior: 'auto' })

    const url = new URL(window.location.href)
    url.searchParams.delete('doc')
    url.hash = ''
    window.history.replaceState(null, '', url)

    event.target.value = ''
  }

  return (
    <main className="reader-shell">
      <header className="topbar">
        <div className="title-group">
          <p className="eyebrow">Markdown Viewer</p>
          <div className="title-row">
            <h1>Quiet Reader</h1>
            <p className="subtle">{fileName}</p>
          </div>
        </div>
        <div className="controls">
          <div className="library-control" ref={libraryRef}>
            <button
              type="button"
              className={libraryOpen ? 'text-button active' : 'text-button'}
              aria-label="Document library"
              aria-expanded={libraryOpen}
              onClick={() => {
                setLibraryOpen((value) => !value)
                setSettingsOpen(false)
              }}
            >
              Library
            </button>

            {libraryOpen ? (
              <div className="library-popover" role="dialog" aria-label="Document library">
                <p className="settings-label">Library</p>
                {libraryDocs.length === 0 ? (
                  <p className="library-empty">
                    Add `.md` files to <code>markdown-viewer/library/</code>
                  </p>
                ) : (
                  <nav className="library-list">
                    {libraryDocs.map((doc) => (
                      <button
                        type="button"
                        key={doc.id}
                        className={
                          activeLibraryId === doc.id ? 'library-item active' : 'library-item'
                        }
                        onClick={() => loadLibraryDoc(doc)}
                      >
                        <span className="library-item-title">{doc.title}</span>
                        {doc.id.includes('/') ? (
                          <span className="library-item-path">{doc.id}</span>
                        ) : null}
                      </button>
                    ))}
                  </nav>
                )}
              </div>
            ) : null}
          </div>

          <div className="controls-actions" ref={settingsRef}>
          <label className="file-button">
            Load Markdown
            <input
              type="file"
              accept=".md,.markdown,text/markdown,text/plain"
              onChange={onFileUpload}
            />
          </label>
          <button
            type="button"
            className={settingsOpen ? 'icon-button active' : 'icon-button'}
            aria-label="Settings"
            aria-expanded={settingsOpen}
            onClick={() => {
              setSettingsOpen((value) => !value)
              setLibraryOpen(false)
            }}
          >
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
          </button>

          {settingsOpen ? (
            <div className="settings-popover" role="dialog" aria-label="Settings">
              <div className="settings-group">
                <p className="settings-label">View</p>
                <div className="segmented">
                  <button
                    type="button"
                    className={!isPaged ? 'seg active' : 'seg'}
                    onClick={() => setIsPaged(false)}
                  >
                    Continuous
                  </button>
                  <button
                    type="button"
                    className={isPaged ? 'seg active' : 'seg'}
                    onClick={() => setIsPaged(true)}
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
                      onClick={() => setPageSize(size)}
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
                      onClick={() => setTheme(option.id)}
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

      <section
        className="reader-body"
        style={
          {
            '--page-width': `${PAGE_SIZES[pageSize].widthMm}mm`,
            '--page-height': `${PAGE_SIZES[pageSize].heightMm}mm`,
            '--page-padding': `${PAGE_SIZES[pageSize].paddingTopMm}mm ${PAGE_SIZES[pageSize].paddingHorizontalMm}mm`,
            '--page-pad-x': `${PAGE_SIZES[pageSize].paddingHorizontalMm}mm`,
            '--page-pad-y': `${PAGE_SIZES[pageSize].paddingTopMm}mm`,
            '--page-aspect': `${PAGE_SIZES[pageSize].widthMm} / ${PAGE_SIZES[pageSize].heightMm}`,
          } as CSSProperties
        }
      >
        <aside className="toc-panel" aria-label="Table of contents" ref={tocPanelRef}>
          <h2>Contents</h2>
          {toc.length === 0 ? (
            <p className="toc-empty">No headings in this document yet.</p>
          ) : (
            <nav>
              {toc.map((entry) => (
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
                ) : null
              ))}
            </nav>
          )}
        </aside>

        {isPaged ? (
          <section className="page-stack">
            {pagedContent.map((page, index) => (
              <article className="paper-page" key={`page-${index}`}>
                <div className="page-running-header">{page.header}</div>
                <div className="page-body">
                  <ReactMarkdown
                    components={createMarkdownComponents()}
                    rehypePlugins={[rehypeRaw]}
                    remarkPlugins={[remarkGfm]}
                  >
                    {page.content}
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
      </section>
      {isPaged ? (
        <div
          className="measure-host"
          ref={measureHostRef}
          aria-hidden="true"
          style={
            {
              '--page-width': `${PAGE_SIZES[pageSize].widthMm}mm`,
              '--page-height': `${PAGE_SIZES[pageSize].heightMm}mm`,
              '--page-padding': `${PAGE_SIZES[pageSize].paddingTopMm}mm ${PAGE_SIZES[pageSize].paddingHorizontalMm}mm`,
            } as CSSProperties
          }
        >
          <div className="paper-page measure-page">
            <ReactMarkdown
              rehypePlugins={[rehypeRaw]}
              remarkPlugins={[remarkGfm]}
            >
              {markdown}
            </ReactMarkdown>
          </div>
        </div>
      ) : null}
    </main>
  )
}

export default App
