import type { OpenDocument } from './documentState'

const DB_NAME = 'mdv-recent-cache'
const STORE_NAME = 'documents'
const DB_VERSION = 1

const memoryCache = new Map<string, OpenDocument>()

function cloneOpenDocument(doc: OpenDocument): OpenDocument {
  if (doc.source.format === 'pdf') {
    return {
      ...doc,
      source: {
        format: 'pdf',
        data: doc.source.data.slice(0),
      },
    }
  }

  if (doc.source.format === 'image') {
    return {
      ...doc,
      source: {
        format: 'image',
        data: doc.source.data.slice(0),
        fileName: doc.source.fileName,
      },
    }
  }

  return doc
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION)
    request.onerror = () => reject(request.error ?? new Error('IndexedDB open failed'))
    request.onsuccess = () => resolve(request.result)
    request.onupgradeneeded = () => {
      const db = request.result
      if (!db.objectStoreNames.contains(STORE_NAME)) {
        db.createObjectStore(STORE_NAME)
      }
    }
  })
}

function withStore<T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> {
  return openDb().then(
    (db) =>
      new Promise<T>((resolve, reject) => {
        const tx = db.transaction(STORE_NAME, mode)
        const store = tx.objectStore(STORE_NAME)
        const request = run(store)
        let result: T

        request.onerror = () => reject(request.error ?? new Error('IndexedDB request failed'))
        request.onsuccess = () => {
          result = request.result as T
        }
        tx.oncomplete = () => resolve(result)
        tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
        tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
      }),
  )
}

export function rememberRecentDocumentInMemory(docKey: string, doc: OpenDocument) {
  if (doc.libraryId) {
    return
  }

  memoryCache.set(docKey, cloneOpenDocument(doc))
}

export async function cacheRecentDocument(docKey: string, doc: OpenDocument) {
  if (doc.libraryId) {
    return
  }

  const snapshot = cloneOpenDocument(doc)
  rememberRecentDocumentInMemory(docKey, snapshot)

  try {
    await withStore('readwrite', (store) => store.put(snapshot, docKey))
  } catch {
    // IndexedDB may be unavailable; memory cache still helps this session.
  }
}

export async function loadCachedRecentDocument(docKey: string): Promise<OpenDocument | null> {
  const cached = memoryCache.get(docKey)
  if (cached) {
    return cloneOpenDocument(cached)
  }

  try {
    const doc = await withStore<OpenDocument | undefined>('readonly', (store) =>
      store.get(docKey),
    )
    if (!doc) {
      return null
    }

    const snapshot = cloneOpenDocument(doc)
    memoryCache.set(docKey, snapshot)
    return snapshot
  } catch {
    return null
  }
}

export async function pruneRecentDocumentCache(validDocKeys: string[]) {
  const keep = new Set(validDocKeys)

  for (const key of memoryCache.keys()) {
    if (!keep.has(key)) {
      memoryCache.delete(key)
    }
  }

  try {
    const db = await openDb()
    await new Promise<void>((resolve, reject) => {
      const tx = db.transaction(STORE_NAME, 'readwrite')
      const store = tx.objectStore(STORE_NAME)
      const request = store.openCursor()

      request.onerror = () => reject(request.error ?? new Error('IndexedDB cursor failed'))
      request.onsuccess = () => {
        const cursor = request.result
        if (!cursor) {
          return
        }

        if (!keep.has(String(cursor.key))) {
          cursor.delete()
        }
        cursor.continue()
      }
      tx.oncomplete = () => resolve()
      tx.onerror = () => reject(tx.error ?? new Error('IndexedDB transaction failed'))
      tx.onabort = () => reject(tx.error ?? new Error('IndexedDB transaction aborted'))
    })
  } catch {
    // ignore prune errors
  }
}

export function clearRecentDocumentMemoryCache() {
  memoryCache.clear()
}
