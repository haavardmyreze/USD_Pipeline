/**
 * Reading a version out of a workfile name.
 *
 * Publishing records the workfile that produced a layer, and artists version
 * those as they go — `workfile_mina_v001.hip`, `..._v002.hip`, and so on. Those
 * are not separate workfiles, they are the same one at different moments, so
 * the tool has to be able to see the family behind the filenames.
 *
 * Nothing on the USD side parses this: `hip_file` is a free string in
 * `customLayerData`, so the convention is only ever recognised here.
 */

export interface WorkfileName {
  /** The name exactly as it was recorded. */
  full: string
  /**
   * The name with its version token and extension removed. Every version of
   * one workfile shares this, and it is what the page groups on.
   */
  base: string
  /** The version number, when the name carries one. */
  version: number | null
  /** The version exactly as written, e.g. `v012`. */
  versionLabel: string | null
  /** Extension including the dot, e.g. `.hip`. Empty when there is none. */
  ext: string
}

/**
 * A trailing version token: `_v001`, `-v12`, `.v3`.
 *
 * The separator is required, so a name that merely ends in something like
 * `rev2` is left alone rather than being split in a surprising place. The
 * digits are capped at four, which is well past any sane version count and
 * stops a long numeric tail being mistaken for one.
 */
const VERSION_RE = /^(.*)[._-]v(\d{1,4})$/i

/** Houdini's own extensions, plus whatever else a studio might record. */
const KNOWN_EXTS = ['.hipnc', '.hiplc', '.hip']

export function parseWorkfile(name: string): WorkfileName {
  const trimmed = name.trim()

  const lower = trimmed.toLowerCase()
  const known = KNOWN_EXTS.find((ext) => lower.endsWith(ext))
  const dot = trimmed.lastIndexOf('.')
  const ext = known ?? (dot > 0 ? trimmed.slice(dot) : '')
  const stem = ext ? trimmed.slice(0, trimmed.length - ext.length) : trimmed

  const match = VERSION_RE.exec(stem)
  if (!match) {
    return { full: trimmed, base: stem, version: null, versionLabel: null, ext }
  }

  return {
    full: trimmed,
    base: match[1]!,
    version: Number(match[2]),
    // Kept as authored so `v01` and `v001` are not silently re-spelled.
    versionLabel: stem.slice(match[1]!.length + 1),
    ext,
  }
}

/**
 * The key that gathers every version of one workfile.
 *
 * The extension is part of it: `shot.hip` and `shot.hipnc` are different files
 * that happen to share a stem, not two versions of the same one.
 */
export function workfileKey(parsed: WorkfileName): string {
  return `${parsed.base}${parsed.ext.toLowerCase()}`
}

/**
 * Newest version first; anything unversioned sorts last.
 *
 * Two names can hold the same number and still be different files — a project
 * that has written both `v01` and `v001` has two of them on disk — so the tie
 * is broken on the name to keep the order stable rather than left to chance.
 */
export function byVersionDesc(a: WorkfileName, b: WorkfileName): number {
  if (a.version === null && b.version === null) return a.full.localeCompare(b.full)
  if (a.version === null) return 1
  if (b.version === null) return -1
  return b.version - a.version || a.full.localeCompare(b.full)
}
