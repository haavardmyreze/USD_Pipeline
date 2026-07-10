export const CSV_WRAP_CHAR_THRESHOLD = 48

const WRAP_TEXT_STORAGE_KEY = 'mdv-csv-wrap-text'

export function loadCsvWrapTextPreference() {
  try {
    return localStorage.getItem(WRAP_TEXT_STORAGE_KEY) === 'true'
  } catch {
    return false
  }
}

export function saveCsvWrapTextPreference(enabled: boolean) {
  try {
    localStorage.setItem(WRAP_TEXT_STORAGE_KEY, String(enabled))
  } catch {
    // ignore persistence errors (e.g. private mode)
  }
}

export function shouldWrapCsvCell(value: string, wrapTextEnabled: boolean) {
  return wrapTextEnabled && value.trim().length > CSV_WRAP_CHAR_THRESHOLD
}
