// SF on Apple platforms; Inter, with its optical-size axis, everywhere else.
import '@fontsource-variable/inter/opsz.css'
import './styles.css'

import type { ArcKind, Capabilities, Graph } from '@shared/types'
import type { Project, ProjectLayer } from '@shared/project'
import { ApiFailure, getCapabilities, getGraph, getProject, reveal } from './api'
import { renderArtists } from './ui/pages/artists'
import { renderCalendar } from './ui/pages/calendar'
import { renderOverview } from './ui/pages/overview'
import { renderWorkfiles } from './ui/pages/workfiles'
import { renderWorkspace } from './ui/pages/workspace'
import {
  resetPageState,
  type PageContext,
  type PageName,
} from './ui/pages/context'
import { ProjectTree } from './ui/tree'
import { DropZone } from './ui/dropzone'
import { collapseToAssemblies } from './graph/collapse'
import { GraphView } from './graph/view'
import { Inspector, toast } from './ui/inspector'
import { SceneTree } from './ui/scene'
import { FilePicker } from './ui/picker'
import { ShortcutSheet } from './ui/shortcuts'
import { ArcBar, STRUCTURAL_ARCS } from './ui/arcbar'
import { button, emptyState } from './ui/kit'
import { copyText, debounce, displayName, matches, must, nextFrame, truncateStart } from './util'
import { dismiss, isPresent, present } from './ui/presence'
import { readRecord } from '@shared/pipeline'

const RECENT_KEY = 'usd-refgraph:recent'
const MAX_RECENT = 6

/** What the app can open as a single layer, as opposed to a project folder. */
const USD_FILE_RE = /\.(usd|usda|usdc|usdz)$/i

/** Which page each number key selects, in the order the nav lists them. */
const PAGE_KEYS: PageName[] = [
  'overview',
  'workspace',
  'artists',
  'calendar',
  'workfiles',
  'graph',
]

/** A place the user has opened before, kept so the picker can start there. */
interface RecentFile {
  path: string
  name: string
  dir: string
}

class App {
  private graph: Graph | null = null
  /** The graph as drawn: the full crawl, or the collapsed assembly view. */
  private displayed: Graph | null = null
  /** The scanned project tree, when the open file sits inside one. */
  private project: Project | null = null
  private page: PageName = 'overview'
  private rootPath: string | null = null
  private selectedId: string | null = null

  /**
   * The file open in the panel on a project page: its path, picked from a
   * list, and a shallow crawl from it once that arrives.
   */
  private filePanel: { path: string; graph: Graph | null } | null = null
  /** Bumped per pick, so a slow crawl cannot land after a newer one. */
  private filePanelToken = 0

  /** Arc kinds the user has switched off in the legend or the toolbar. */
  private hiddenArcs = new Set<ArcKind>()
  private missingOnly = false
  /** Collapse the graph to assembly files, hiding the blocks between them. */
  private assembliesOnly = false
  private query = ''
  private busy = false

  private readonly view: GraphView
  private readonly arcbar: ArcBar
  private readonly inspector: Inspector
  private readonly scene: SceneTree
  private readonly picker: FilePicker
  private readonly dropzone: DropZone
  private readonly tree: ProjectTree
  private readonly shortcuts: ShortcutSheet

  private readonly els = {
    stage: must<HTMLElement>('#stage'),
    empty: must<HTMLElement>('#empty'),
    loading: must<HTMLElement>('#loading'),
    loadingText: must<HTMLElement>('#loading-text'),
    rootName: must<HTMLElement>('#root-name'),
    rootPath: must<HTMLElement>('#root-path'),
    rootDot: must<HTMLElement>('#root-dot'),
    layerPop: must<HTMLElement>('#layer-pop'),
    openLayer: must<HTMLButtonElement>('#open-layer'),
    missingCount: must<HTMLElement>('#missing-count'),
    graphStats: must<HTMLElement>('#graph-stats'),
    search: must<HTMLInputElement>('#search'),
    zoomLevel: must<HTMLElement>('#zoom-level'),
    rescan: must<HTMLButtonElement>('#btn-rescan'),
    textures: must<HTMLButtonElement>('#toggle-textures'),
    missing: must<HTMLButtonElement>('#toggle-missing'),
    assemblies: must<HTMLButtonElement>('#toggle-assemblies'),
    projectName: must<HTMLElement>('#project-name'),
    projectPath: must<HTMLElement>('#project-path'),
    caps: must<HTMLElement>('#caps-line'),
  }

