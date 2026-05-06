import { createTable, getCoreRowModel, type ColumnDef, type RowData } from '@tanstack/table-core'
import { Boxes, Clapperboard, Settings, Trash2, Upload, Users, createElement } from 'lucide'
import './style.css'

type PageKey = 'overview' | 'workspace' | 'artists' | 'settings'
type WorkspaceSection = 'assets' | 'shots' | 'sets' | 'library'

interface PublishRecord { artist: string | null; hip?: string | null; hip_file?: string | null; published_at?: string | null }
interface Project { name: string; code: string; created: string }
interface Software { houdini: string; karma: string; usd: string }
interface Conventions { usd_format_default: 'usda' | 'usdc'; shot_number_increment: number; version_padding: number; valid_statuses: string[] }
type TaskMap = Record<string, PublishRecord | null>
type LegacyStepMap = Record<string, PublishRecord[]>
interface Asset { name: string; type: 'char' | 'prop' | 'veh' | 'fx'; notes?: string; tasks?: TaskMap; steps?: LegacyStepMap }
interface Shot { sequence: string; shot: string; set: string; created_at: string; notes?: string; tasks?: TaskMap; steps?: LegacyStepMap }
interface Sequence { code: string; name: string; shots: Array<Omit<Shot, 'sequence'>> }
interface SetItem { name: string; created_at: string; notes?: string; tasks?: TaskMap; steps?: LegacyStepMap }
interface LibraryMaterial { name: string }
interface PipelineData { project: Project; software: Software; conventions: Conventions; team: string[]; shots: Shot[]; assets: Asset[]; sets: SetItem[]; library: { materials: LibraryMaterial[] }; sequences?: Sequence[] }

interface ArtistTask {
  artist: string
  kind: 'asset' | 'shot' | 'set'
  entity: string
  step: string
  hip: string | null
}

type ShotRow = Shot & { sequence: string }

function latestArtist(record: PublishRecord | null | undefined) { return record?.artist ?? '-' }
function latestHip(record: PublishRecord | null | undefined) { return record?.hip_file ?? record?.hip ?? '-' }

function toTaskMap(entity: { tasks?: TaskMap; steps?: LegacyStepMap }, taskNames: string[]): TaskMap {
  const out: TaskMap = {}
  taskNames.forEach((name) => {
    const taskValue = entity.tasks?.[name]
    if (taskValue && (taskValue.artist || taskValue.hip)) {
      out[name] = taskValue
      return
    }
    const legacy = entity.steps?.[name]
    out[name] = legacy && legacy.length ? legacy[legacy.length - 1] : null
  })
  return out
}

function normalizePipelineData(data: PipelineData): PipelineData {
  const fromLegacyShots = (data.sequences ?? []).flatMap((sequence) =>
    sequence.shots.map((shot) => ({ ...shot, sequence: sequence.code })),
  )
  const normalizedShots = (data.shots && data.shots.length ? data.shots : fromLegacyShots).map((shot) => ({
    ...shot,
    tasks: toTaskMap(shot, ['layout', 'anim', 'fx', 'lighting', 'assembly']),
  }))
  return {
    ...data,
    assets: (data.assets ?? []).map((asset) => ({
      ...asset,
      type: asset.type ?? 'prop',
      tasks: toTaskMap(asset, ['model', 'rig', 'lookdev', 'assembly']),
    })),
    sets: (data.sets ?? []).map((setItem) => ({
      ...setItem,
      created_at: setItem.created_at ?? '',
      tasks: toTaskMap(setItem, ['dressing', 'lighting', 'lookdev', 'fx', 'assembly']),
    })),
    shots: normalizedShots.map((shot) => ({
      ...shot,
      created_at: shot.created_at ?? '',
    })),
  }
}

const appElement = document.querySelector<HTMLDivElement>('#app')
if (!appElement) throw new Error('App root missing')
const app: HTMLDivElement = appElement

let baselineData: PipelineData | null = null
let currentData: PipelineData | null = null
let currentPage: PageKey = 'overview'
let serverError = ''
let saveError = ''
let expandedRowId: string | null = null
let showAssetModal = false
let showShotModal = false
let showSetModal = false
let workspaceSection: WorkspaceSection = 'assets'
let artistFilter = ''
let artistKindFilter: 'all' | 'asset' | 'shot' | 'set' = 'all'
let flashMessage = ''
let activeDataFileLabel = 'pipeline.json'
let activeDataFileHandle: FileSystemFileHandle | null = null
let activeFileNeedsPickerSave = false

const nav: Array<{ key: PageKey; label: string; icon: unknown }> = [
  { key: 'overview', label: 'Overview', icon: Clapperboard },
  { key: 'workspace', label: 'Pipeline Workspace', icon: Boxes },
  { key: 'artists', label: 'Artists', icon: Users },
  { key: 'settings', label: 'Settings', icon: Settings },
]

