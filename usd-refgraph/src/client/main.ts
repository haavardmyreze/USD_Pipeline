import './styles.css'

import type { ArcKind, Capabilities, Graph } from '@shared/types'
import { ApiFailure, getCapabilities, getGraph, reveal } from './api'
import { DropZone } from './ui/dropzone'
import { collapseToAssemblies } from './graph/collapse'
import { GraphView } from './graph/view'
import { Inspector, toast } from './ui/inspector'
import { FilePicker } from './ui/picker'
import { Sidebar, type RecentFile } from './ui/sidebar'
import { debounce, matches, must, truncateStart } from './util'

const RECENT_KEY = 'usd-refgraph:recent'
const MAX_RECENT = 6

class App {
  private graph: Graph | null = null
  /** The graph as drawn: the full crawl, or the collapsed assembly view. */
  private displayed: Graph | null = null
  private rootPath: string | null = null
  private selectedId: string | null = null

  /** Arc kinds the user has switched off in the legend or the toolbar. */
  private hiddenArcs = new Set<ArcKind>()
  private missingOnly = false
  /** Collapse the graph to assembly files, hiding the blocks between them. */
  private assembliesOnly = false
  private query = ''
  private busy = false

  private readonly view: GraphView
  private readonly sidebar: Sidebar
  private readonly inspector: Inspector
  private readonly picker: FilePicker
  private readonly dropzone: DropZone

  private readonly els = {
    stage: must<HTMLElement>('#stage'),
    empty: must<HTMLElement>('#empty'),
    loading: must<HTMLElement>('#loading'),
    loadingText: must<HTMLElement>('#loading-text'),
    rootName: must<HTMLElement>('#root-name'),
    rootPath: must<HTMLElement>('#root-path'),
    search: must<HTMLInputElement>('#search'),
    zoomLevel: must<HTMLElement>('#zoom-level'),
    rescan: must<HTMLButtonElement>('#btn-rescan'),
    textures: must<HTMLButtonElement>('#toggle-textures'),
    missing: must<HTMLButtonElement>('#toggle-missing'),
    assemblies: must<HTMLButtonElement>('#toggle-assemblies'),
  }

  constructor(capabilities: Capabilities) {
    this.picker = new FilePicker(capabilities)

    this.view = new GraphView(
      this.els.stage,
      must<HTMLElement>('#viewport'),
      must<HTMLElement>('#grid'),
      must<SVGSVGElement>('#edges'),
      must<SVGGElement>('#edge-layer'),
      must<HTMLElement>('#nodes'),
      {
        onSelect: (id) => this.select(id),
        onSetRoot: (id) => this.setRootFromNode(id),
        onZoom: (scale) => {
          this.els.zoomLevel.textContent = `${Math.round(scale * 100)}%`
        },
      },
    )

    this.sidebar = new Sidebar({
      onToggleArc: (kind) => this.toggleArc(kind),
      onFocusNode: (id) => {
        this.select(id)
        this.view.focusNode(id)
      },
      onOpenRecent: (path) => void this.load(path),
    })

    this.inspector = new Inspector({
      onSelect: (id) => {
        this.select(id)
        this.view.focusNode(id)
      },
      onSetRoot: (id) => this.setRootFromNode(id),
      onReveal: (path) => {
        void reveal(path).catch(() => toast('Could not open the file manager', 'error'))
      },
      onToast: (message, kind) => toast(message, kind),
    })

    this.dropzone = new DropZone({
      searchRoots: () => this.searchRoots(),
      onOpen: (path) => void this.load(path),
      onToast: (message, kind) => toast(message, kind),
      onBrowse: (name) => void this.browseFor(name),
    })

    this.bindChrome()
    this.sidebar.update(null, this.hiddenArcs)
    this.sidebar.setRecent(this.readRecent())
  }

  // -- loading ------------------------------------------------------------

  async load(path: string): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.els.loading.hidden = false
    this.els.loadingText.textContent = `Crawling ${path.split(/[\\/]/).pop() ?? path}…`
    this.els.rescan.classList.add('is-spinning')

