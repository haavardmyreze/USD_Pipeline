import {
  type CSSProperties,
  type MouseEvent,
  type ReactNode,
  memo,
  useCallback,
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
} from 'react'
import ReactMarkdown, { type Components } from 'react-markdown'
import remarkGfm from 'remark-gfm'
import rehypeRaw from 'rehype-raw'
import { type Theme, type ThemePreference } from './theme'
import DocAssistant from './DocAssistant'
import DocComments from './DocComments'
import { injectCommentHighlights, resolveSelectionAnchor } from './commentAnchors'
import { buildSearchSections, searchSections } from './documentSearch'
import { useDocumentComments, type CommentAnchor } from './documentComments'
import { headingId } from './headings'
import {
  computeBlockMeta,
  splitMarkdownBlocks,
  splitMarkdownIntoCards,
  type PageData,
} from './markdown/blocks'
import { extractToc, shouldShowTocEntry, type TocEntry } from './markdown/toc'
import {
  packBlocksIntoPages,
  pageContentHeightPx,
  PAGE_SIZES,
} from './markdown/paginate'
import {
  captureAnchorFromViewport,
  flashHighlightInDocument,
  getHeadingElement,
} from './markdown/flashHighlight'
import {
  clampPageZoom,
  clampTypeScale,
  applyZoomKeyboardShortcut,
  attachDocumentZoomWheel,
  isEditableKeyboardTarget,
  loadReaderPreferences,
  PAGE_ZOOM_MAX,
  PAGE_ZOOM_MIN,
  stepPageZoom,
  saveReaderPreferences,
  TYPE_LEADING_OPTIONS,
  TYPE_SCALE_MAX,
  TYPE_SCALE_MIN,
  type DocumentViewMode,
  type PageSize,
} from './readerConfig'
import { AskIcon, CommentsIcon, ContentsIcon, SearchIcon } from './ui/icons'
import { ReaderTopbar, type TopbarAction } from './ui/ReaderTopbar'
import { SearchPanel } from './ui/SearchPanel'
import { ThemePicker } from './ui/ThemePicker'
import { usePanels } from './ui/usePanels'
import { CommandPalette } from './ui/CommandPalette'
import { InkAnnotation } from './ui/InkAnnotation'
import { LaserPointer } from './ui/LaserPointer'
import { SelectionMenu } from './ui/SelectionMenu'
import { TocRail } from './ui/TocRail'
import { Lightbox } from './ui/Lightbox'
import {
  createDrawPaletteAction,
  createDrawTopbarAction,
  createLaserPaletteAction,
  createLaserTopbarAction,
  useMarkdownInkBinding,
  useReaderDrawMode,
} from './ui/useReaderInk'
import { markdownCodeComponents } from './markdown/CodeBlocks'
import { applyFindHighlights, type FindHighlights } from './markdown/findHighlights'
import { LinkPreview } from './ui/LinkPreview'
import {
  actionsPaletteGroup,
  libraryPaletteGroup,
  sectionsPaletteGroup,
  themePaletteGroup,
} from './ui/paletteGroups'
import {
  currentScrollProgress,
  loadReadingPosition,
  saveReadingPosition,
} from './readingPosition'
import type { LibraryDoc } from './library'
import { normalizePastedText } from './text/normalizeLineBreaks'