function getAllShots(data: PipelineData): ShotRow[] {
  return data.shots
}

function getArtistTasks(data: PipelineData): ArtistTask[] {
  const tasks: ArtistTask[] = []

  data.assets.forEach((asset) => {
    const tasksByStep = toTaskMap(asset, ['model', 'rig', 'lookdev', 'assembly'])
    Object.entries(tasksByStep).forEach(([step, record]) => {
      if (record?.artist) tasks.push({ artist: record.artist, kind: 'asset', entity: asset.name, step, hip: latestHip(record) })
    })
  })

  getAllShots(data).forEach((shot) => {
    const tasksByStep = toTaskMap(shot, ['layout', 'anim', 'fx', 'lighting', 'assembly'])
    Object.entries(tasksByStep).forEach(([step, record]) => {
      if (record?.artist) tasks.push({ artist: record.artist, kind: 'shot', entity: `${shot.sequence}_${shot.shot}`, step, hip: latestHip(record) })
    })
  })

  data.sets.forEach((setItem) => {
    const tasksByStep = toTaskMap(setItem, ['dressing', 'lighting', 'lookdev', 'fx', 'assembly'])
    Object.entries(tasksByStep).forEach(([step, record]) => {
      if (record?.artist) tasks.push({ artist: record.artist, kind: 'set', entity: setItem.name, step, hip: latestHip(record) })
    })
  })

  return tasks.sort((a, b) => a.artist.localeCompare(b.artist) || a.kind.localeCompare(b.kind) || a.entity.localeCompare(b.entity))
}

async function apiGetData() {
  const response = await fetch('/data')
  if (!response.ok) {
    const body = await response.json().catch(() => ({}))
    throw new Error(body?.first_run ? 'first_run' : 'Server unreachable')
  }
  return (await response.json()) as PipelineData
}

async function apiSaveData(data: PipelineData) {
  const response = await fetch('/data', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) })
  if (!response.ok) throw new Error('Failed to save data')
}

async function apiCreate(type: 'asset' | 'shot' | 'set', entry: Asset | Shot | SetItem, sequenceCode?: string) {
  const payload: Record<string, unknown> = { type, entry }
  if (type === 'shot') payload.sequence = sequenceCode
  const response = await fetch('/create', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) })
  if (!response.ok) throw new Error('Create request failed')
  const body = await response.json()
  return body.data as PipelineData
}

function iconSvg(icon: unknown, size = 16) { return createElement(icon as never, { width: size, height: size }).outerHTML }
function cloneData<T>(value: T): T { return JSON.parse(JSON.stringify(value)) as T }
function isDirty() { return JSON.stringify(currentData) !== JSON.stringify(baselineData) }
function getState() { if (!currentData) throw new Error('Pipeline data not loaded'); return currentData }
function setState(mutator: (draft: PipelineData) => void) { const next = cloneData(getState()); mutator(next); currentData = next; render() }
function normalizeTeam(input: string[]) {
  const seen = new Set<string>()
  const out: string[] = []
  input.forEach((name) => {
    const normalized = String(name ?? '').trim().toLowerCase()
    if (!normalized) return
    if (!/^[a-z0-9]+$/.test(normalized)) return
    if (seen.has(normalized)) return
    seen.add(normalized)
    out.push(normalized)
  })
  return out
}

function headerUnsavedBar() { return isDirty() ? '<span class="unsaved-badge">Unsaved changes</span>' : '' }

function buildTable<TData extends RowData>(data: TData[], columns: ColumnDef<TData>[]) {
  return createTable<TData>({
    data,
    columns,
    state: { columnPinning: { left: [], right: [] } },
    onStateChange: () => undefined,
    getCoreRowModel: getCoreRowModel(),
    renderFallbackValue: '-',
  })
}

function renderDataTable<T>(type: 'assets' | 'shots' | 'sets', rows: T[], columns: ColumnDef<T>[], expandRenderer: (row: T, index: number) => string) {
  const table = buildTable(rows as RowData[], columns as ColumnDef<RowData>[])
  let html = '<table class="data-table"><thead>'
  for (const hg of table.getHeaderGroups()) {
    html += '<tr>'
    for (const header of hg.headers) html += `<th>${String(header.column.columnDef.header ?? '')}</th>`
    html += '</tr>'
  }
  html += '</thead><tbody>'

  table.getRowModel().rows.forEach((row, idx) => {
    const id = `${type}-${idx}`
    const expanded = expandedRowId === id
    html += `<tr data-expand="${id}" class="table-row-clickable">`
    row.getVisibleCells().forEach((cell) => {
      const def = cell.column.columnDef
      const value = typeof def.cell === 'function' ? def.cell(cell.getContext() as never) : cell.getValue()
      html += `<td>${String(value ?? '-')}</td>`
    })
    html += '</tr>'
    if (expanded) html += `<tr class="expanded-row"><td colspan="${columns.length}">${expandRenderer(rows[idx], idx)}</td></tr>`
  })

  html += '</tbody></table>'
  return html
}

