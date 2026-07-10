import type { CsvCommentAnchor } from '../documentComments'
import type { CsvDocumentIndex } from './csvDocument'
import { csvCellGlobalOffset } from './csvDocument'

function getCellFromNode(node: Node | null) {
  let current: Node | null = node

  while (current) {
    if (current instanceof HTMLElement) {
      const cell = current.closest<HTMLElement>('[data-csv-row][data-csv-col]')
      if (cell?.dataset.csvRow && cell.dataset.csvCol) {
        return {
          row: Number(cell.dataset.csvRow),
          col: Number(cell.dataset.csvCol),
          element: cell,
        }
      }
    }
    current = current.parentNode
  }

  return null
}

export function resolveCsvSelectionAnchor(
  selection: Selection,
  scope: HTMLElement,
  index: CsvDocumentIndex,
): CsvCommentAnchor | null {
  if (!selection.rangeCount || selection.isCollapsed) {
    return null
  }

  const range = selection.getRangeAt(0)
  if (!scope.contains(range.commonAncestorContainer)) {
    return null
  }

  const quote = selection.toString().trim()
  if (!quote) {
    return null
  }

  const cell = getCellFromNode(range.commonAncestorContainer)
  if (!cell) {
    return null
  }

  const cellValue = index.rows[cell.row]?.[cell.col] ?? ''
  const resolvedQuote = cellValue.includes(quote) ? quote : cellValue.trim() || quote

  return {
    kind: 'csv',
    row: cell.row,
    col: cell.col,
    quote: resolvedQuote,
    globalOffset: csvCellGlobalOffset(cell.row, cell.col, index.colCount),
  }
}
