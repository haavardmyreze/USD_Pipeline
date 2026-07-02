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
import DocAssistant from './DocAssistant'
import DocComments from './DocComments'
import { injectCommentHighlights } from './commentAnchors'
import { useDocumentComments } from './documentComments'
import {
  clampPageZoom,
  loadReaderPreferences,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  PAGE_ZOOM_STEP,
  saveReaderPreferences,
  type DocumentViewMode,
  type PageSize,
} from './readerConfig'

type ReaderProps = {
  markdown: string
  fileName: string
  docKey: string
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

function splitMarkdownIntoCards(source: string): PageData[] {
  const sourceBlocks = splitMarkdownBlocks(source)
  const meta = computeBlockMeta(sourceBlocks)
  const cards: PageData[] = []
  let startIndex = 0

  const pushCard = (endIndex: number) => {
    const content = sourceBlocks.slice(startIndex, endIndex).join('\n\n').trim()
    if (content) {
      cards.push({
        content,
        header: meta[startIndex]?.header ?? '',
      })
    }
  }

  for (let index = 0; index < sourceBlocks.length; index += 1) {
    if (index > startIndex && meta[index]?.isBreak) {
      pushCard(index)
      startIndex = index
    }
  }

  pushCard(sourceBlocks.length)

  return cards.length > 0 ? cards : [{ content: source, header: '' }]
}

import { headingId } from './headings'
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
  const headingCounts = new Map<string, number>()
  const tree = unified().use(remarkParse).parse(markdown)

  visit(tree, 'heading', (node: MdastNode & { depth: number }) => {
    if (node.depth < 1 || node.depth > 3) {
      return
    }

    const text = mdastText(node).trim()

    if (!text) {
      return
    }

    const baseId = headingId(text)
    const seenCount = headingCounts.get(baseId) ?? 0
    const id = seenCount === 0 ? baseId : `${baseId}-${seenCount + 1}`
    headingCounts.set(baseId, seenCount + 1)
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

function Reader({
  markdown,
  fileName,
  docKey,
  theme,
  onSelectTheme,
  onHome,
}: ReaderProps) {
  const [viewMode, setViewMode] = useState<DocumentViewMode>(
    () => loadReaderPreferences().viewMode,
  )
  const [pageSize, setPageSize] = useState<PageSize>(() => loadReaderPreferences().pageSize)
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [assistantOpen, setAssistantOpen] = useState(false)
  const [commentsOpen, setCommentsOpen] = useState(false)
  const [tocOpen, setTocOpen] = useState(false)
  const [pageZoom, setPageZoom] = useState(() => loadReaderPreferences().pageZoom)
  const [pagedContent, setPagedContent] = useState<PageData[]>([
    { content: markdown, header: '' },
  ])

  const measureHostRef = useRef<HTMLDivElement | null>(null)
  const tocPanelRef = useRef<HTMLElement | null>(null)
  const settingsRef = useRef<HTMLDivElement | null>(null)
  const docColRef = useRef<HTMLDivElement | null>(null)
  const docStageRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollAnchorRef = useRef<string | null>(null)

  const {
    comments,
    activeCommentId,
    setActiveCommentId,
    addComment,
    updateComment,
    deleteComment,
  } = useDocumentComments(docKey, markdown)

  const handleAddComment = useCallback(
    (anchor: Parameters<typeof addComment>[0], body: string) => {
      return addComment(anchor, body)
    },
    [addComment],
  )

  const displayMarkdown = useMemo(
    () => (commentsOpen ? injectCommentHighlights(markdown, comments) : markdown),
    [comments, commentsOpen, markdown],
  )

  const blocks = useMemo(() => splitMarkdownBlocks(displayMarkdown), [displayMarkdown])
  const blockMeta = useMemo(() => computeBlockMeta(blocks), [blocks])
  const cardContent = useMemo(
    () => splitMarkdownIntoCards(displayMarkdown),
    [displayMarkdown],
  )
  const toc = useMemo(() => extractToc(markdown), [markdown])
  const isPaged = viewMode === 'paged'

  useEffect(() => {
    saveReaderPreferences({ viewMode, pageSize, pageZoom })
  }, [viewMode, pageSize, pageZoom])

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

  const markdownComponents = useMemo(() => {
    const idsByHeadingText = new Map<string, string[]>()
    for (const entry of toc) {
      const key = entry.text.trim().toLowerCase()
      const list = idsByHeadingText.get(key) ?? []
      list.push(entry.id)
      idsByHeadingText.set(key, list)
    }
    const usedByHeadingText = new Map<string, number>()

    const resolveRenderedHeadingId = (children?: ReactNode) => {
      const text = getNodeText(children).trim()
      const key = text.toLowerCase()
      const used = usedByHeadingText.get(key) ?? 0
      usedByHeadingText.set(key, used + 1)
      const candidate = idsByHeadingText.get(key)?.[used]
      return candidate ?? headingId(text)
    }

    const makeHeading =
      (tagName: 'h1' | 'h2' | 'h3') =>
      ({ children }: { children?: ReactNode }) => {
        const id = resolveRenderedHeadingId(children)
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
  }, [toc])

  const renderDocumentMarkdown = useCallback(
    (content: string) => (
      <ReactMarkdown
        components={markdownComponents}
        rehypePlugins={[rehypeRaw]}
        remarkPlugins={[remarkGfm]}
      >
        {content}
      </ReactMarkdown>
    ),
    [markdownComponents],
  )

  // Reset reading position when the document changes.
  useEffect(() => {
    setActiveHeadingId('')
    setTocOpen(false)
    setSettingsOpen(false)
    setAssistantOpen(false)
    setCommentsOpen(false)
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

  const changeViewMode = (mode: DocumentViewMode) => {
    if (mode === viewMode) {
      return
    }
    captureScrollAnchor()
    setViewMode(mode)
  }

  const changePageSize = (size: PageSize) => {
    if (size === pageSize) {
      return
    }
    captureScrollAnchor()
    setPageSize(size)
  }

  const changePageZoom = (zoom: number) => {
    const clamped = clampPageZoom(zoom)
    if (clamped === pageZoom) {
      return
    }
    captureScrollAnchor()
    setPageZoom(clamped)
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
  }, [viewMode, pageSize, pageZoom, pagedContent, cardContent, comments])

  // Layout-aware pagination: measure real element heights off-screen, then pack
  // blocks into pages, forcing a break before every h2.
  useLayoutEffect(() => {
    if (!isPaged) {
      setPagedContent([{ content: displayMarkdown, header: blockMeta[0]?.header ?? '' }])
      return
    }

    const host = measureHostRef.current
    const pageEl = host?.querySelector<HTMLElement>('.measure-page')
    if (!pageEl) {
      return
    }

    const children = Array.from(pageEl.children) as HTMLElement[]
    if (children.length === 0) {
      setPagedContent([{ content: displayMarkdown, header: blockMeta[0]?.header ?? '' }])
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
        : [{ content: displayMarkdown, header: blockMeta[0]?.header ?? '' }],
    )
  }, [blocks, blockMeta, displayMarkdown, isPaged, pageSize])

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
  }, [toc, viewMode, pagedContent, cardContent, pageZoom, comments])

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

  const navigateToSection = useCallback(
    (id: string) => {
      const scope = docColRef.current
      let target = getHeadingElement(id, scope)

      if (!target) {
        const entry = toc.find((item) => item.id === id)
        if (entry && scope) {
          const headings = Array.from(
            scope.querySelectorAll<HTMLElement>('h1[id], h2[id], h3[id]'),
          )
          target =
            headings.find(
              (heading) => heading.textContent?.trim().toLowerCase() === entry.text.toLowerCase(),
            ) ?? null
        }
      }

      if (target) {
        target.scrollIntoView({ behavior: 'smooth', block: 'start' })
        const resolvedId = target.id || id
        window.history.replaceState(null, '', `#${encodeURIComponent(resolvedId)}`)
        setActiveHeadingId(resolvedId)
      } else {
        window.history.replaceState(null, '', `#${encodeURIComponent(id)}`)
        setActiveHeadingId(id)
      }

      setTocOpen(false)
    },
    [toc],
  )

  const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    navigateToSection(id)
  }

  const documentSections = useMemo(
    () =>
      toc.map((entry) => ({
        id: entry.id,
        text: entry.text,
        level: entry.level,
      })),
    [toc],
  )

  const page = PAGE_SIZES[pageSize]
  const canvasStyle = {
    '--page-width': `${page.widthMm}mm`,
    '--page-height': `${page.heightMm}mm`,
    '--page-padding': `${page.paddingTopMm}mm ${page.paddingHorizontalMm}mm`,
    '--page-pad-x': `${page.paddingHorizontalMm}mm`,
    '--page-pad-y': `${page.paddingTopMm}mm`,
    '--page-scale': pageZoom,
  } as CSSProperties

  const pageZoomPercent = Math.round(pageZoom * 100)

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

          <button
            type="button"
            className={commentsOpen ? 'ghost-button active' : 'ghost-button'}
            aria-label="Document comments"
            aria-expanded={commentsOpen}
            onClick={() => {
              setCommentsOpen((value) => !value)
              setAssistantOpen(false)
              setSettingsOpen(false)
              setTocOpen(false)
            }}
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
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
              <path d="M8 9h8" />
              <path d="M8 13h5" />
            </svg>
            <span>Comments</span>
            {comments.length > 0 ? (
              <span className="comment-count-badge">{comments.length}</span>
            ) : null}
          </button>

          <button
            type="button"
            className="ghost-button assistant-toggle"
            aria-label="Ask about this document"
            aria-expanded={assistantOpen}
            onClick={() => {
              setAssistantOpen((value) => !value)
              setSettingsOpen(false)
              setTocOpen(false)
              setCommentsOpen(false)
            }}
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
              <path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z" />
            </svg>
            <span>Ask</span>
          </button>

          <div className="controls-actions" ref={settingsRef}>
            <button
              type="button"
              className={settingsOpen ? 'icon-button active' : 'icon-button'}
              aria-label="Settings"
              aria-expanded={settingsOpen}
              onClick={() => {
                setSettingsOpen((value) => !value)
                setAssistantOpen(false)
                setCommentsOpen(false)
              }}
            >
              <SettingsIcon />
            </button>

            {settingsOpen ? (
              <div className="settings-popover" role="dialog" aria-label="Settings">
                <div className="settings-group">
                  <p className="settings-label">View</p>
                  <div className="segmented segmented-view">
                    <button
                      type="button"
                      className={viewMode === 'continuous' ? 'seg active' : 'seg'}
                      onClick={() => changeViewMode('continuous')}
                    >
                      Continuous
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'cards' ? 'seg active' : 'seg'}
                      onClick={() => changeViewMode('cards')}
                    >
                      Cards
                    </button>
                    <button
                      type="button"
                      className={viewMode === 'paged' ? 'seg active' : 'seg'}
                      onClick={() => changeViewMode('paged')}
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
                  <div className="settings-label-row">
                    <p className="settings-label">Scale</p>
                    <span className="scale-value" aria-live="polite">
                      {pageZoomPercent}%
                    </span>
                  </div>
                  <div className="scale-control">
                    <button
                      type="button"
                      className="scale-step"
                      aria-label="Zoom out"
                      onClick={() => changePageZoom(pageZoom - PAGE_ZOOM_STEP)}
                      disabled={pageZoom <= PAGE_ZOOM_MIN}
                    >
                      −
                    </button>
                    <input
                      type="range"
                      className="scale-slider"
                      min={PAGE_ZOOM_MIN * 100}
                      max={PAGE_ZOOM_MAX * 100}
                      step={PAGE_ZOOM_STEP * 100}
                      value={pageZoomPercent}
                      aria-label="Page scale"
                      onChange={(event) =>
                        changePageZoom(Number(event.target.value) / 100)
                      }
                    />
                    <button
                      type="button"
                      className="scale-step"
                      aria-label="Zoom in"
                      onClick={() => changePageZoom(pageZoom + PAGE_ZOOM_STEP)}
                      disabled={pageZoom >= PAGE_ZOOM_MAX}
                    >
                      +
                    </button>
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

      <DocAssistant
        open={assistantOpen}
        onClose={() => setAssistantOpen(false)}
        markdown={markdown}
        fileName={fileName}
        sections={documentSections}
        onNavigateToSection={navigateToSection}
      />

      <DocComments
        open={commentsOpen}
        onClose={() => setCommentsOpen(false)}
        docColRef={docColRef}
        markdown={markdown}
        toc={toc}
        comments={comments}
        activeCommentId={activeCommentId}
        setActiveCommentId={setActiveCommentId}
        onAddComment={handleAddComment}
        onUpdateComment={updateComment}
        onDeleteComment={deleteComment}
      />

      <div
        className="reader-canvas"
        data-theme={theme}
        data-comment-mode={commentsOpen ? 'true' : undefined}
        style={canvasStyle}
      >
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

        <div className="doc-stage" ref={docStageRef}>
          <div
            className={commentsOpen ? 'doc-col comment-mode' : 'doc-col'}
            ref={docColRef}
          >
            {viewMode === 'paged' ? (
              <section className="page-stack">
                {pagedContent.map((pageData, index) => (
                  <article className="paper-page" key={`page-${index}`}>
                    <div className="page-running-header">{pageData.header}</div>
                    <div className="page-body">
                      {renderDocumentMarkdown(pageData.content)}
                    </div>
                    <div className="page-number">{index + 1}</div>
                  </article>
                ))}
              </section>
            ) : viewMode === 'cards' ? (
              <section className="card-stack">
                {cardContent.map((cardData, index) => (
                  <article className="paper-scroll paper-card" key={`card-${index}`}>
                    {renderDocumentMarkdown(cardData.content)}
                  </article>
                ))}
              </section>
            ) : (
              <article className="paper-scroll">
                {renderDocumentMarkdown(displayMarkdown)}
              </article>
            )}
          </div>
        </div>

        {isPaged ? (
          <div className="measure-host" ref={measureHostRef} aria-hidden="true">
            <div className="paper-page measure-page">
              <ReactMarkdown rehypePlugins={[rehypeRaw]} remarkPlugins={[remarkGfm]}>
                {displayMarkdown}
              </ReactMarkdown>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  )
}

export default Reader