function renderOverview(data: PipelineData) {
  const shots = getAllShots(data)
  const entityCounts = [
    { label: 'Assets', value: data.assets.length },
    { label: 'Shots', value: shots.length },
    { label: 'Sets', value: data.sets.length },
  ]

  const cards = entityCounts
    .map((entry) => `<article class="surface-card metric-card"><h3>${entry.label}</h3><p class="count">${entry.value}</p></article>`)
    .join('')

  const setRows = data.sets.map((setItem) => {
    const related = shots.filter((shot) => shot.set === setItem.name).map((shot) => `${shot.sequence}_${shot.shot}`).join(', ') || '-'
    return `<tr><td>${setItem.name}</td><td>${related}</td></tr>`
  }).join('')

  const teamRows = [...(data.team ?? [])].sort((a, b) => a.localeCompare(b)).map((name) => `<li>${name}</li>`).join('')
  return `<section class="section-block"><h2 class="section-title">Overview</h2><div class="card-grid">${cards}</div><article class="surface-card"><h3>Software Versions</h3><div class="kv-grid"><p>Houdini</p><p>${data.software.houdini}</p><p>Karma</p><p>${data.software.karma}</p><p>USD</p><p>${data.software.usd}</p></div></article><article class="surface-card"><h3>Team</h3><ul class="team-overview-list">${teamRows || '<li>-</li>'}</ul></article><article class="surface-card"><h3>Set to Shot Dependencies</h3><table class="simple-table"><thead><tr><th>Set</th><th>Referenced by Shots</th></tr></thead><tbody>${setRows}</tbody></table></article></section>`
}

function renderAssetsSection(data: PipelineData) {
  const taskNames = ['model', 'rig', 'lookdev', 'assembly']
  const columns: ColumnDef<Asset>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Type', cell: ({ row }) => `<span class="type-badge">${row.original.type}</span>` },
    { header: 'Model', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).model) },
    { header: 'Rig', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).rig) },
    { header: 'Lookdev', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).lookdev) },
    { header: 'Assembly', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).assembly) },
  ]

  const expand = (asset: Asset) => {
    const tasksByStep = toTaskMap(asset, taskNames)
    return `<div class="expanded-grid"><div>${Object.entries(tasksByStep).map(([step, record]) => `<p><strong>${step}</strong>: ${latestArtist(record)} (${latestHip(record)})</p>`).join('')}</div></div>`
  }
  return `<article class="surface-card"><div class="toolbar"><h3>Assets</h3><button data-open-modal="asset">Add Asset</button></div>${renderDataTable('assets', data.assets, columns, expand)}</article>`
}

function renderShotsSection(data: PipelineData) {
  const colCount = 8
  let html = '<article class="surface-card"><div class="toolbar"><h3>Shots</h3><button data-open-modal="shot">Add Shot</button></div><table class="data-table"><thead><tr><th>Sequence</th><th>Shot</th><th>Set</th><th>Layout</th><th>Anim</th><th>FX</th><th>Lighting</th><th>Assembly</th></tr></thead><tbody>'
  data.shots.forEach((row, flatIndex) => {
    const tasksByStep = toTaskMap(row, ['layout', 'anim', 'fx', 'lighting', 'assembly'])
    const rowId = `shots-${flatIndex}`
    const expanded = expandedRowId === rowId
    html += `<tr class="table-row-clickable" data-expand="${rowId}">`
    html += `<td>${row.sequence}</td>`
    html += `<td>${row.shot}</td>`
    html += `<td><select data-shot-set="${flatIndex}">${data.sets.map((s) => `<option value="${s.name}" ${row.set === s.name ? 'selected' : ''}>${s.name}</option>`).join('')}</select></td>`
    html += `<td>${latestArtist(tasksByStep.layout)}</td>`
    html += `<td>${latestArtist(tasksByStep.anim)}</td>`
    html += `<td>${latestArtist(tasksByStep.fx)}</td>`
    html += `<td>${latestArtist(tasksByStep.lighting)}</td>`
    html += `<td>${latestArtist(tasksByStep.assembly)}</td>`
    html += '</tr>'
    if (expanded) {
      html += `<tr class="expanded-row"><td colspan="${colCount}"><div class="expanded-grid"><div>${Object.entries(tasksByStep).map(([step, record]) => `<p><strong>${step}</strong>: ${latestArtist(record)} (${latestHip(record)})</p>`).join('')}</div></div></td></tr>`
    }
  })
  html += '</tbody></table></article>'
  return html
}