type ReaderProps = {
  markdown: string
  fileName: string
  docKey: string
  theme: Theme
  themePreference: ThemePreference
  onSelectTheme: (preference: ThemePreference) => void
  onHome: () => void
  onOpenLibrary: (doc: LibraryDoc) => void
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

// Heading text as it will appear when rendered: links/images resolved to
// their text, inline markup stripped.
function headingTextFromLine(line: string): string {
  return line
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
    .replace(/[`*_~]/g, '')
    .trim()
    .toLowerCase()
}

// Ordered heading texts (h1–h3) in a markdown fragment, fence-aware.
function extractHeadingTexts(content: string): string[] {
  const texts: string[] = []
  let fenceToken = ''

  for (const line of content.split('\n')) {
    const fenceMatch = /^\s*(```+|~~~+)/.exec(line)
    if (fenceMatch) {
      const token = fenceMatch[1].slice(0, 3)
      if (!fenceToken) {
        fenceToken = token
      } else if (line.trim().startsWith(fenceToken)) {
        fenceToken = ''
      }
      continue
    }
    if (fenceToken) {
      continue
    }

    const match = /^#{1,3}\s+(.+)$/.exec(line.trim())
    if (match) {
      texts.push(headingTextFromLine(match[1]))
    }
  }

  return texts
}

/**
 * Build heading components for one render unit (a page, card, or the whole
 * document). Ids resolve deterministically from the document TOC: each unit
 * knows how many same-text headings precede it, so duplicate headings keep
 * stable, unique ids across re-renders — no shared mutable counter.
 */
function buildUnitHeadingComponents(
  idsByHeadingText: Map<string, string[]>,
  occurrenceOffsets: Map<string, number>,
): { components: Components; resetIds: () => void } {
  let localCounts = new Map<string, number>()

  const resolveId = (children?: ReactNode) => {
    const text = getNodeText(children).trim()
    const key = text.toLowerCase()
    const local = localCounts.get(key) ?? 0
    localCounts.set(key, local + 1)
    const globalIndex = (occurrenceOffsets.get(key) ?? 0) + local
    return idsByHeadingText.get(key)?.[globalIndex] ?? headingId(text)
  }

  const makeHeading =
    (tagName: 'h1' | 'h2' | 'h3') =>
    ({ children }: { children?: ReactNode }) => {
      const id = resolveId(children)
      return tagName === 'h1' ? (
        <h1 id={id}>{children}</h1>
      ) : tagName === 'h2' ? (
        <h2 id={id}>{children}</h2>
      ) : (
        <h3 id={id}>{children}</h3>
      )
    }

  return {
    components: {
      h1: makeHeading('h1'),
      h2: makeHeading('h2'),
      h3: makeHeading('h3'),
    },
    // Called at the start of every render pass of the owning unit so
    // re-renders (including StrictMode double-renders) resolve the same ids.
    resetIds: () => {
      localCounts = new Map()
    },
  }
}

type UnitRenderInfo = {
  components: Components
  resetIds: () => void
}

function buildUnitRenderInfos(
  toc: TocEntry[],
  unitContents: string[],
): UnitRenderInfo[] {
  const idsByHeadingText = new Map<string, string[]>()
  for (const entry of toc) {
    const key = entry.text.trim().toLowerCase()
    const list = idsByHeadingText.get(key) ?? []
    list.push(entry.id)
    idsByHeadingText.set(key, list)
  }

  const runningCounts = new Map<string, number>()

  return unitContents.map((content) => {
    const offsets = new Map(runningCounts)
    for (const text of extractHeadingTexts(content)) {
      runningCounts.set(text, (runningCounts.get(text) ?? 0) + 1)
    }
    return buildUnitHeadingComponents(idsByHeadingText, offsets)
  })
}

const MarkdownUnit = memo(function MarkdownUnit({
  content,
  unit,
}: {
  content: string
  unit: UnitRenderInfo
}) {
  // Deterministic per-pass id resolution (safe under StrictMode re-renders).
  unit.resetIds()
  return (
    <ReactMarkdown
      components={{ ...markdownCodeComponents, ...unit.components }}
      rehypePlugins={[rehypeRaw]}
      remarkPlugins={[remarkGfm]}
    >
      {content}
    </ReactMarkdown>
  )
})

function Reader({
  markdown,
  fileName,
  docKey,
  theme,
  themePreference,
  onSelectTheme,
  onHome,
  onOpenLibrary,
}: ReaderProps) {
  const [viewMode, setViewMode] = useState<DocumentViewMode>(
    () => loadReaderPreferences().viewMode,
  )
  const [pageSize, setPageSize] = useState<PageSize>(() => loadReaderPreferences().pageSize)
  const [activeHeadingId, setActiveHeadingId] = useState<string>('')
  const [pageZoom, setPageZoom] = useState(() => loadReaderPreferences().pageZoom)
  const [typeScale, setTypeScale] = useState(() => loadReaderPreferences().typeScale)
  const [typeLeading, setTypeLeading] = useState(
    () => loadReaderPreferences().typeLeading,
  )
  const [searchQuery, setSearchQuery] = useState('')
  const [flashSearchQuery, setFlashSearchQuery] = useState('')
  const [flashSearchSectionId, setFlashSearchSectionId] = useState('')
  const [flashAutoScroll, setFlashAutoScroll] = useState(false)
  const [flashSearchTick, setFlashSearchTick] = useState(0)
  const [measureTick, setMeasureTick] = useState(0)
  const [findCount, setFindCount] = useState(0)
  const [findIndex, setFindIndex] = useState(0)
  const findMarksRef = useRef<HTMLElement[]>([])
  const [pagedContent, setPagedContent] = useState<PageData[]>([
    { content: markdown, header: '' },
  ])
  const [externalDraft, setExternalDraft] = useState<{
    anchor: CommentAnchor
    tick: number
  } | null>(null)
  const [assistantPrefill, setAssistantPrefill] = useState<{
    text: string
    tick: number
  } | null>(null)

  const panels = usePanels()
  const { closeAll: closeAllPanels, open: openPanel, close: closePanel } = panels
  const tocOpen = panels.isOpen('toc')
  const searchOpen = panels.isOpen('search')
  const commentsOpen = panels.isOpen('comments')
  const assistantOpen = panels.isOpen('assistant')
  const { drawMode, laserMode, toggleDrawMode, toggleLaserMode, drawModeRef } =
    useReaderDrawMode(closeAllPanels)

  const measureHostRef = useRef<HTMLDivElement | null>(null)
  const tocPanelRef = useRef<HTMLElement | null>(null)
  const searchInputRef = useRef<HTMLInputElement | null>(null)
  const docColRef = useRef<HTMLDivElement | null>(null)
  const inkBinding = useMarkdownInkBinding(docColRef, pageZoom)
  const readerRootRef = useRef<HTMLDivElement | null>(null)
  const docStageRef = useRef<HTMLDivElement | null>(null)
  const pendingScrollAnchorRef = useRef<string | null>(null)
  const positionReadyRef = useRef(false)

  const commentSource = useMemo(
    () => ({ format: 'markdown' as const, markdown }),
    [markdown],
  )
  const {
    comments,
    activeCommentId,
    setActiveCommentId,
    addComment,
    updateComment,
    deleteComment,
  } = useDocumentComments(docKey, commentSource)

  const handleAddComment = useCallback(
    (anchor: Parameters<typeof addComment>[0], body: string) => {
      return addComment(anchor, body)
    },
    [addComment],
  )

  const normalizedMarkdown = useMemo(() => {
    if (!fileName.startsWith('clipboard.')) {
      return markdown
    }
    return normalizePastedText(markdown, 'markdown')
  }, [fileName, markdown])

  const displayMarkdown = useMemo(
    () =>
      commentsOpen
        ? injectCommentHighlights(normalizedMarkdown, comments)
        : normalizedMarkdown,
    [comments, commentsOpen, normalizedMarkdown],
  )

  const blocks = useMemo(() => splitMarkdownBlocks(displayMarkdown), [displayMarkdown])
  const blockMeta = useMemo(() => computeBlockMeta(blocks), [blocks])
  const cardContent = useMemo(
    () => splitMarkdownIntoCards(displayMarkdown),
    [displayMarkdown],
  )
  const toc = useMemo(() => extractToc(normalizedMarkdown), [normalizedMarkdown])
  const hasTopLevelChapters = useMemo(
    () => toc.some((entry) => entry.level === 1),
    [toc],
  )
  const searchIndex = useMemo(() => buildSearchSections(markdown), [markdown])
  const searchResults = useMemo(
    () => searchSections(searchIndex, searchQuery),
    [searchIndex, searchQuery],
  )
  const isPaged = viewMode === 'paged'
  const trimmedSearchQuery = searchQuery.trim()

  useEffect(() => {
    saveReaderPreferences({ viewMode, pageSize, pageZoom, typeScale, typeLeading })
  }, [viewMode, pageSize, pageZoom, typeScale, typeLeading])

  const activeChapterId = useMemo(() => {
    const activeEntry = toc.find((entry) => entry.id === activeHeadingId)
    if (!activeEntry) {
      if (hasTopLevelChapters) {
        return toc.find((entry) => entry.level === 1)?.id ?? ''
      }
      return toc.find((entry) => entry.level === 2)?.id ?? ''
    }
    if (activeEntry.level === 1) {
      return activeEntry.id
    }
    if (!hasTopLevelChapters && activeEntry.level === 3) {
      return activeEntry.sectionId
    }
    return activeEntry.chapterId
  }, [toc, activeHeadingId, hasTopLevelChapters])
  const activeSectionId = useMemo(() => {
    const activeEntry = toc.find((entry) => entry.id === activeHeadingId)
    if (!activeEntry) {
      return ''
    }
    return activeEntry.level === 3 ? activeEntry.sectionId : activeEntry.id
  }, [toc, activeHeadingId])

  // One render unit per page/card (or one for the whole continuous view),
  // each with deterministic heading-id components.
  const renderUnits = useMemo(() => {
    if (viewMode === 'paged') {
      return pagedContent
    }
    if (viewMode === 'cards') {
      return cardContent
    }
    return [{ content: displayMarkdown, header: '' }]
  }, [viewMode, pagedContent, cardContent, displayMarkdown])

  const unitRenderInfos = useMemo(
    () =>
      buildUnitRenderInfos(
        toc,
        renderUnits.map((unit) => unit.content),
      ),
    [toc, renderUnits],
  )

  // Reset reading position when the document changes.
  useEffect(() => {
    setActiveHeadingId('')
    closeAllPanels()
    setSearchQuery('')
    setFlashSearchQuery('')
    setFlashSearchSectionId('')
    setFlashAutoScroll(false)
    setFlashSearchTick(0)
    pendingScrollAnchorRef.current = null
  }, [markdown, closeAllPanels])

  // Restore the last reading position (deep-link hashes win).
  useEffect(() => {
    positionReadyRef.current = false
    const saved = window.location.hash ? null : loadReadingPosition(docKey)
    if (saved?.anchorId) {
      pendingScrollAnchorRef.current = saved.anchorId
    }
    const timer = window.setTimeout(() => {
      positionReadyRef.current = true
    }, 1200)
    return () => window.clearTimeout(timer)
  }, [docKey])

  // Remember where the reader is, per document.
  useEffect(() => {
    if (!positionReadyRef.current || !activeHeadingId) {
      return
    }
    saveReadingPosition(docKey, {
      anchorId: activeHeadingId,
      progress: currentScrollProgress(),
      updatedAt: Date.now(),
    })
  }, [activeHeadingId, docKey])

  useEffect(() => {
    if (!flashSearchQuery || flashSearchTick === 0) {
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    let cleanup = () => {}
    const startDelay = window.setTimeout(() => {
      cleanup = flashHighlightInDocument(
        scope,
        flashSearchQuery,
        flashSearchSectionId,
        flashAutoScroll,
      )
    }, 260)

    const timer = window.setTimeout(() => {
      cleanup()
    }, 3860)

    return () => {
      window.clearTimeout(startDelay)
      window.clearTimeout(timer)
      cleanup()
    }
  }, [
    flashAutoScroll,
    flashSearchQuery,
    flashSearchSectionId,
    flashSearchTick,
    viewMode,
    pagedContent,
    cardContent,
  ])

  // Persistent find: highlight every match while the panel has a query.
  useEffect(() => {
    if (!searchOpen || !trimmedSearchQuery) {
      findMarksRef.current = []
      setFindCount(0)
      setFindIndex(0)
      return
    }

    const scope = docColRef.current
    if (!scope) {
      return
    }

    let controller: FindHighlights | null = null
    const timer = window.setTimeout(() => {
      controller = applyFindHighlights(scope, trimmedSearchQuery)
      findMarksRef.current = controller.marks
      setFindCount(controller.marks.length)
      setFindIndex(0)
    }, 220)

    return () => {
      window.clearTimeout(timer)
      controller?.clear()
      findMarksRef.current = []
    }
  }, [searchOpen, trimmedSearchQuery, viewMode, pagedContent, cardContent, displayMarkdown])

  // Track the current match: accent it and bring it into view.
  useEffect(() => {
    const marks = findMarksRef.current
    if (marks.length === 0) {
      return
    }

    marks.forEach((mark, index) => {
      mark.classList.toggle('find-current', index === findIndex)
    })
    marks[findIndex]?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [findIndex, findCount])

  const stepFind = useCallback((direction: 1 | -1) => {
    setFindIndex((current) => {
      const count = findMarksRef.current.length
      if (count === 0) {
        return 0
      }
      return (current + direction + count) % count
    })
  }, [])

  const focusSearchInput = useCallback(() => {
    window.requestAnimationFrame(() => {
      searchInputRef.current?.focus()
      searchInputRef.current?.select()
    })
  }, [])

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

  const changePageZoom = useCallback(
    (zoom: number) => {
      setPageZoom((current) => {
        const clamped = clampPageZoom(zoom)
        if (clamped === current) {
          return current
        }
        captureScrollAnchor()
        return clamped
      })
    },
    [captureScrollAnchor],
  )

  const changeTypeScale = useCallback(
    (value: number) => {
      setTypeScale((current) => {
        const next = clampTypeScale(value)
        if (next === current) {
          return current
        }
        captureScrollAnchor()
        return next
      })
    },
    [captureScrollAnchor],
  )

  const changeTypeLeading = useCallback(
    (value: number) => {
      setTypeLeading((current) => {
        if (value === current) {
          return current
        }
        captureScrollAnchor()
        return value
      })
    },
    [captureScrollAnchor],
  )

  const stepZoom = useCallback(
    (direction: 'in' | 'out') => {
      setPageZoom((current) => {
        const next = stepPageZoom(current, direction)
        if (next === current) {
          return current
        }
        captureScrollAnchor()
        return next
      })
    },
    [captureScrollAnchor],
  )

  useEffect(() => {
    const root = readerRootRef.current
    if (!root) {
      return
    }

    return attachDocumentZoomWheel(root, (direction) => {
      if (drawModeRef.current) {
        return
      }
      stepZoom(direction)
    })
  }, [stepZoom])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (!drawModeRef.current && applyZoomKeyboardShortcut(event, stepZoom)) {
        return
      }

      if (!isEditableKeyboardTarget(event.target) && event.key === '/') {
        event.preventDefault()
        openPanel('search')
        focusSearchInput()
      }
    }

    document.addEventListener('keydown', onKeyDown)
    return () => document.removeEventListener('keydown', onKeyDown)
  }, [focusSearchInput, openPanel, stepZoom])

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
  }, [viewMode, pageSize, pageZoom, typeScale, typeLeading, pagedContent, cardContent, comments])

  // Layout-aware pagination: measure real element heights off-screen, then
  // pack blocks into pages (pure algorithm in markdown/paginate.ts).
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

    // Images load after first measure; re-measure when they settle so page
    // breaks account for real image heights.
    const pendingImages = Array.from(
      pageEl.querySelectorAll<HTMLImageElement>('img'),
    ).filter((img) => !img.complete)
    const onImageSettled = () => setMeasureTick((tick) => tick + 1)
    for (const img of pendingImages) {
      img.addEventListener('load', onImageSettled, { once: true })
      img.addEventListener('error', onImageSettled, { once: true })
    }

    const sampleLine = pageEl.querySelector<HTMLElement>('p, li, h2, h3')
    const lineHeightPx = sampleLine
      ? parseFloat(getComputedStyle(sampleLine).lineHeight) || 25
      : 25
    const WIDOW_LINES = 4

    const nextPages = packBlocksIntoPages({
      blocks,
      meta: blockMeta,
      measurements: children.map((element) => ({
        top: element.offsetTop,
        height: element.offsetHeight,
      })),
      contentHeightPx: pageContentHeightPx(pageSize),
      widowThresholdPx: lineHeightPx * WIDOW_LINES,
    })

    setPagedContent(
      nextPages.length > 0
        ? nextPages
        : [{ content: displayMarkdown, header: blockMeta[0]?.header ?? '' }],
    )

    return () => {
      for (const img of pendingImages) {
        img.removeEventListener('load', onImageSettled)
        img.removeEventListener('error', onImageSettled)
      }
    }
  }, [blocks, blockMeta, displayMarkdown, isPaged, pageSize, measureTick, typeScale, typeLeading])

  // Scroll-spy: activate the heading occupying the reading zone (~35% down).
  useEffect(() => {
    if (toc.length === 0) {
      setActiveHeadingId('')
      return
    }

    const scope = docColRef.current
    const headingIds = toc.map((item) => item.id)

    const onScroll = () => {
      if (drawModeRef.current) {
        return
      }

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

      closePanel('toc')
    },
    [toc, closePanel],
  )

  const navigateToHeading = (event: MouseEvent<HTMLAnchorElement>, id: string) => {
    event.preventDefault()
    navigateToSection(id)
  }

  // Selection menu: resolve the comment anchor from the live selection BEFORE
  // comment mode re-renders the document (which clears the selection).
  const commentOnSelection = useCallback(() => {
    const scope = docColRef.current
    const selection = window.getSelection()
    if (!scope || !selection || selection.isCollapsed || selection.rangeCount === 0) {
      return
    }

    const anchor = resolveSelectionAnchor(markdown, selection, scope, toc)
    if (!anchor) {
      return
    }

    setExternalDraft({ anchor, tick: Date.now() })
    openPanel('comments')
  }, [markdown, openPanel, toc])

  const askAboutSelection = useCallback(
    (text: string) => {
      const quoted = text.length > 600 ? `${text.slice(0, 600)}…` : text
      setAssistantPrefill({
        text: `Regarding this passage:\n\n"${quoted}"\n\n`,
        tick: Date.now(),
      })
      openPanel('assistant')
    },
    [openPanel],
  )

  const askQuery = useCallback(
    (text: string) => {
      setAssistantPrefill({ text, tick: Date.now() })
      openPanel('assistant')
    },
    [openPanel],
  )

  const tocRailSections = useMemo(
    () => toc.filter((entry) => entry.level <= 2),
    [toc],
  )

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
    '--type-scale': typeScale,
    ...(typeLeading > 0 ? { '--type-leading': typeLeading } : {}),
  } as CSSProperties

  const pageZoomPercent = Math.round(pageZoom * 100)

  const topbarActions: TopbarAction[] = [
    {
      id: 'toc',
      label: 'Contents',
      icon: <ContentsIcon />,
      active: tocOpen,
      onToggle: () => panels.toggle('toc'),
    },
    {
      id: 'search',
      label: 'Search',
      icon: <SearchIcon />,
      active: searchOpen || Boolean(trimmedSearchQuery),
      onToggle: () => {
        panels.toggle('search')
        if (!searchOpen) {
          focusSearchInput()
        }
      },
    },
    {
      id: 'comments',
      label: 'Comments',
      icon: <CommentsIcon />,
      active: commentsOpen,
      badge: comments.length || undefined,
      onToggle: () => panels.toggle('comments'),
    },
    {
      id: 'assistant',
      label: 'Ask',
      icon: <AskIcon />,
      active: assistantOpen,
      onToggle: () => panels.toggle('assistant'),
    },
    createDrawTopbarAction(drawMode, toggleDrawMode),
    createLaserTopbarAction(laserMode, toggleLaserMode),
  ]

  const settingsContent = (
    <>
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
            onClick={() => stepZoom('out')}
            disabled={pageZoom <= PAGE_ZOOM_MIN}
          >
            −
          </button>
          <input
            type="range"
            className="scale-slider"
            min={PAGE_ZOOM_MIN * 100}
            max={PAGE_ZOOM_MAX * 100}
            step={1}
            value={pageZoomPercent}
            aria-label="Page scale"
            onChange={(event) => changePageZoom(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            className="scale-step"
            aria-label="Zoom in"
            onClick={() => stepZoom('in')}
            disabled={pageZoom >= PAGE_ZOOM_MAX}
          >
            +
          </button>
        </div>
      </div>

      <div className="settings-group">
        <div className="settings-label-row">
          <p className="settings-label">Text size</p>
          <span className="scale-value" aria-live="polite">
            {Math.round(typeScale * 100)}%
          </span>
        </div>
        <div className="scale-control">
          <button
            type="button"
            className="scale-step"
            aria-label="Smaller text"
            onClick={() => changeTypeScale(typeScale - 0.05)}
            disabled={typeScale <= TYPE_SCALE_MIN}
          >
            −
          </button>
          <input
            type="range"
            className="scale-slider"
            min={TYPE_SCALE_MIN * 100}
            max={TYPE_SCALE_MAX * 100}
            step={5}
            value={Math.round(typeScale * 100)}
            aria-label="Text size"
            onChange={(event) => changeTypeScale(Number(event.target.value) / 100)}
          />
          <button
            type="button"
            className="scale-step"
            aria-label="Larger text"
            onClick={() => changeTypeScale(typeScale + 0.05)}
            disabled={typeScale >= TYPE_SCALE_MAX}
          >
            +
          </button>
        </div>
      </div>

      <div className="settings-group">
        <p className="settings-label">Line spacing</p>
        <div className="segmented">
          {TYPE_LEADING_OPTIONS.map((option) => (
            <button
              type="button"
              key={option.label}
              className={typeLeading === option.value ? 'seg active' : 'seg'}
              onClick={() => changeTypeLeading(option.value)}
            >
              {option.label}
            </button>
          ))}
        </div>
      </div>

      <ThemePicker preference={themePreference} onSelect={onSelectTheme} />
    </>
  )

  const paletteGroups = [
    sectionsPaletteGroup(documentSections, navigateToSection),
    actionsPaletteGroup([
      {
        id: 'toggle-toc',
        title: 'Toggle contents',
        keywords: 'toc outline headings',
        action: () => panels.toggle('toc'),
      },
      {
        id: 'search',
        title: 'Search document',
        keywords: 'find text',
        action: () => {
          openPanel('search')
          focusSearchInput()
        },
      },
      {
        id: 'comments',
        title: 'Toggle comments',
        keywords: 'notes annotate',
        action: () => panels.toggle('comments'),
      },
      {
        id: 'ask',
        title: 'Ask about this document',
        keywords: 'ai assistant chat',
        action: () => panels.toggle('assistant'),
      },
      createDrawPaletteAction(toggleDrawMode),
      createLaserPaletteAction(toggleLaserMode),
      {
        id: 'view-continuous',
        title: 'View: Continuous',
        keywords: 'layout mode scroll',
        action: () => changeViewMode('continuous'),
      },
      {
        id: 'view-cards',
        title: 'View: Cards',
        keywords: 'layout mode',
        action: () => changeViewMode('cards'),
      },
      {
        id: 'view-pages',
        title: 'View: Pages',
        keywords: 'layout mode paper paged',
        action: () => changeViewMode('paged'),
      },
      {
        id: 'library',
        title: 'Back to library',
        keywords: 'home close',
        action: onHome,
      },
    ]),
    libraryPaletteGroup(onOpenLibrary, fileName),
    themePaletteGroup(themePreference, onSelectTheme),
  ]

  return (
    <div
      className="reader-root"
      ref={readerRootRef}
      data-draw-mode={drawMode ? 'true' : undefined}
      data-laser-mode={laserMode ? 'true' : undefined}
    >
      <CommandPalette groups={paletteGroups} onAskQuery={askQuery} />
      <InkAnnotation docKey={docKey} drawMode={drawMode} laserMode={laserMode} {...inkBinding} />
      <LaserPointer active={laserMode} />
      <SelectionMenu
        scopeRef={docColRef}
        disabled={commentsOpen || drawMode}
        actions={[
          { id: 'comment', label: 'Comment', onRun: () => commentOnSelection() },
          { id: 'ask', label: 'Ask', onRun: askAboutSelection },
          {
            id: 'copy',
            label: 'Copy',
            onRun: (text) => {
              void navigator.clipboard?.writeText(text)
            },
          },
        ]}
      />
      <TocRail
        sections={tocRailSections}
        activeId={activeSectionId || activeChapterId}
        hidden={tocOpen || commentsOpen || drawMode}
        onNavigate={navigateToSection}
      />
      <Lightbox scopeRef={docColRef} />
      <ReaderTopbar
        fileName={fileName}
        onHome={onHome}
        actions={topbarActions}
        settings={settingsContent}
      />

      <DocAssistant
        open={assistantOpen}
        onClose={() => panels.close('assistant')}
        markdown={markdown}
        fileName={fileName}
        sections={documentSections}
        onNavigateToSection={navigateToSection}
        prefill={assistantPrefill}
      />

      <DocComments
        open={commentsOpen}
        onClose={() => panels.close('comments')}
        docColRef={docColRef}
        markdown={markdown}
        toc={toc}
        comments={comments}
        activeCommentId={activeCommentId}
        setActiveCommentId={setActiveCommentId}
        onAddComment={handleAddComment}
        onUpdateComment={updateComment}
        onDeleteComment={deleteComment}
        externalDraft={externalDraft}
      />

      <SearchPanel
        open={searchOpen}
        onClose={() => panels.close('search')}
        query={searchQuery}
        onQueryChange={setSearchQuery}
        inputRef={searchInputRef}
        placeholder="Search headings and sections"
        resultNoun="section"
        results={searchResults}
        find={{ count: findCount, index: findIndex, onStep: stepFind }}
        onSelect={(result) => {
          navigateToSection(result.id)
          if (trimmedSearchQuery) {
            setFlashSearchQuery(trimmedSearchQuery)
            setFlashSearchSectionId(result.id)
            setFlashAutoScroll(
              result.reason !== 'Strong heading match' &&
                result.reason !== 'Exact heading match',
            )
            setFlashSearchTick(Date.now())
          }
        }}
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
                shouldShowTocEntry(
                  entry,
                  activeChapterId,
                  activeSectionId,
                  hasTopLevelChapters,
                ) ? (
                  <a
                    key={entry.id}
                    href={`#${entry.id}`}
                    onClick={(event) => navigateToHeading(event, entry.id)}
                    className={[
                      'toc-link',
                      `toc-l${entry.level}`,
                      activeHeadingId === entry.id ? 'active' : '',
                      (entry.level === 1 && entry.id === activeChapterId) ||
                      (!hasTopLevelChapters &&
                        entry.level === 2 &&
                        entry.id === activeChapterId)
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
                {renderUnits.map((pageData, index) => (
                  <article className="paper-page" key={`page-${index}`}>
                    <div className="page-running-header">{pageData.header}</div>
                    <div className="page-body">
                      {unitRenderInfos[index] ? (
                        <MarkdownUnit
                          content={pageData.content}
                          unit={unitRenderInfos[index]}
                        />
                      ) : null}
                    </div>
                    <div className="page-number">{index + 1}</div>
                  </article>
                ))}
              </section>
            ) : viewMode === 'cards' ? (
              <section className="card-stack">
                {renderUnits.map((cardData, index) => (
                  <article className="paper-scroll paper-card" key={`card-${index}`}>
                    {unitRenderInfos[index] ? (
                      <MarkdownUnit
                        content={cardData.content}
                        unit={unitRenderInfos[index]}
                      />
                    ) : null}
                  </article>
                ))}
              </section>
            ) : (
              <article className="paper-scroll">
                {unitRenderInfos[0] ? (
                  <MarkdownUnit content={displayMarkdown} unit={unitRenderInfos[0]} />
                ) : null}
              </article>
            )}
          </div>
        </div>

        {drawMode ? null : <LinkPreview scopeRef={docColRef} />}

        {isPaged ? (
          <div className="measure-host" ref={measureHostRef} aria-hidden="true">
            <div className="paper-page measure-page">
              <ReactMarkdown
                components={markdownCodeComponents}
                rehypePlugins={[rehypeRaw]}
                remarkPlugins={[remarkGfm]}
              >
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
