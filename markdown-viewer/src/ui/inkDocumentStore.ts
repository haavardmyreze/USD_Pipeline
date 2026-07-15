import type { InkLayer } from './inkLayer'
import type { StoredStroke } from './inkLayer'

export type InkHistoryEntry = {
  layer: InkLayer
  stroke: StoredStroke
  index: number
}

export type InkDocumentState = {
  layers: InkLayer[]
  history: InkHistoryEntry[]
}

const store = new Map<string, InkDocumentState>()

function storeKey(docKey: string, zoomKey: number) {
  return `${docKey}::${zoomKey.toFixed(3)}`
}

export function getInkDocumentState(docKey: string, zoomKey: number): InkDocumentState {
  const key = storeKey(docKey, zoomKey)
  let state = store.get(key)
  if (!state) {
    state = { layers: [], history: [] }
    store.set(key, state)
  }
  return state
}

export function inkDocumentHasLayers(docKey: string, zoomKey: number) {
  return getInkDocumentState(docKey, zoomKey).layers.some((layer) => layer.strokes.length > 0)
}

export function clearInkDocumentState(docKey: string, zoomKey: number) {
  const state = getInkDocumentState(docKey, zoomKey)
  state.layers.length = 0
  state.history.length = 0
}