function renderSetsSection(data: PipelineData) {
  const taskNames = ['dressing', 'lighting', 'lookdev', 'fx', 'assembly']
  const columns: ColumnDef<SetItem>[] = [
    { header: 'Name', accessorKey: 'name' },
    { header: 'Dressing', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).dressing) },
    { header: 'Lighting', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).lighting) },
    { header: 'Lookdev', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).lookdev) },
    { header: 'FX', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).fx) },
    { header: 'Assembly', cell: ({ row }) => latestArtist(toTaskMap(row.original, taskNames).assembly) },
  ]

  const expand = (setItem: SetItem) => {
    const tasksByStep = toTaskMap(setItem, taskNames)
    return `<div class="expanded-grid"><div>${Object.entries(tasksByStep).map(([step, record]) => `<p><strong>${step}</strong>: ${latestArtist(record)} (${latestHip(record)})</p>`).join('')}</div></div>`
  }
  return `<article class="surface-card"><div class="toolbar"><h3>Sets</h3><button data-open-modal="set">Add Set</button></div>${renderDataTable('sets', data.sets, columns, expand)}</article>`
}

function renderLibrarySection(data: PipelineData) {
  const items = data.library.materials.map((mat, index) => `<li><input data-material="${index}" value="${mat.name}" /><button class="icon-btn" data-delete-material="${index}">${iconSvg(Trash2, 14)}</button></li>`).join('')
  return `<article class="surface-card"><div class="toolbar"><h3>Library Materials</h3><button data-add-material="1">Add Material</button></div><ul class="material-list">${items}</ul></article>`
}

function renderWorkspace(data: PipelineData) {
  const primaryTabs: Array<{ key: WorkspaceSection; label: string }> = [
    { key: 'assets', label: 'Assets' },
    { key: 'sets', label: 'Sets' },
    { key: 'shots', label: 'Shots' },
  ]

  const activeContent = workspaceSection === 'assets'
    ? renderAssetsSection(data)
    : workspaceSection === 'shots'
      ? renderShotsSection(data)
      : workspaceSection === 'sets'
        ? renderSetsSection(data)
        : renderLibrarySection(data)

  return `<section class="section-block"><h2 class="section-title">Pipeline Workspace</h2><div class="workspace-tabs">${primaryTabs.map((tab) => `<button class="workspace-tab ${workspaceSection === tab.key ? 'active' : ''}" data-workspace-tab="${tab.key}">${tab.label}</button>`).join('')}<span class="workspace-tab-divider"></span><button class="workspace-tab ${workspaceSection === 'library' ? 'active' : ''}" data-workspace-tab="library">Library</button></div>${activeContent}</section>`
}

function renderArtists(data: PipelineData) {
  const tasks = getArtistTasks(data).filter((task) => {
    const artistMatch = task.artist.toLowerCase().includes(artistFilter.toLowerCase())
    const kindMatch = artistKindFilter === 'all' || task.kind === artistKindFilter
    return artistMatch && kindMatch
  })
  const grouped = new Map<string, ArtistTask[]>()
  tasks.forEach((task) => {
    const group = grouped.get(task.artist) ?? []
    group.push(task)
    grouped.set(task.artist, group)
  })

  let groupedRows = ''
  for (const [artist, artistTasks] of grouped.entries()) {
    groupedRows += `<tr class="group-row"><td colspan="4">${artist}</td></tr>`
    groupedRows += artistTasks
      .map((task) => `<tr><td>${task.kind}</td><td>${task.entity}</td><td>${task.step}</td><td>${task.hip ?? '-'}</td></tr>`)
      .join('')
  }

  return `<section class="section-block"><h2 class="section-title">Artist Task Map</h2><article class="surface-card artist-filters"><input data-artist-filter="name" placeholder="Filter by artist name" value="${artistFilter}" /><select data-artist-filter="kind"><option value="all" ${artistKindFilter === 'all' ? 'selected' : ''}>All types</option><option value="asset" ${artistKindFilter === 'asset' ? 'selected' : ''}>Asset</option><option value="shot" ${artistKindFilter === 'shot' ? 'selected' : ''}>Shot</option><option value="set" ${artistKindFilter === 'set' ? 'selected' : ''}>Set</option></select><button data-apply-artist-filters="1">Apply</button></article><article class="surface-card"><table class="simple-table"><thead><tr><th>Type</th><th>Entity</th><th>Step</th><th>HIP</th></tr></thead><tbody>${groupedRows || '<tr><td colspan="4">No artist assignments match current filters.</td></tr>'}</tbody></table></article></section>`
}

