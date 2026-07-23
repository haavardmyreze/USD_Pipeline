import { describe, expect, it } from 'vitest'
import {
  loadRecentDocuments,
  recentDocumentNeedsCache,
  type RecentDocument,
} from './recentDocuments'

describe('recentDocuments', () => {
  it('treats imported entries without kind as cacheable', () => {
    const entry = {
      id: 'import:demo.pdf:abc',
      fileName: 'demo.pdf',
      format: 'pdf' as const,
      docKey: 'import:demo.pdf:abc',
      openedAt: Date.now(),
    } satisfies Omit<RecentDocument, 'kind'>

    expect(recentDocumentNeedsCache(entry as RecentDocument)).toBe(true)
  })

  it('does not cache library or external entries', () => {
    expect(
      recentDocumentNeedsCache({
        id: 'library:intro',
        kind: 'library',
        fileName: 'intro.md',
        format: 'markdown',
        docKey: 'intro',
        libraryId: 'intro',
        openedAt: Date.now(),
      }),
    ).toBe(false)

    expect(
      recentDocumentNeedsCache({
        id: 'external:https://example.com/a.pdf',
        kind: 'external',
        fileName: 'a.pdf',
        format: 'pdf',
        docKey: 'import:a.pdf:abc',
        externalSrc: 'https://example.com/a.pdf',
        openedAt: Date.now(),
      }),
    ).toBe(false)
  })

  it('normalizes legacy recent entries when loading', () => {
    const storage = new Map<string, string>()
    const original = globalThis.localStorage

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: {
        getItem: (key: string) => storage.get(key) ?? null,
        setItem: (key: string, value: string) => {
          storage.set(key, value)
        },
        removeItem: (key: string) => {
          storage.delete(key)
        },
      },
    })

    storage.set(
      'mdv-recent-docs',
      JSON.stringify([
        {
          id: 'import:notes.md:abc',
          fileName: 'notes.md',
          docKey: 'import:notes.md:abc',
          openedAt: 1,
        },
      ]),
    )

    expect(loadRecentDocuments()).toEqual([
      {
        id: 'import:notes.md:abc',
        fileName: 'notes.md',
        docKey: 'import:notes.md:abc',
        openedAt: 1,
        kind: 'import',
        format: 'markdown',
      },
    ])

    storage.set(
      'mdv-recent-docs',
      JSON.stringify([
        {
          id: 'import:clipboard.py:abc',
          fileName: 'clipboard.py',
          docKey: 'import:clipboard.py:abc',
          openedAt: 2,
        },
      ]),
    )

    expect(loadRecentDocuments()).toEqual([
      {
        id: 'import:clipboard.py:abc',
        fileName: 'clipboard.py',
        docKey: 'import:clipboard.py:abc',
        openedAt: 2,
        kind: 'clipboard',
        format: 'code',
      },
    ])

    Object.defineProperty(globalThis, 'localStorage', {
      configurable: true,
      value: original,
    })
  })
})