    try {
      const graph = await getGraph(path, { includeAssets: true })
      this.graph = graph
      this.rootPath = path
      this.selectedId = null
      this.inspector.hide()

      const rootNode = graph.nodes.find((n) => n.id === graph.rootId)
      this.els.rootName.textContent = rootNode?.name ?? path
      this.els.rootPath.textContent = truncateStart(rootNode?.dir ?? path, 60)
      this.els.empty.hidden = true

      this.rememberRecent(path, rootNode?.name ?? path, rootNode?.dir ?? '')
      this.redraw()
      this.view.fit(false)

      if (graph.stats.missing > 0) {
        toast(
          `${graph.stats.missing} referenced ${
            graph.stats.missing === 1 ? 'file is' : 'files are'
          } missing`,
          'error',
        )
      }
    } catch (error) {
      const failure = error instanceof ApiFailure ? error : null
      toast(failure?.detail ?? failure?.message ?? 'Could not read that file', 'error')
    } finally {
      this.busy = false
      this.els.loading.hidden = true
      this.els.rescan.classList.remove('is-spinning')
    }
  }

  private setRootFromNode(id: string): void {
    const node = this.graph?.nodes.find((n) => n.id === id)
    if (!node) return
    if (node.kind !== 'layer') {
      toast(`${node.name} is not a USD layer`, 'error')
      return
    }
    if (!node.exists) {
      toast(`${node.name} is missing on disk`, 'error')
      return
    }
    void this.load(node.path)
  }

  // -- filtering ----------------------------------------------------------

  /**
   * Which nodes survive the current filters: walk out from the root using only
   * arcs the user has left switched on, so hiding "textures" also removes any
   * file that was only reachable through one.
   */
  private computeVisible(graph: Graph): Set<string> {
    const allowed = graph.edges.filter((e) => !this.hiddenArcs.has(e.kind))

    const forward = new Map<string, string[]>()
    for (const edge of allowed) {
      const list = forward.get(edge.from)
      if (list) list.push(edge.to)
      else forward.set(edge.from, [edge.to])
    }

    const visible = new Set<string>([graph.rootId])
    const queue = [graph.rootId]
    while (queue.length) {
      const current = queue.shift()!
      for (const next of forward.get(current) ?? []) {
        if (visible.has(next)) continue
        visible.add(next)
        queue.push(next)
      }
    }

    if (!this.missingOnly) return visible

    // Keep only broken files and whatever points at them, so the graph
    // collapses to just the problem.
    const broken = new Set(
      graph.nodes.filter((n) => visible.has(n.id) && !n.exists && !n.template).map((n) => n.id),
    )
    const kept = new Set<string>([graph.rootId, ...broken])
    for (const edge of allowed) {
      if (broken.has(edge.to)) kept.add(edge.from)
    }
    return kept
  }

  private redraw(): void {
    if (!this.graph) return
    // The sidebar keeps reporting the whole crawl: filters change the view,
    // not what is on disk, and a hidden missing file is still missing.
    const display = this.assembliesOnly
      ? collapseToAssemblies(this.graph)
      : this.graph
    this.displayed = display
    const visible = this.computeVisible(display)
    this.view.render(display, visible)
    this.view.select(this.selectedId)
    this.applyQuery()
    this.sidebar.update(this.graph, this.hiddenArcs)
  }

  private applyQuery(): void {
    if (!this.graph || !this.query) {
      this.view.setHighlight(new Set())
      return
    }
    const hits = new Set(
      this.graph.nodes
        .filter(
          (n) =>
            matches(n.name, this.query) ||
            matches(n.relDir, this.query) ||
            matches(n.path, this.query),
        )
        .map((n) => n.id),
    )
    this.view.setHighlight(hits)
  }

  private toggleArc(kind: ArcKind): void {
    if (this.hiddenArcs.has(kind)) this.hiddenArcs.delete(kind)
    else this.hiddenArcs.add(kind)
    this.els.textures.classList.toggle('is-on', !this.hiddenArcs.has('asset'))
    this.redraw()
  }

  private select(id: string | null): void {
    this.selectedId = id
    this.view.select(id)
    // Describe the graph as drawn, so the arcs listed are the arcs on screen.
    const source = this.displayed ?? this.graph
    if (id && source) this.inspector.show(source, id)
    else this.inspector.hide()
  }

  // -- chrome -------------------------------------------------------------

  /** Directories a dropped file is most likely to live in or under. */
  private searchRoots(): string[] {
    const dirs: string[] = []
    const add = (dir: string | undefined): void => {
      if (dir && !dirs.includes(dir)) dirs.push(dir)
    }
    add(this.rootPath ? dirOf(this.rootPath) : undefined)
    for (const file of this.readRecent()) add(file.dir)
    return dirs
  }

  private async openPicker(startDir?: string, prefill?: string): Promise<void> {
    const start =
      startDir ?? (this.rootPath ? dirOf(this.rootPath) : undefined)
    const chosen = await this.picker.open(start, prefill)
    if (chosen) void this.load(chosen)
  }

  /** Fall back to browsing when a dropped file could not be found on disk. */
  private async browseFor(name: string): Promise<void> {
    await this.openPicker(undefined, name)
  }

  private bindChrome(): void {
    const openPicker = (): void => void this.openPicker()

    must<HTMLButtonElement>('#open-file').addEventListener('click', openPicker)
    must<HTMLButtonElement>('#empty-open').addEventListener('click', openPicker)

    this.els.rescan.addEventListener('click', () => {
      if (this.rootPath) void this.load(this.rootPath)
    })

    must<HTMLButtonElement>('#btn-fit').addEventListener('click', () => this.view.fit())
    must<HTMLButtonElement>('#zoom-in').addEventListener('click', () => this.view.zoomBy(1.25))
    must<HTMLButtonElement>('#zoom-out').addEventListener('click', () => this.view.zoomBy(0.8))
    this.els.zoomLevel.addEventListener('click', () => this.view.resetZoom())

    this.els.textures.addEventListener('click', () => this.toggleArc('asset'))

    this.els.assemblies.addEventListener('click', () => {
      this.assembliesOnly = !this.assembliesOnly
      this.els.assemblies.classList.toggle('is-on', this.assembliesOnly)
      this.redraw()
      this.view.fit()
    })

    this.els.missing.addEventListener('click', () => {
      this.missingOnly = !this.missingOnly
      this.els.missing.classList.toggle('is-on', this.missingOnly)
      this.redraw()
      this.view.fit()
    })

    const onSearch = debounce(() => {
      this.query = this.els.search.value.trim()
      this.applyQuery()
    }, 110)
    this.els.search.addEventListener('input', onSearch)

    document.addEventListener('keydown', (event) => {
      const inField =
        event.target instanceof HTMLInputElement ||
        event.target instanceof HTMLTextAreaElement
      // Modals own their own keys while they are up.
      if (!must<HTMLElement>('#picker').hidden) return
      if (!must<HTMLElement>('#chooser').hidden) return

      if (event.key === '/' && !inField) {
        event.preventDefault()
        this.els.search.focus()
        this.els.search.select()
        return
      }
      if (event.key === 'Escape') {
        if (inField) {
          this.els.search.value = ''
          this.query = ''
          this.applyQuery()
          this.els.search.blur()
        } else {
          this.select(null)
        }
        return
      }
      if (inField) return

      if (event.key === 'f') this.view.fit()
      else if (event.key === 'r' && this.rootPath) void this.load(this.rootPath)
      else if (event.key === 'o') openPicker()
      else if (event.key === '=' || event.key === '+') this.view.zoomBy(1.25)
      else if (event.key === '-') this.view.zoomBy(0.8)
    })

    window.addEventListener('resize', debounce(() => {
      if (this.graph) this.view.fit(false)
    }, 180))
  }

  // -- recent files -------------------------------------------------------

  private readRecent(): RecentFile[] {
    try {
      const raw = localStorage.getItem(RECENT_KEY)
      return raw ? (JSON.parse(raw) as RecentFile[]) : []
    } catch {
      return []
    }
  }

  private rememberRecent(path: string, name: string, dir: string): void {
    const entries = this.readRecent().filter((f) => f.path !== path)
    entries.unshift({ path, name, dir })
    const trimmed = entries.slice(0, MAX_RECENT)
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(trimmed))
    } catch {
      /* private mode, or storage disabled — the list is a convenience only */
    }
    this.sidebar.setRecent(trimmed)
  }
}

/** The directory part of a path, in either slash style. */
function dirOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

async function boot(): Promise<void> {
  try {
    const capabilities = await getCapabilities()
    const app = new App(capabilities)

    // Allow `?path=…` so a shell alias or shelf tool can deep-link a file.
    const wanted = new URLSearchParams(location.search).get('path')
    if (wanted) void app.load(wanted)
  } catch {
    toast('The crawler is not responding. Is the Python backend running?', 'error')
  }
}

void boot()