function renderSettings(data: PipelineData) {
  const teamRows = [...(data.team ?? [])]
    .map((name, idx) => ({ name, idx }))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((member) => `<li><input data-team="${member.idx}" value="${member.name}" /><button class="icon-btn" data-delete-team="${member.idx}">${iconSvg(Trash2, 14)}</button></li>`)
    .join('')
  return `<section class="section-block"><h2 class="section-title">Project Settings</h2><article class="surface-card"><h3>Software Versions</h3><div class="settings-grid"><label>Houdini<input data-setting="software.houdini" value="${data.software.houdini}"/></label><p class="hint">Houdini tools will warn artists when their running version does not match this value.</p><label>Karma<input data-setting="software.karma" value="${data.software.karma}"/></label><label>USD<input data-setting="software.usd" value="${data.software.usd}"/></label></div></article><article class="surface-card"><h3>Team</h3><ul class="material-list">${teamRows}</ul><button data-add-team="1">Add Member</button></article><article class="surface-card"><h3>Conventions</h3><div class="settings-grid"><label>USD Default Format<select data-setting="conventions.usd_format_default"><option value="usda" ${data.conventions.usd_format_default === 'usda' ? 'selected' : ''}>usda</option><option value="usdc" ${data.conventions.usd_format_default === 'usdc' ? 'selected' : ''}>usdc</option></select></label><label>Shot Number Increment<input type="number" data-setting="conventions.shot_number_increment" value="${data.conventions.shot_number_increment}"/></label><p class="hint">Changing default USD format or shot increment does not affect already published files.</p><label>Version Padding<input type="number" data-setting="conventions.version_padding" value="${data.conventions.version_padding}"/></label></div></article></section>`
}

function suggestShot(data: PipelineData, sequenceCode: string) {
  const shotsInSequence = data.shots.filter((shot) => shot.sequence === sequenceCode)
  if (shotsInSequence.length === 0) return String(data.conventions.shot_number_increment).padStart(4, '0')
  const maxShot = shotsInSequence.reduce((acc, current) => Math.max(acc, Number(current.shot)), 0)
  return String(maxShot + data.conventions.shot_number_increment).padStart(4, '0')
}

function renderModal(data: PipelineData) {
  if (!showAssetModal && !showShotModal && !showSetModal) return ''

  if (showAssetModal) {
    return `<div class="modal"><div class="modal-body"><h3>Add Asset</h3><label>Type<select id="asset-type"><option value="char">char</option><option value="prop">prop</option><option value="veh">veh</option><option value="fx">fx</option></select></label><label>Name<input id="asset-name" value="char_"/></label><p class="hint">Only lowercase letters, digits and underscores. No double underscores.</p><div class="modal-actions"><button data-close-modal="1">Cancel</button><button data-create-asset="1">Create</button></div></div></div>`
  }

  if (showShotModal) {
    const knownSequences = Array.from(new Set(data.shots.map((s) => s.sequence))).filter(Boolean)
    const firstSeq = knownSequences[0] ?? ''
    return `<div class="modal"><div class="modal-body"><h3>Add Shot</h3><label>Sequence<input id="shot-seq" list="shot-seq-options" value="${firstSeq}" /></label><datalist id="shot-seq-options">${knownSequences.map((code) => `<option value="${code}"></option>`).join('')}</datalist><label>Shot Number<input id="shot-number" value="${suggestShot(data, firstSeq)}"/></label><label>Set<select id="shot-set">${data.sets.map((s) => `<option value="${s.name}">${s.name}</option>`).join('')}</select></label><div class="modal-actions"><button data-close-modal="1">Cancel</button><button data-create-shot="1">Create</button></div></div></div>`
  }

  return `<div class="modal"><div class="modal-body"><h3>Add Set</h3><label>Name<input id="set-name" value="set_"/></label><div class="modal-actions"><button data-close-modal="1">Cancel</button><button data-create-set="1">Create</button></div></div></div>`
}

function renderFirstRun() {
  app.innerHTML = `<main class="setup"><h1>First Run Setup</h1><p>No pipeline.json found. Fill these values to create it.</p><label>Project Name<input id="setup-name" placeholder="project_robot_short"/></label><label>Project Code<input id="setup-code" placeholder="rbt"/></label><label>Houdini Version<input id="setup-houdini" value="20.5.410"/></label><label>Karma Version<input id="setup-karma" value="2.0"/></label><label>USD Version<input id="setup-usd" value="24.08"/></label><button id="setup-create">Create pipeline.json</button></main>`
  document.querySelector<HTMLButtonElement>('#setup-create')?.addEventListener('click', async () => {
    const name = (document.querySelector<HTMLInputElement>('#setup-name')?.value || '').trim()
    const code = (document.querySelector<HTMLInputElement>('#setup-code')?.value || '').trim()
    const newData: PipelineData = { project: { name, code, created: new Date().toISOString().slice(0, 10) }, software: { houdini: (document.querySelector<HTMLInputElement>('#setup-houdini')?.value || '').trim(), karma: (document.querySelector<HTMLInputElement>('#setup-karma')?.value || '').trim(), usd: (document.querySelector<HTMLInputElement>('#setup-usd')?.value || '').trim() }, conventions: { usd_format_default: 'usda', shot_number_increment: 10, version_padding: 3, valid_statuses: ['not_started', 'in_progress', 'published'] }, team: [], shots: [], assets: [], sets: [], library: { materials: [] } }
    try { await apiSaveData(newData); baselineData = cloneData(newData); currentData = cloneData(newData); serverError = ''; render() }
    catch { serverError = 'Could not create pipeline.json. Verify launch.py is running.'; render() }
  })
}

