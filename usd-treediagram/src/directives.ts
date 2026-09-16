/**
 * Settings written into an outline, so a `.txt` file carries its own look.
 *
 *     #! theme=light frame=none scale=2 title="Prims"
 *
 * They start with `#`, so to the outline itself they are only a comment.
 * The command-line renderer and the app's Open… both read them.
 */

import type { Options } from './render'

export interface Directives {
  options: Partial<Options>
  scale?: number
  problems: { line: number; message: string }[]
}

const FRAMES: Record<string, Options['frame']> = {
  panel: 'panel',
  flat: 'flat',
  none: 'transparent',
  transparent: 'transparent',
}

export function readDirectives(source: string): Directives {
  const result: Directives = { options: {}, problems: [] }
  source.split(/\r?\n/).forEach((text, line) => {
    const match = /^\s*#!(.*)$/.exec(text)
    if (!match) return
    for (const [, key, quoted, bare] of match[1]!.matchAll(/(\w+)=(?:"([^"]*)"|(\S+))/g)) {
      const value = quoted ?? bare ?? ''
      const problem = apply(result, key!.toLowerCase(), value)
      if (problem) result.problems.push({ line, message: problem })
    }
  })
  return result
}

function apply(result: Directives, key: string, value: string): string | null {
  const o = result.options
  const on = (v: string) => /^(on|yes|true|1)$/i.test(v)
  const number = Number(value)
  switch (key) {
    case 'mode':
      if (value === 'tree') o.mode = 'tree'
      else if (value === 'graph' || value === 'flowchart' || value === 'flow') o.mode = 'graph'
      else return `mode is tree or graph, not ${value}`
      return null
    case 'legend':
      o.legend = on(value)
      return null
    case 'grid':
      o.grid = on(value)
      return null
    case 'theme':
      if (value !== 'dark' && value !== 'light') return `theme is dark or light, not ${value}`
      o.theme = value
      return null
    case 'frame':
      if (!FRAMES[value]) return `frame is panel, flat or none, not ${value}`
      o.frame = FRAMES[value]
      return null
    case 'title':
      o.title = value
      return null
    case 'count':
      o.showCount = on(value)
      return null
    case 'types':
      o.showTypes = on(value)
      return null
    case 'stripes':
      o.stripes = on(value)
      return null
    case 'width':
    case 'minwidth':
      if (!Number.isFinite(number)) return `${key} needs a number`
      o.minWidth = number
      return null
    case 'margin':
    case 'padding':
      if (!Number.isFinite(number)) return `${key} needs a number`
      o.padding = number
      return null
    case 'scale':
      if (!(number > 0 && number <= 8)) return 'scale is a number from 0 to 8'
      result.scale = number
      return null
    default:
      return `Unknown setting ${key}`
  }
}