  constructor(capabilities: Capabilities) {
    this.picker = new FilePicker(capabilities)
    this.shortcuts = new ShortcutSheet()

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

    this.arcbar = new ArcBar({
      onChange: (hidden) => {
        // Textures belong to their own toggle; keep whatever it says.
        const next = new Set(hidden)
        if (this.hiddenArcs.has('asset')) next.add('asset')
        else next.delete('asset')
        this.hiddenArcs = next
        this.redraw()
      },
    })

    // A link inside the panel selects in whatever the panel is describing: the
    // graph on the Graph page, the panel itself on a project page.
    const selectFromPanel = (id: string, path?: string): void => {
      if (this.page === 'graph') {
        this.select(id)
        this.view.focusNode(id)
      } else {
        this.selectInFilePanel(id, path)
      }
    }

    this.scene = new SceneTree({
      onSelectLayer: (id, path) => selectFromPanel(id, path),
      // Off the graph, any layer on disk can be opened in the panel by path.
      hasLayer: (id) =>
        this.page !== 'graph' || Boolean(this.displayed?.nodes.some((node) => node.id === id)),
      onToast: (message, kind) => toast(message, kind),
    })

    this.inspector = new Inspector(
      {
        onSelect: (id) => selectFromPanel(id),
        onSetRoot: (id) => this.setRootFromNode(id),
        onReveal: (path) => this.reveal(path),
        onToast: (message, kind) => toast(message, kind),
        onLayout: () => this.fitAroundPanel(),
        onClose: () => {
          if (this.page === 'graph') this.select(null)
          else this.closeFilePanel()
        },
        onOpenInGraph: (path) => {
          this.showPage('graph')
          void this.load(path)
        },
      },
      this.scene,
    )

    this.tree = new ProjectTree(must<HTMLElement>('#tree'), {
      onPick: (layer) => {
        this.toggleLayerPop(false)
        void this.load(layer.path)
      },
    })

    this.dropzone = new DropZone({
      searchRoots: () => this.searchRoots(),
      onOpen: (path) => void this.load(path),
      onToast: (message, kind) => toast(message, kind),
      onBrowse: (name) => void this.browseFor(name),
    })

    this.showCapabilities(capabilities)
    this.bindChrome()
    this.showPage('overview')
  }

  // -- loading ------------------------------------------------------------

  async load(path: string): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.els.loading.hidden = false
    this.els.loadingText.textContent = `Reading ${path.split(/[\\/]/).pop() ?? path}…`
    this.els.rescan.classList.add('is-spinning')

    // Scan only when we do not already have the project this file belongs to —
    // clicking through the tree should not rescan the tree.
    if (!this.project) void this.loadProject(path)