function render() {
  if (!currentData) {
    if (serverError === 'first_run') { renderFirstRun(); return }
    app.innerHTML = `<main class="error-screen"><h1>Server Not Reachable</h1><p>Run <code>launch.py</code> at the project root, then refresh this page.</p><p>${serverError}</p></main>`
    return
  }

  const data = currentData
  const pageContent = currentPage === 'overview' ? renderOverview(data) : currentPage === 'workspace' ? renderWorkspace(data) : currentPage === 'artists' ? renderArtists(data) : renderSettings(data)
  const activeLabel = nav.find((item) => item.key === currentPage)?.label ?? ''
  const inspectorContent = currentPage === 'artists'
    ? '<p class="inspector-title">Artist Filters</p><p class="inspector-note">Use the controls in the main panel to filter by artist and type.</p>'
    : currentPage === 'workspace'
      ? '<p class="inspector-title">Workspace</p><p class="inspector-note">Use section tabs to switch between Assets, Shots, Sets, and Library.</p>'
      : '<p class="inspector-title">Project Info</p><p class="inspector-note">Overview and settings are read directly from pipeline metadata.</p>'
  const subToolbar = `<div class="sub-toolbar"><button class="tool-chip" data-load-json="1"><span>${iconSvg(Upload, 13)}</span>Load JSON</button><span class="tool-sep"></span><span class="tool-chip muted">${activeDataFileLabel}</span></div>`

  app.innerHTML = `<div class="app-chrome"><header class="global-toolbar"><div class="toolbar-left"><span class="dot"></span><span>${data.project.name || 'USD Pipeline Toolkit'}</span></div><div class="toolbar-center">${activeLabel}</div><div class="toolbar-right">${headerUnsavedBar()}<button data-save="1">Save</button></div></header>${subToolbar}<div class="layout"><aside class="sidebar"><div class="brand"><p class="brand-title">${data.project.name || 'USD Pipeline Toolkit'}</p><p class="brand-sub">${data.project.code.toUpperCase() || 'PROJECT'}</p></div><nav class="side-nav">${nav.map((item) => `<button class="nav-btn ${item.key === currentPage ? 'active' : ''}" data-page="${item.key}"><span class="nav-icon">${iconSvg(item.icon)}</span><span>${item.label}</span></button>`).join('')}</nav></aside><main class="content"><header class="top-header"><h2>${activeLabel}</h2></header>${flashMessage ? `<p class="flash-message">${flashMessage}</p>` : ''}${saveError ? `<p class="save-error">${saveError}</p>` : ''}${pageContent}</main><aside class="inspector"><div class="inspector-panel"><p class="inspector-title">Actions</p><button data-load-json="1">Load JSON</button><button data-save="1">Save JSON</button><p class="inspector-note">Load only updates memory. Save writes back to the currently active JSON file.</p>${inspectorContent}</div></aside></div><footer class="status-bar"><span>Console</span><span>Problems</span><span>Changes</span><span>Timing</span><span>Audio</span></footer><input type="file" id="json-import-input" accept=".json,application/json" hidden /></div>${renderModal(data)}`

  bindHandlers()
}

function updateShotByFlatIndex(draft: PipelineData, flatIndex: number, updater: (shot: Shot) => void) {
  if (flatIndex < 0 || flatIndex >= draft.shots.length) return
  updater(draft.shots[flatIndex])
}

