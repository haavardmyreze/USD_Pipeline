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

export function getInkDocumentState(docKey: string): InkDocumentState {
  let state = store.get(docKey)
  if (!state) {
    state = { layers: [], history: [] }
    store.set(docKey, state)
  }
  return state
}

export function inkDocumentHasLayers(docKey: string) {
  return getInkDocumentState(docKey).layers.some((layer) => layer.strokes.length > 0)
}

export function clearInkDocumentState(docKey: string) {
  const state = getInkDocumentState(docKey)
  state.layers.length = 0
  state.history.length = 0
}