    try {
      const graph = await getGraph(path, { includeAssets: true })
      this.graph = graph
      this.rootPath = path
      this.selectedId = null
      // The crawl just re-read every layer from disk, so a remembered tree or
      // file text may describe files that have since changed.
      this.inspector.reset()
      // A load can run behind a project page, after a scan; the panel there
      // belongs to that page and stays open.
      if (this.page === 'graph') this.inspector.hide()
      this.view.setInset(0)

      const rootNode = graph.nodes.find((node) => node.id === graph.rootId)
      this.showRootCrumb()
      this.els.empty.hidden = true
      this.els.missingCount.textContent = graph.stats.missing ? String(graph.stats.missing) : ''

      this.rememberRecent(path, rootNode?.name ?? path, rootNode?.dir ?? '')
      this.tree.setCurrent(path)
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
      toast(describeFailure(error, 'Could not read that file'), 'error')
    } finally {
      this.busy = false
      this.els.loading.hidden = true
      this.els.rescan.classList.remove('is-spinning')
    }
  }

  /**
   * Open whatever a deep link pointed at, on the page that suits it.
   *
   * A folder is a project, so it lands on the Overview — the summary of the
   * whole tree is the reason you opened a folder. A single file lands on the
   * Graph. `kind` comes from the backend, which knows which it is; `auto` is
   * for a hand-written link and falls back to the extension.
   */
  openDeepLink(path: string, kind: 'file' | 'project' | 'auto' = 'auto'): void {
    const asFile = kind === 'file' || (kind === 'auto' && USD_FILE_RE.test(path))
    if (asFile) {
      this.showPage('graph')
      void this.load(path)
    } else {
      this.showPage('overview')
      void this.openProject(path)
    }
  }

  private async loadProject(path: string): Promise<void> {
    try {
      this.project = await getProject(path)
    } catch {
      this.project = null
    }
    resetPageState()
    this.tree.setProject(this.project)
    this.showProjectName()
    this.showRootCrumb()
    this.renderPage()
  }

  /** The project's name, shown as a title rather than a folder name. */
  private showProjectName(): void {
    const name = this.project?.name
    this.els.projectName.textContent = name
      ? displayName(name)
      : 'No project'
    this.els.projectPath.textContent = this.project
      ? truncateStart(this.project.root, 52)
      : 'Open a folder'
    this.els.projectPath.title = this.project?.root ?? ''
    this.els.projectPath.classList.toggle('is-empty', !this.project)
    // Nothing to rescan until a project is open.
    this.els.rescan.hidden = !this.project
    // The rail is narrow, so a long name ellipsises; the whole name is a hover away.
    this.els.projectName.title = name ? displayName(name) : ''
  }

  private showCapabilities(capabilities: Capabilities): void {
    const parts = [
      capabilities.usdVersion ? `USD ${capabilities.usdVersion}` : null,
      `Python ${capabilities.pythonVersion.split(' ')[0] ?? ''}`.trim(),
    ].filter(Boolean)
    this.els.caps.textContent = parts.join('  ·  ')
  }

  /** Open a whole project folder: scan it, then graph a sensible first layer. */
  async openProject(dir: string, keepLayer?: string): Promise<void> {
    if (this.busy) return
    this.busy = true
    this.els.loading.hidden = false
    this.els.loadingText.textContent = `Scanning ${
      dir.split(/[\\/]/).filter(Boolean).pop() ?? dir
    }…`

    try {
      const previous = this.project?.root
      this.project = await getProject(dir)
      // A different project means the old page state describes nothing.
      if (previous !== this.project.root) resetPageState()
      this.tree.setProject(this.project)
      this.showProjectName()
      this.showRootCrumb()
      this.renderPage()
      this.rememberRecent(dir, this.project.name, this.project.root)
    } catch (error) {
      this.project = null
      this.tree.setProject(null)
      this.showProjectName()
      this.renderPage()
      toast(describeFailure(error, 'Could not scan that folder'), 'error')
      return
    } finally {
      this.busy = false
      this.els.loading.hidden = true
    }

    // Land on something rather than an empty graph: whatever was already
    // open on a rescan, otherwise a shot root, since that is the widest view.
    const next = keepLayer ?? this.defaultLayer()?.path
    if (next) void this.load(next)
  }

  /**
   * Re-read everything from disk. The project is scanned again when there is
   * one, but the graph stays on the layer you were looking at — a rescan is
   * "show me what changed", not "start again".
   */
  private rescan(): void {
    const current = this.rootPath
    if (this.project) {
      void this.openProject(this.project.root, current ?? undefined)
    } else if (current) {
      void this.load(current)
    }
  }

  private defaultLayer(): ProjectLayer | null {
    const entities = this.project?.entities ?? []
    for (const tier of ['shot', 'set', 'asset'] as const) {
      const match = entities.find((entity) => entity.tier === tier && entity.assembly)
      if (match?.assembly) return match.assembly
    }
    return entities.flatMap((entity) => entity.blocks)[0] ?? null
  }

  // -- pages --------------------------------------------------------------

  private showPage(page: PageName): void {
    const leaving = this.page
    this.page = page
    // The panel belongs to the page it was opened on. A file picked on a page
    // closes with it; the graph's own selection is kept, and comes back when
    // the graph does.
    if (leaving !== page) {
      this.closeFilePanel()
      if (page === 'graph' && this.selectedId && (this.displayed ?? this.graph)) {
        this.select(this.selectedId)
      } else {
        this.inspector.hide()
      }
    }
    for (const section of document.querySelectorAll<HTMLElement>('.page')) {
      section.hidden = section.dataset.page !== page
    }
    for (const item of document.querySelectorAll<HTMLElement>('.nav__item')) {
      const on = item.dataset.page === page
      item.classList.toggle('is-on', on)
      item.setAttribute('aria-selected', String(on))
    }
    this.renderPage()
    if (page === 'graph' && this.graph) this.view.fit(false)
  }

  /** What every project page is handed. */
  private pageContext(project: Project): PageContext {
    return {
      project,
      openLayer: (path) => {
        this.showPage('graph')
        void this.load(path)
      },
      reveal: (path) => this.reveal(path),
      copyPath: (path) => void this.copyPath(path),
      goTo: (page) => this.showPage(page),
      refresh: () => this.renderPage(),
    }
  }

  private renderPage(): void {
    if (this.page === 'graph') return

    const host = must<HTMLElement>(`#page-${this.page}`)
    if (!this.project) {
      host.classList.remove('page--fill')
      host.replaceChildren(this.noProjectNotice())
      return
    }

    const context = this.pageContext(this.project)
    if (this.page === 'overview') renderOverview(host, context)
    else if (this.page === 'workspace') renderWorkspace(host, context)
    else if (this.page === 'artists') renderArtists(host, context)
    else if (this.page === 'calendar') renderCalendar(host, context)
    else if (this.page === 'workfiles') renderWorkfiles(host, context)
    // A re-render builds fresh rows; mark the open file among them again.
    this.markOpenFile()
  }

  // -- the panel on project pages -----------------------------------------

  /**
   * Open a USD file from a project page in the panel.
   *
   * The panel describes graph nodes, so the file is crawled one arc deep:
   * enough to know the file and everything it points at, cheap even for a
   * shot root. The row is marked at once; the panel follows the crawl.
   */
  private async openFilePanel(path: string): Promise<void> {
    if (this.filePanel?.path === path && this.filePanel.graph) return
    const token = ++this.filePanelToken
    this.filePanel = { path, graph: null }
    this.markOpenFile()

    try {
      const graph = await getGraph(path, { includeAssets: true, maxDepth: 1 })
      if (token !== this.filePanelToken || this.page === 'graph') return
      this.filePanel = { path, graph }
      this.inspector.show(graph, graph.rootId, 'file')
      this.fitAroundPanel()
    } catch (error) {
      if (token !== this.filePanelToken) return
      toast(describeFailure(error, 'Could not read that file'), 'error')
      this.closeFilePanel()
    }
  }

  /**
   * A link inside the panel on a project page. A layer on disk opens in its
   * own right; a texture or a missing file has nothing to crawl, so it is
   * shown from the crawl already open, which knows it as an arc target.
   */
  private selectInFilePanel(id: string, path?: string): void {
    const graph = this.filePanel?.graph
    const node = graph?.nodes.find((candidate) => candidate.id === id)
    if (graph && node && (node.kind !== 'layer' || !node.exists)) {
      this.inspector.show(graph, id, 'file')
      return
    }
    const target = path ?? node?.path
    if (target) void this.openFilePanel(target)
  }

  private closeFilePanel(): void {
    if (!this.filePanel) return
    this.filePanel = null
    this.filePanelToken++
    this.inspector.hide()
    this.markOpenFile()
    this.fitAroundPanel()
  }

  /** Mark the rows standing for the file in the panel, and only those. */
  private markOpenFile(): void {
    const open = this.filePanel?.path
    for (const row of document.querySelectorAll<HTMLElement>('[data-layer-path]')) {
      row.classList.toggle('is-selected', row.dataset.layerPath === open)
    }
  }

  /**
   * The graph frames its camera around the panel. Project pages do not move:
   * the panel floats over them.
   */
  private fitAroundPanel(): void {
    if (this.page === 'graph' && this.selectedId) this.view.setInset(this.inspector.inset)
  }

  private noProjectNotice(): HTMLElement {
    const inTree = Boolean(this.rootPath)
    const notice = emptyState(inTree ? 'Not inside a project tree' : 'No project open', {
      icon: 'folder',
      body: inTree
        ? 'These pages read a project tree — a folder containing assets, sets or shots. ' +
          'The open file is not inside one, so there is nothing to summarise.'
        : 'Open the folder that holds your assets, sets and shots, and everything ' +
          'published in it will be summarised here.',
      action: button('Open a project folder', {
        variant: 'primary',
        icon: 'folder',
        onClick: () => void this.openPicker(),
      }),
    })
    notice.classList.add('blank--page')
    return notice
  }

  private setRootFromNode(id: string): void {
    const node = this.graph?.nodes.find((candidate) => candidate.id === id)
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
    const isolated = this.isolatedArc(graph)
    // An isolated kind is still reached through the others — a shot's
    // references sit behind its sublayers — so walk every arc, and narrow to
    // that kind afterwards.
    const walkable = isolated
      ? graph.edges.filter((edge) => edge.kind !== 'asset' || !this.hiddenArcs.has('asset'))
      : graph.edges.filter((edge) => !this.hiddenArcs.has(edge.kind))
    const allowed = isolated ? walkable.filter((edge) => edge.kind === isolated) : walkable

    const forward = new Map<string, string[]>()
    for (const edge of walkable) {
      const list = forward.get(edge.from)
      if (list) list.push(edge.to)
      else forward.set(edge.from, [edge.to])
    }

    // Breadth first, remembering how each file was first reached.
    const visible = new Set<string>([graph.rootId])
    const parent = new Map<string, string>()
    const queue = [graph.rootId]
    while (queue.length) {
      const current = queue.shift()!
      for (const next of forward.get(current) ?? []) {
        if (visible.has(next)) continue
        visible.add(next)
        parent.set(next, current)
        queue.push(next)
      }
    }

    let shown = visible
    if (isolated) {
      // The files that kind brings in, and the path from the root to each, so
      // they are shown in context rather than floating free.
      shown = new Set([graph.rootId])
      for (const edge of allowed) {
        if (!visible.has(edge.to)) continue
        for (let id: string | undefined = edge.to; id && !shown.has(id); id = parent.get(id)) {
          shown.add(id)
        }
        for (let id: string | undefined = edge.from; id && !shown.has(id); id = parent.get(id)) {
          shown.add(id)
        }
      }
    }

    if (!this.missingOnly) return shown
    const visibleForMissing = shown

    // Keep only broken files and whatever points at them, so the graph
    // collapses to just the problem.
    const broken = new Set(
      graph.nodes
        .filter((node) => visibleForMissing.has(node.id) && !node.exists && !node.template)
        .map((node) => node.id),
    )
    const kept = new Set<string>([graph.rootId, ...broken])
    for (const edge of allowed) {
      if (broken.has(edge.to)) kept.add(edge.from)
    }
    return kept
  }

  /**
   * The one composition arc kind left switched on while the others are off,
   * when that is the case — the arc chips' "isolated" state.
   */
  private isolatedArc(graph: Graph): ArcKind | null {
    const present = STRUCTURAL_ARCS.filter((kind) => (this.graph ?? graph).stats.byArc[kind] > 0)
    const shown = present.filter((kind) => !this.hiddenArcs.has(kind))
    return present.length > 1 && shown.length === 1 ? shown[0]! : null
  }

  private redraw(): void {
    if (!this.graph) return
    // The arc chips keep reporting the whole crawl: filters change the view,
    // not what is on disk, and a hidden missing file is still missing.
    const display = this.assembliesOnly ? collapseToAssemblies(this.graph) : this.graph
    this.displayed = display
    const visible = this.computeVisible(display)
    this.view.render(display, visible)
    this.view.select(this.selectedId)
    this.applyQuery()
    this.arcbar.update(this.graph, this.hiddenArcs)

    const depth = this.graph.stats.maxDepth
    this.els.graphStats.textContent =
      `${visible.size} of ${display.nodes.length} files · ${depth} ${depth === 1 ? 'level' : 'levels'} deep`
  }

  private applyQuery(): void {
    if (!this.graph || !this.query) {
      this.view.setHighlight(new Set())
      return
    }
    const hits = new Set(
      this.graph.nodes
        .filter(
          (node) =>
            matches(node.name, this.query) ||
            matches(node.relDir, this.query) ||
            matches(node.path, this.query),
        )
        .map((node) => node.id),
    )
    this.view.setHighlight(hits)
  }

  private toggleArc(kind: ArcKind): void {
    if (this.hiddenArcs.has(kind)) this.hiddenArcs.delete(kind)
    else this.hiddenArcs.add(kind)
    setToggle(this.els.textures, !this.hiddenArcs.has('asset'))
    this.redraw()
  }

  /**
   * The graphed layer in the top bar: where it sits under the project root,
   * then its name with its publish status. Called again once a project scan
   * lands, since only then is "under the project root" known.
   */
  private showRootCrumb(): void {
    const node = this.graph?.nodes.find((candidate) => candidate.id === this.graph?.rootId)
    if (!node) return
    this.els.rootName.textContent = node.name
    this.els.openLayer.title = `${node.path}\nGraph another layer`

    const root = this.project?.root
    const inside = root && node.dir.toLowerCase().startsWith(root.toLowerCase())
    const dirs = inside
      ? node.dir.slice(root.length).split(/[\\/]/).filter(Boolean).join(' / ')
      : truncateStart(node.dir, 40)
    this.els.rootPath.textContent = dirs ? `${dirs} /` : ''
    this.els.rootPath.title = node.dir

    const status = readRecord(node.meta?.customLayerData).status
    this.els.rootDot.hidden = status === 'unknown'
    this.els.rootDot.className = `dot dot--${status}`
  }

  private toggleLayerPop(open = this.els.layerPop.hidden): void {
    if (open) present(this.els.layerPop)
    else dismiss(this.els.layerPop)
    this.els.openLayer.setAttribute('aria-expanded', String(open))
    if (open) must<HTMLInputElement>('#tree-filter').focus()
  }

  private select(id: string | null): void {
    this.selectedId = id
    this.view.select(id)
    // Describe the graph as drawn, so the arcs listed are the arcs on screen.
    const source = this.displayed ?? this.graph
    if (id && source) {
      this.inspector.show(source, id, 'graph')
      // The panel floats over the graph; frame and centre around it.
      this.view.setInset(this.inspector.inset)
    } else {
      this.inspector.hide()
      this.view.setInset(0)
    }
  }

  // -- chrome -------------------------------------------------------------

  private reveal(path: string): void {
    void reveal(path).catch(() => toast('Could not open the file manager', 'error'))
  }

  private async copyPath(path: string): Promise<void> {
    const ok = await copyText(path)
    toast(ok ? 'Path copied' : 'Could not copy to the clipboard', ok ? 'ok' : 'error')
  }

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
      startDir ?? this.project?.root ?? (this.rootPath ? dirOf(this.rootPath) : undefined)
    const chosen = await this.picker.open(start, prefill)
    if (chosen) this.open(chosen)
  }

  /** A USD file opens its graph; anything else is treated as a project folder. */
  open(path: string): void {
    if (USD_FILE_RE.test(path)) void this.load(path)
    else void this.openProject(path)
  }

  /** Fall back to browsing when a dropped file could not be found on disk. */
  private async browseFor(name: string): Promise<void> {
    await this.openPicker(undefined, name)
  }

  /** True while any modal owns the keyboard. */
  private get modalOpen(): boolean {
    return (
      isPresent(must<HTMLElement>('#picker')) ||
      isPresent(must<HTMLElement>('#chooser')) ||
      this.shortcuts.isOpen
    )
  }

  private bindChrome(): void {
    const openPicker = (): void => void this.openPicker()

    must<HTMLButtonElement>('#open-project').addEventListener('click', openPicker)
    must<HTMLButtonElement>('#open-file').addEventListener('click', () => {
      this.toggleLayerPop(false)
      openPicker()
    })
    this.els.openLayer.addEventListener('click', () => this.toggleLayerPop())
    // A pick anywhere outside the dropdown closes it.
    document.addEventListener('pointerdown', (event) => {
      if (this.els.layerPop.hidden) return
      const target = event.target as Node
      if (!this.els.layerPop.contains(target) && !this.els.openLayer.contains(target)) {
        this.toggleLayerPop(false)
      }
    })
    must<HTMLButtonElement>('#empty-open').addEventListener('click', openPicker)
    must<HTMLButtonElement>('#btn-help').addEventListener('click', () =>
      this.shortcuts.toggle(),
    )

    for (const item of document.querySelectorAll<HTMLElement>('.nav__item')) {
      item.addEventListener('click', () => this.showPage(item.dataset.page as PageName))
    }

    this.els.rescan.addEventListener('click', () => this.rescan())

    must<HTMLButtonElement>('#btn-fit').addEventListener('click', () => this.view.fit())
    must<HTMLButtonElement>('#zoom-in').addEventListener('click', () => this.view.zoomBy(1.25))
    must<HTMLButtonElement>('#zoom-out').addEventListener('click', () => this.view.zoomBy(0.8))
    this.els.zoomLevel.addEventListener('click', () => this.view.resetZoom())

    this.els.textures.addEventListener('click', () => this.toggleArc('asset'))

    this.els.assemblies.addEventListener('click', () => {
      this.assembliesOnly = !this.assembliesOnly
      setToggle(this.els.assemblies, this.assembliesOnly)
      this.redraw()
      this.view.fit()
    })

    this.els.missing.addEventListener('click', () => {
      this.missingOnly = !this.missingOnly
      setToggle(this.els.missing, this.missingOnly)
      this.redraw()
      this.view.fit()
    })

    // Highlighting a few hundred cards is cheap, so answer every keystroke on
    // the next frame rather than waiting for a pause in the typing.
    const onSearch = nextFrame(() => {
      this.query = this.els.search.value.trim()
      this.applyQuery()
    })
    this.els.search.addEventListener('input', onSearch)

    const treeFilter = must<HTMLInputElement>('#tree-filter')
    treeFilter.addEventListener(
      'input',
      nextFrame(() => this.tree.setQuery(treeFilter.value)),
    )

    // Any USD file a project page lists opens in the panel. Pages only mark
    // which element is which file (`markLayer`); this one listener does the
    // rest, so every page behaves the same. A control inside a marked row —
    // a button, a link — keeps its own job.
    const pages = must<HTMLElement>('#pages')
    const pickedFile = (event: Event): string | null => {
      const target = event.target as HTMLElement
      const row = target.closest<HTMLElement>('[data-layer-path]')
      if (!row || this.page === 'graph') return null
      const control = target.closest('button, a, input, select')
      if (control && control !== row && row.contains(control)) return null
      return row.dataset.layerPath ?? null
    }
    pages.addEventListener('click', (event) => {
      const path = pickedFile(event)
      if (path) {
        void this.openFilePanel(path)
        return
      }
      // A click on the page's empty space puts the panel away, the way a
      // click on the graph's background clears its selection. Controls keep
      // their own job, and so does anything inside the panel itself.
      const target = event.target as HTMLElement
      const interactive = target.closest(
        'button, a, input, select, textarea, label, [role="button"], [data-layer-path], .inspector',
      )
      if (this.page !== 'graph' && this.filePanel && !interactive) this.closeFilePanel()
    })
    pages.addEventListener('keydown', (event) => {
      if (event.key !== 'Enter' && event.key !== ' ') return
      const path = pickedFile(event)
      if (!path) return
      event.preventDefault()
      void this.openFilePanel(path)
    })

    document.addEventListener('keydown', (event) => this.onKey(event))

    window.addEventListener(
      'resize',
      debounce(() => {
        if (this.graph && this.page === 'graph') this.view.fit(false)
      }, 180),
    )
  }

  private onKey(event: KeyboardEvent): void {
    const inField =
      event.target instanceof HTMLInputElement ||
      event.target instanceof HTMLTextAreaElement ||
      event.target instanceof HTMLSelectElement

    // Escape is the one key a modal does not own: it closes the sheet.
    if (event.key === 'Escape' && !this.els.layerPop.hidden) {
      event.preventDefault()
      this.toggleLayerPop(false)
      this.els.openLayer.focus()
      return
    }
    if (event.key === 'Escape' && this.shortcuts.isOpen) {
      event.preventDefault()
      this.shortcuts.close()
      return
    }
    // The picker and the chooser bind their own keys while they are up.
    if (this.modalOpen) return

    if (event.key === 'Escape') {
      // Whichever field you are actually in is the one that clears.
      const field = event.target
      if (field instanceof HTMLInputElement) {
        field.value = ''
        field.dispatchEvent(new Event('input', { bubbles: true }))
        field.blur()
      } else if (inField) {
        ;(field as HTMLElement).blur()
      } else if (this.page === 'graph') {
        this.select(null)
      } else {
        this.closeFilePanel()
      }
      return
    }

    if (event.key === '/' && !inField) {
      event.preventDefault()
      this.showPage('graph')
      this.els.search.focus()
      this.els.search.select()
      return
    }
    if (event.key === '?' && !inField) {
      event.preventDefault()
      this.shortcuts.toggle()
      return
    }

    // Everything below is a bare letter or digit. A modifier means the key
    // belongs to the browser or the OS — Ctrl+R is a reload, not a rescan.
    if (inField || event.ctrlKey || event.metaKey || event.altKey) return

    const pageIndex = Number(event.key) - 1
    if (Number.isInteger(pageIndex) && pageIndex >= 0 && pageIndex < PAGE_KEYS.length) {
      event.preventDefault()
      this.showPage(PAGE_KEYS[pageIndex]!)
      return
    }

    const key = event.key.toLowerCase()
    if (key === 'o') {
      event.preventDefault()
      void this.openPicker()
      return
    }
    if (key === 'r') {
      event.preventDefault()
      this.rescan()
      return
    }

    // The rest only mean anything while the graph is on screen.
    if (this.page !== 'graph') return
    if (key === 'f') this.view.fit()
    else if (event.key === '=' || event.key === '+') this.view.zoomBy(1.25)
    else if (event.key === '-') this.view.zoomBy(0.8)
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
    const entries = this.readRecent().filter((file) => file.path !== path)
    entries.unshift({ path, name, dir })
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(entries.slice(0, MAX_RECENT)))
    } catch {
      /* private mode, or storage disabled — the list is a convenience only */
    }
  }
}

/** Keep a toggle button's class and its announced state in step. */
function setToggle(node: HTMLElement, on: boolean): void {
  node.classList.toggle('is-on', on)
  node.setAttribute('aria-pressed', String(on))
}

/** The most useful sentence we have about a failed request. */
function describeFailure(error: unknown, fallback: string): string {
  const failure = error instanceof ApiFailure ? error : null
  return failure?.detail ?? failure?.message ?? fallback
}

/** The directory part of a path, in either slash style. */
function dirOf(path: string): string {
  return path.replace(/[\\/][^\\/]*$/, '')
}

async function boot(): Promise<void> {
  try {
    const capabilities = await getCapabilities()
    const app = new App(capabilities)

    // The launcher, the right-click menu and any shelf tool deep-link through
    // the query string: `?project=` for a folder, `?path=` for one file. The
    // backend decides which, having looked at the path on disk.
    const params = new URLSearchParams(location.search)
    const project = params.get('project')
    const wanted = params.get('path')
    if (project) app.openDeepLink(project, 'project')
    else if (wanted) app.openDeepLink(wanted)
  } catch {
    toast('The crawler is not responding. Is the Python backend running?', 'error')
  }
}

void boot()