function bindHandlers() {
  document.querySelectorAll<HTMLButtonElement>('[data-page]').forEach((btn) => btn.addEventListener('click', () => {
    currentPage = btn.dataset.page as PageKey
    expandedRowId = null
    render()
  }))

  document.querySelectorAll<HTMLButtonElement>('[data-workspace-tab]').forEach((btn) => btn.addEventListener('click', () => {
    workspaceSection = btn.dataset.workspaceTab as WorkspaceSection
    expandedRowId = null
    render()
  }))

  document.querySelector('[data-apply-artist-filters="1"]')?.addEventListener('click', () => {
    artistFilter = document.querySelector<HTMLInputElement>('[data-artist-filter="name"]')?.value ?? ''
    artistKindFilter = (document.querySelector<HTMLSelectElement>('[data-artist-filter="kind"]')?.value ?? 'all') as 'all' | 'asset' | 'shot' | 'set'
    render()
  })

  document.querySelectorAll<HTMLButtonElement>('[data-save="1"]').forEach((saveButton) => saveButton.addEventListener('click', async () => {
    if (!currentData) return
    saveError = ''
    try {
      const payload = cloneData(currentData)
      payload.team = normalizeTeam(payload.team ?? [])
      if (activeDataFileHandle) {
        const writable = await activeDataFileHandle.createWritable()
        await writable.write(JSON.stringify(payload, null, 2) + '\n')
        await writable.close()
      } else if (activeFileNeedsPickerSave) {
        const windowWithPicker = window as Window & { showSaveFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle> }
        if (!windowWithPicker.showSaveFilePicker) {
          throw new Error('No file system save picker support in this browser.')
        }
        const handle = await windowWithPicker.showSaveFilePicker({
          suggestedName: activeDataFileLabel || 'pipeline.json',
          types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
        })
        const writable = await handle.createWritable()
        await writable.write(JSON.stringify(payload, null, 2) + '\n')
        await writable.close()
        activeDataFileHandle = handle
        activeDataFileLabel = handle.name
        activeFileNeedsPickerSave = false
      } else {
        await apiSaveData(payload)
      }
      currentData = cloneData(payload)
      baselineData = cloneData(payload)
      flashMessage = `Saved to ${activeDataFileLabel}`
    } catch {
      saveError = 'Save failed. Your edits are still in memory.'
      flashMessage = ''
    }
    render()
  }))

  const importInput = document.querySelector<HTMLInputElement>('#json-import-input')
  const triggerImport = async () => {
    const windowWithPicker = window as Window & { showOpenFilePicker?: (options?: unknown) => Promise<FileSystemFileHandle[]> }
    if (windowWithPicker.showOpenFilePicker) {
      try {
        const [handle] = await windowWithPicker.showOpenFilePicker({
          multiple: false,
          types: [{ description: 'JSON Files', accept: { 'application/json': ['.json'] } }],
        })
        const file = await handle.getFile()
        const text = await file.text()
    const parsed = normalizePipelineData(JSON.parse(text) as PipelineData)
        parsed.team = normalizeTeam(parsed.team ?? [])
        currentData = cloneData(parsed)
        baselineData = cloneData(parsed)
        activeDataFileHandle = handle
        activeDataFileLabel = file.name
        activeFileNeedsPickerSave = false
        flashMessage = `Loaded ${file.name} to memory`
        saveError = ''
        render()
        return
      } catch {
        return
      }
    }
    importInput?.click()
  }
  document.querySelectorAll('[data-load-json="1"]').forEach((el) => el.addEventListener('click', triggerImport))
  importInput?.addEventListener('change', async () => {
    const file = importInput.files?.[0]
    if (!file) return
    try {
      const text = await file.text()
      const parsed = normalizePipelineData(JSON.parse(text) as PipelineData)
      parsed.team = normalizeTeam(parsed.team ?? [])
      currentData = cloneData(parsed)
      baselineData = cloneData(parsed)
      activeDataFileHandle = null
      activeDataFileLabel = file.name
      activeFileNeedsPickerSave = true
      flashMessage = `Loaded ${file.name} to memory`
      saveError = ''
    } catch {
      saveError = 'Failed to load JSON file. Check schema/format.'
      flashMessage = ''
    }
    importInput.value = ''
    render()
  })

  document.querySelectorAll<HTMLTableRowElement>('[data-expand]').forEach((row) => row.addEventListener('click', () => {
    expandedRowId = expandedRowId === row.dataset.expand ? null : row.dataset.expand ?? null
    render()
  }))

  document.querySelectorAll<HTMLSelectElement>('[data-shot-set]').forEach((select) => select.addEventListener('change', () => {
    const index = Number(select.dataset.shotSet)
    if (!Number.isInteger(index)) return
    setState((draft) => updateShotByFlatIndex(draft, index, (shot) => { shot.set = select.value }))
  }))
  document.querySelectorAll<HTMLElement>('select, input, textarea, button').forEach((el) => {
    el.addEventListener('click', (event) => event.stopPropagation())
    el.addEventListener('mousedown', (event) => event.stopPropagation())
  })

  document.querySelectorAll<HTMLInputElement>('[data-material]').forEach((input) => input.addEventListener('change', () => {
    const index = Number(input.dataset.material)
    setState((draft) => { draft.library.materials[index].name = input.value })
  }))

  document.querySelectorAll<HTMLInputElement>('[data-team]').forEach((input) => input.addEventListener('change', () => {
    const index = Number(input.dataset.team)
    const value = input.value.trim().toLowerCase()
    if (!Number.isInteger(index)) return
    if (!value || !/^[a-z0-9]+$/.test(value)) { render(); return }
    const draftTeam = (currentData?.team ?? []).map((x) => x.toLowerCase())
    if (draftTeam.some((name, idx) => idx !== index && name === value)) { render(); return }
    setState((draft) => { draft.team[index] = value })
  }))
  document.querySelectorAll<HTMLButtonElement>('[data-delete-team]').forEach((button) => button.addEventListener('click', () => {
    const index = Number(button.dataset.deleteTeam)
    if (!Number.isInteger(index)) return
    setState((draft) => { draft.team.splice(index, 1) })
  }))
  document.querySelector('[data-add-team="1"]')?.addEventListener('click', () => {
    setState((draft) => { draft.team.push('') })
  })

  document.querySelector('[data-add-material="1"]')?.addEventListener('click', () => setState((draft) => { draft.library.materials.push({ name: 'new_material' }) }))
  document.querySelectorAll<HTMLButtonElement>('[data-delete-material]').forEach((button) => button.addEventListener('click', () => setState((draft) => { draft.library.materials.splice(Number(button.dataset.deleteMaterial), 1) })))

  document.querySelectorAll<HTMLInputElement | HTMLSelectElement>('[data-setting]').forEach((input) => input.addEventListener('change', () => {
    const setting = input.dataset.setting
    if (!setting) return
    setState((draft) => {
      if (setting === 'software.houdini') draft.software.houdini = input.value
      if (setting === 'software.karma') draft.software.karma = input.value
      if (setting === 'software.usd') draft.software.usd = input.value
      if (setting === 'conventions.usd_format_default') draft.conventions.usd_format_default = input.value as 'usda' | 'usdc'
      if (setting === 'conventions.shot_number_increment') draft.conventions.shot_number_increment = Number(input.value)
      if (setting === 'conventions.version_padding') draft.conventions.version_padding = Number(input.value)
    })
  }))

  document.querySelectorAll<HTMLButtonElement>('[data-open-modal]').forEach((button) => button.addEventListener('click', () => {
    showAssetModal = button.dataset.openModal === 'asset'
    showShotModal = button.dataset.openModal === 'shot'
    showSetModal = button.dataset.openModal === 'set'
    render()
  }))

  document.querySelector('[data-close-modal="1"]')?.addEventListener('click', () => {
    showAssetModal = false
    showShotModal = false
    showSetModal = false
    render()
  })

  document.querySelector<HTMLSelectElement>('#asset-type')?.addEventListener('change', (event) => {
    const type = (event.target as HTMLSelectElement).value
    const name = document.querySelector<HTMLInputElement>('#asset-name')
    if (name) name.value = `${type}_`
  })

  document.querySelector('[data-create-asset="1"]')?.addEventListener('click', async () => {
    const type = (document.querySelector<HTMLSelectElement>('#asset-type')?.value ?? 'char') as Asset['type']
    const name = (document.querySelector<HTMLInputElement>('#asset-name')?.value ?? '').trim()
    if (!/^[a-z0-9_]+$/.test(name) || name.includes('__')) return
    const entry: Asset = { name, type, tasks: { model: null, rig: null, lookdev: null, assembly: null } }
    const data = await apiCreate('asset', entry)
    baselineData = cloneData(data)
    currentData = cloneData(data)
    showAssetModal = false
    render()
  })

  document.querySelector('[data-create-shot="1"]')?.addEventListener('click', async () => {
    const sequence = (document.querySelector<HTMLInputElement>('#shot-seq')?.value ?? '').trim()
    const shotNumber = (document.querySelector<HTMLInputElement>('#shot-number')?.value ?? '').padStart(4, '0')
    const setName = document.querySelector<HTMLSelectElement>('#shot-set')?.value ?? ''
    if (!sequence) return
    const entry: Shot = { sequence, shot: shotNumber, set: setName, created_at: new Date().toISOString(), tasks: { layout: null, anim: null, fx: null, lighting: null, assembly: null } }
    const data = await apiCreate('shot', entry, sequence)
    baselineData = cloneData(data)
    currentData = cloneData(data)
    showShotModal = false
    render()
  })

  document.querySelector('[data-create-set="1"]')?.addEventListener('click', async () => {
    const name = (document.querySelector<HTMLInputElement>('#set-name')?.value ?? '').trim()
    const entry: SetItem = { name, created_at: new Date().toISOString(), tasks: { dressing: null, lighting: null, lookdev: null, fx: null, assembly: null } }
    const data = await apiCreate('set', entry)
    baselineData = cloneData(data)
    currentData = cloneData(data)
    showSetModal = false
    render()
  })
}

async function bootstrap() {
  try {
    const data = normalizePipelineData(await apiGetData())
    data.team = normalizeTeam(data.team ?? [])
    baselineData = cloneData(data)
    currentData = cloneData(data)
    activeDataFileHandle = null
    activeDataFileLabel = 'pipeline.json'
    activeFileNeedsPickerSave = false
  }
  catch (error) { serverError = error instanceof Error ? error.message : 'Unknown error' }
  render()
}

void bootstrap()
