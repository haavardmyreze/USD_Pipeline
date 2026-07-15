// Reusable palette groups shared by the readers and Home.

import { libraryDocs, type LibraryDoc } from '../library'
import { THEME_BASES, type ThemePreference } from '../theme'
import type { PaletteGroup, PaletteItem } from './CommandPalette'

export function sectionsPaletteGroup(
  sections: { id: string; text: string; level?: number }[],
  onNavigate: (id: string) => void,
): PaletteGroup {
  return {
    label: 'Sections',
    items: sections.map((section) => ({
      id: section.id,
      title: section.text,
      hint: section.level ? `h${section.level}` : undefined,
      action: () => onNavigate(section.id),
    })),
  }
}

export function libraryPaletteGroup(
  onOpen: (doc: LibraryDoc) => void,
  excludeFileName = '',
): PaletteGroup {
  return {
    label: 'Library',
    items: libraryDocs
      .filter((doc) => doc.fileName !== excludeFileName)
      .map((doc) => ({
        id: doc.id,
        title: doc.title,
        hint: `${doc.readingMinutes} min`,
        keywords: `open document ${doc.folder}`,
        action: () => onOpen(doc),
      })),
  }
}

export function themePaletteGroup(
  preference: ThemePreference,
  onSelect: (preference: ThemePreference) => void,
): PaletteGroup {
  const baseItems: PaletteItem[] = THEME_BASES.map((base) => ({
    id: `theme-${base.id}`,
    title: `Theme: ${base.label}`,
    keywords: 'theme color palette appearance',
    action: () => onSelect({ ...preference, base: base.id }),
  }))

  const modeItems: PaletteItem[] = (['light', 'dark', 'system'] as const).map(
    (mode) => ({
      id: `mode-${mode}`,
      title: `Appearance: ${mode[0].toUpperCase()}${mode.slice(1)}`,
      keywords: 'theme dark light mode appearance system',
      action: () => onSelect({ ...preference, mode }),
    }),
  )

  return { label: 'Theme', items: [...baseItems, ...modeItems] }
}

export function actionsPaletteGroup(items: PaletteItem[]): PaletteGroup {
  return { label: 'Actions', items }
}
