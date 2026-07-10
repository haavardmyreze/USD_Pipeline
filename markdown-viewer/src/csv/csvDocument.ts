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

function normalizeRow(row: string[], colCount: number) {
  const normalized = [...row]
  while (normalized.length < colCount) {
    normalized.push('')
  }
  return normalized.slice(0, colCount)
}

function buildHeaders(headerRow: string[], colCount: number) {
  return normalizeRow(headerRow, colCount).map((value, index) => {
    const trimmed = value.trim()
    return trimmed || `Column ${index + 1}`
  })
}

function buildSectionsAndFullText(headers: string[], rows: string[][]) {
  const sections: CsvRowSection[] = []
  const parts: string[] = []

  if (rows.length === 0) {
    if (headers.length > 0) {
      sections.push({
        id: 'csv-header',
        text: 'Header',
        level: 1,
        startRow: 0,
        endRow: 0,
      })
      parts.push(`### Header\n${headers.join('\t')}`)
    }

    return { sections, fullText: parts.join('\n\n') }
  }

  const headerLine = headers.join('\t')

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
  const headers = buildHeaders(nonEmptyRows[0], colCount)
  const rows =
    nonEmptyRows.length > 1
      ? nonEmptyRows.slice(1).map((row) => normalizeRow(row, colCount))
      : []

  const plainText = [headers.join('\t'), ...rows.map((row) => row.join('\t'))].join('\n')
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
