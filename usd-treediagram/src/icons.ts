/**
 * Houdini's Scene Graph Tree icons, ready to draw on a canvas.
 *
 * The files are SideFX's official SVGs, copied unchanged from usd-refgraph.
 * They size themselves at 100%, which leaves a canvas guessing at their
 * aspect, so each is given a fixed 16×16 before it is loaded as an image.
 * Every icon is decoded up front: the renderer draws synchronously and
 * cannot wait for one to arrive.
 */

const SOURCES = import.meta.glob<string>('./assets/houdini/*.svg', {
  eager: true,
  query: '?raw',
  import: 'default',
})

const IMAGES = new Map<string, HTMLImageElement>()

/** Icon names, without folder or extension, for the reference list. */
export const ICON_NAMES = Object.keys(SOURCES)
  .map((path) => path.replace(/^.*\/|\.svg$/g, ''))
  .sort()

export async function loadIcons(): Promise<void> {
  await Promise.all(
    Object.entries(SOURCES).map(async ([path, svg]) => {
      const name = path.replace(/^.*\/|\.svg$/g, '')
      const sized = svg
        .replace(/(<svg\b[^>]*?)\swidth="[^"]*"/, '$1 width="16"')
        .replace(/(<svg\b[^>]*?)\sheight="[^"]*"/, '$1 height="16"')
      const img = new Image()
      img.src = URL.createObjectURL(new Blob([sized], { type: 'image/svg+xml' }))
      try {
        await img.decode()
        IMAGES.set(name, img)
      } catch {
        // A broken icon falls back to the question mark.
      }
    }),
  )
}

export function iconImage(name: string): HTMLImageElement | undefined {
  return IMAGES.get(name) ?? IMAGES.get('SCENEGRAPH__primtype__unknown')
}

/** The icon's URL, for showing it in the page itself. */
export function iconUrl(name: string): string {
  return iconImage(name)?.src ?? ''
}

/**
 * The Scene Graph Tree icon for a prim type, as Houdini names them: the
 * schema lowercased, lights without the `primtype` prefix, and versioned
 * schemas (`DomeLight_1`) sharing their unversioned icon.
 */
export function primTypeIcon(typeName: string): string {
  if (!typeName) return 'SCENEGRAPH__primtype__'
  const base = typeName.replace(/_\d+$/, '').toLowerCase()
  for (const name of [`SCENEGRAPH__primtype__${base}`, `SCENEGRAPH__${base}`]) {
    if (IMAGES.has(name)) return name
  }
  return 'SCENEGRAPH__primtype__unknown'
}

function kindIcon(kind: string): string | null {
  if (!kind) return null
  const name = `SCENEGRAPH__kind__${kind.toLowerCase()}`
  return IMAGES.has(name) ? name : null
}

/** Types that only group what is beneath them, so their type says little. */
const GROUPING_TYPES = new Set(['', 'Xform', 'Scope'])

/**
 * The one icon a row shows. On a container the kind's stars stand in for the
 * type, as in usd-refgraph; any other type keeps its own icon. An `icon=`
 * override wins, by type name or by full file name.
 */
export function primIcon(typeName: string, kind: string, override: string): string {
  if (override) {
    if (IMAGES.has(override)) return override
    const byKind = kindIcon(override)
    if (byKind) return byKind
    return primTypeIcon(override)
  }
  const stars = GROUPING_TYPES.has(typeName) ? kindIcon(kind) : null
  return stars ?? primTypeIcon(typeName)
}
