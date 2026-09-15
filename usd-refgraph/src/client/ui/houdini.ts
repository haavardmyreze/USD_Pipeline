/**
 * Houdini's own icons, for anything that describes a USD prim.
 *
 * Artists read a scene graph in Houdini's Scene Graph Tree every day, so the
 * tree here draws each prim with the same icon Solaris gives it: an Xform's
 * axes, a Material's ball, a Scope's pill. The files are SideFX's official
 * SVGs, copied unchanged into `assets/houdini/` under their Houdini names
 * (`SCENEGRAPH__primtype__xform.svg` is `SCENEGRAPH_primtype_xform`).
 *
 * Unlike the app's own line icons in `icons.ts`, these are full-colour
 * artwork, so they are drawn as images and never recoloured.
 */

import { el } from '../util'

// Kept as files rather than inlined into the bundle: most are small enough for
// Vite to inline, which would add every icon to the script whether or not a
// scene ever uses it. As files, only the icons on screen are fetched.
const FILES = import.meta.glob<string>('../assets/houdini/*.svg', {
  eager: true,
  query: '?no-inline',
  import: 'default',
})

/** Icon name, without folder or extension, to its bundled URL. */
const URLS = new Map(
  Object.entries(FILES).map(([path, url]) => [path.replace(/^.*\/|\.svg$/g, ''), url]),
)

/** A Houdini icon by its file name, e.g. `LOP__reference`. */
export function houdiniIcon(name: string, title?: string, className = 'hicon'): HTMLImageElement {
  const img = el('img', className)
  img.src = URLS.get(name) ?? URLS.get('SCENEGRAPH__primtype__unknown') ?? ''
  img.alt = ''
  img.draggable = false
  img.setAttribute('aria-hidden', 'true')
  if (title) img.title = title
  return img
}

/**
 * The Scene Graph Tree icon for a prim type.
 *
 * Houdini names these after the schema, lowercased. Lights carry no
 * `primtype` prefix, and versioned schemas (`DomeLight_1`) share their
 * unversioned icon. A type Houdini has no icon for gets its question mark,
 * and a typeless prim gets the typeless icon, as it does in Solaris.
 */
export function primTypeIcon(typeName: string): string {
  if (!typeName) return 'SCENEGRAPH__primtype__'
  const base = typeName.replace(/_\d+$/, '').toLowerCase()
  for (const name of [`SCENEGRAPH__primtype__${base}`, `SCENEGRAPH__${base}`]) {
    if (URLS.has(name)) return name
  }
  return 'SCENEGRAPH__primtype__unknown'
}

/** The kind stars, for the kinds Houdini draws; nothing for a custom kind. */
export function kindIcon(kind: string | undefined): string | null {
  if (!kind) return null
  const name = `SCENEGRAPH__kind__${kind.toLowerCase()}`
  return URLS.has(name) ? name : null
}

/** Types that only group what is beneath them, so their type says little. */
const GROUPING_TYPES = new Set(['', 'Xform', 'Scope'])

/**
 * The one icon a prim's row shows.
 *
 * An Xform, a Scope or a typeless prim is a container, and on those an
 * authored kind — component, assembly, group — is the thing worth seeing, so
 * the kind's stars stand in for the type icon. Any other type keeps its own
 * icon: a Mesh is a Mesh whatever kind it carries. A kind Houdini has no icon
 * for leaves the type icon in place.
 */
export function primIcon(typeName: string, kind: string | undefined): string {
  const stars = GROUPING_TYPES.has(typeName) ? kindIcon(kind) : null
  return stars ?? primTypeIcon(typeName)
}

/** How an opinion's layer was brought in, as the LOP that authors that arc. */
export const ARC_ICON: Record<string, string> = {
  root: 'COMMON__usd',
  sublayer: 'LOP__sublayer',
  reference: 'LOP__reference',
  payload: 'SCENEGRAPH__payloads',
  variant: 'LOP__setvariant',
}
