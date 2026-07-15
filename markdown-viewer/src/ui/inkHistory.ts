import {
  cloneStoredStroke,
  redrawInkLayer,
  type InkLayer,
  type StoredStroke,
  viewportCanvasSize,
} from './inkLayer'
import type { InkHistoryEntry } from './inkDocumentStore'

export function pushInkHistory(
  history: InkHistoryEntry[],
  layer: InkLayer,
  stroke: StoredStroke,
  index: number,
) {
  history.push({
    layer,
    stroke: cloneStoredStroke(stroke),
    index,
  })
}

export function undoInkHistory(history: InkHistoryEntry[]) {
  const entry = history.pop()
  if (!entry) {
    return false
  }

  const size = viewportCanvasSize()
  const existing = entry.layer.strokes[entry.index]

  if (existing?.id === entry.stroke.id) {
    entry.layer.strokes.splice(entry.index, 1)
  } else {
    entry.layer.strokes.splice(entry.index, 0, cloneStoredStroke(entry.stroke))
  }

  redrawInkLayer(entry.layer, size)
  return true
}
