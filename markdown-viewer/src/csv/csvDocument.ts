import type { SectionRef } from '../headings'
import Papa from 'papaparse'

export type CsvParseError = {
  row: number
  message: string
}

export type CsvRowSection = SectionRef & {
  startRow: number
  endRow: number
}

export type CsvDocumentIndex = {
  headers: string[]
  rows: string[][]
  rowCount: number
  colCount: number
  plainText: string
  fullText: string
  sections: CsvRowSection[]
  errors: CsvParseError[]
}

const ROWS_PER_SECTION = 50

/** Excel-style column letter(s) for a 0-based index: 0 → A, 25 → Z, 26 → AA. */
export function csvColumnLabel(colIndex: number): string {
  let n = colIndex + 1
  let label = ''
  while (n > 0) {
    n -= 1
    label = String.fromCharCode(65 + (n % 26)) + label
    n = Math.floor(n / 26)
  }
  return label
}

function normalizeRow(row: string[], colCount: number) {
  const normalized = [...row]
  while (normalized.length < colCount) {
    normalized.push('')
  }
  return normalized.slice(0, colCount)
}

function buildColumnHeaders(colCount: number) {
  return Array.from({ length: colCount }, (_, index) => csvColumnLabel(index))
}

function buildSectionsAndFullText(columnHeaders: string[], rows: string[][]) {
  const sections: CsvRowSection[] = []
  const parts: string[] = []

  if (rows.length === 0) {
    if (columnHeaders.length > 0) {
      sections.push({
        id: 'csv-header',
        text: 'Header',
        level: 1,
        startRow: 0,
        endRow: 0,
      })
      parts.push(`### Header\n${columnHeaders.join('\t')}`)
    }

    return { sections, fullText: parts.join('\n\n') }
  }

  const headerLine = columnHeaders.join('\t')

  for (let start = 0; start < rows.length; start += ROWS_PER_SECTION) {
    const end = Math.min(start + ROWS_PER_SECTION, rows.length)
    const id = `csv-rows-${start + 1}-${end}`
    const text = `Rows ${start + 1}–${end}`
    sections.push({
      id,
      text,
      level: 1,
      startRow: start,
      endRow: end - 1,
    })

    const rowLines = rows
      .slice(start, end)
      .map((row) => row.join('\t'))
      .join('\n')
    parts.push(`### ${text}\n${headerLine}\n${rowLines}`)
  }

  return { sections, fullText: parts.join('\n\n') }
}

export function csvCellGlobalOffset(row: number, col: number, colCount: number) {
  return row * Math.max(colCount, 1) + col
}

export function getCsvCellValue(index: CsvDocumentIndex, row: number, col: number) {
  return index.rows[row]?.[col] ?? ''
}

export function rowSectionFromId(sectionId: string) {
  const match = /^csv-rows-(\d+)-(\d+)$/.exec(sectionId)
  if (!match) {
    return null
  }

  return {
    startRow: Number(match[1]) - 1,
    endRow: Number(match[2]) - 1,
  }
}

export function buildCsvDocumentIndex(raw: string): CsvDocumentIndex {
  const parsed = Papa.parse<string[]>(raw, {
    skipEmptyLines: 'greedy',
  })

  const errors: CsvParseError[] = parsed.errors.map((error) => ({
    row: error.row ?? 0,
    message: error.message,
  }))

  const nonEmptyRows = parsed.data.filter((row) => row.some((cell) => cell.trim() !== ''))
  if (nonEmptyRows.length === 0) {
    return {
      headers: [],
      rows: [],
      rowCount: 0,
      colCount: 0,
      plainText: '',
      fullText: '',
      sections: [],
      errors,
    }
  }

  const colCount = Math.max(...nonEmptyRows.map((row) => row.length), 0)
  const headers = buildColumnHeaders(colCount)
  const rows = nonEmptyRows.map((row) => normalizeRow(row, colCount))

  const plainText = rows.map((row) => row.join('\t')).join('\n')
  const { sections, fullText } = buildSectionsAndFullText(headers, rows)

  return {
    headers,
    rows,
    rowCount: rows.length,
    colCount,
    plainText,
    fullText,
    sections,
    errors,
  }
}
