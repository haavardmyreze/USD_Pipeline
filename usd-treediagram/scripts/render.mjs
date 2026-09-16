#!/usr/bin/env node
/**
 * Render outline files to PNG without opening the app.
 *
 *   npm run render -- trees/shot.txt                   -> trees/shot.png
 *   npm run render -- trees/shot.txt -o docs/shot.png
 *   npm run render -- trees/ --out-dir docs/img        every outline in a folder
 *   npm run render -- docs/img/shot.png                re-render a saved PNG from its own outline
 *
 * It serves the app's own drawing code with Vite and runs it in the installed
 * Chrome or Edge, headless, so the image is exactly what the app would save.
 */

import { mkdir, readFile, readdir, stat, writeFile } from 'node:fs/promises'
import { basename, dirname, extname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { chromium } from 'playwright-core'
import { createServer } from 'vite'

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..')
const OUTLINE_EXT = new Set(['.txt', '.tree'])

const HELP = `Render USD tree outlines and flowcharts to PNG.

Usage: npm run render -- <input...> [options]

Inputs are outline files (.txt, .tree), folders of them, PNGs saved by this
tool (re-rendered from the outline inside), or - for an outline on stdin.

Options:
  -o, --out <file>      Output file (one input only). Default: input name with .png
  --out-dir <dir>       Write every PNG into this folder
  --mode tree|graph     A prim tree or a flowchart (default: guessed from arrows)
  --theme dark|light    Colours (default dark)
  --frame panel|flat|none
  --scale <n>           Pixel density, 1-8 (default 2)
  --title <text>        Heading above the tree
  --no-count            No prim count after the heading
  --no-types            No type column
  --no-stripes          No shading on every other row (trees)
  --no-legend           No key to the arc kinds (flowcharts)
  --grid                The dotted stage grid behind a flowchart
  --width <px>          Minimum width (default 320)
  --margin <px>         Space around the image (default 16)
  --strict              Exit with an error when an outline has warnings
  --check               Only report problems; write nothing

Command-line settings override "#! key=value" lines in the file.
`

function parseArgs(argv) {
  const args = { inputs: [], options: {}, scale: undefined, out: null, outDir: null, strict: false, check: false }
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i]
    const next = () => {
      const value = argv[++i]
      if (value === undefined) fail(`${arg} needs a value`)
      return value
    }
    switch (arg) {
      case '-h':
      case '--help':
        process.stdout.write(HELP)
        process.exit(0)
      case '-o':
      case '--out':
        args.out = next()
        break
      case '--out-dir':
        args.outDir = next()
        break
      case '--mode': {
        const mode = next()
        const map = { tree: 'tree', graph: 'graph', flowchart: 'graph' }
        if (!map[mode]) fail('--mode is tree or graph')
        args.options.mode = map[mode]
        break
      }
      case '--no-legend':
        args.options.legend = false
        break
      case '--grid':
        args.options.grid = true
        break
      case '--theme': {
        const theme = next()
        if (theme !== 'dark' && theme !== 'light') fail('--theme is dark or light')
        args.options.theme = theme
        break
      }
      case '--frame': {
        const frame = next()
        const map = { panel: 'panel', flat: 'flat', none: 'transparent', transparent: 'transparent' }
        if (!map[frame]) fail('--frame is panel, flat or none')
        args.options.frame = map[frame]
        break
      }
      case '--scale':
        args.scale = number(arg, next(), 0.1, 8)
        break
      case '--title':
        args.options.title = next()
        break
      case '--no-count':
        args.options.showCount = false
        break
      case '--no-types':
        args.options.showTypes = false
        break
      case '--no-stripes':
        args.options.stripes = false
        break
      case '--width':
        args.options.minWidth = number(arg, next(), 0, 10000)
        break
      case '--margin':
        args.options.padding = number(arg, next(), 0, 1000)
        break
      case '--strict':
        args.strict = true
        break
      case '--check':
        args.check = true
        break
      default:
        if (arg.startsWith('-') && arg !== '-') fail(`Unknown option ${arg}`)
        args.inputs.push(arg)
    }
  }
  if (!args.inputs.length) fail('Give at least one outline file. --help for usage.')
  return args
}

function number(flag, text, min, max) {
  const value = Number(text)
  if (!Number.isFinite(value) || value < min || value > max) fail(`${flag} must be a number from ${min} to ${max}`)
  return value
}

function fail(message) {
  process.stderr.write(`error: ${message}\n`)
  process.exit(1)
}

/** Every input as { kind, path }, with folders expanded. */
async function collect(inputs) {
  const found = []
  for (const input of inputs) {
    if (input === '-') {
      // Read before Vite and the browser start, which otherwise leave the
      // pipe unread and let the process exit early.
      found.push({ kind: 'stdin', path: 'stdin', source: await readStdin() })
      continue
    }
    const path = resolve(input)
    const info = await stat(path).catch(() => fail(`No such file or folder: ${input}`))
    if (info.isDirectory()) {
      for (const entry of (await readdir(path, { recursive: true })).sort()) {
        if (OUTLINE_EXT.has(extname(entry).toLowerCase())) found.push({ kind: 'outline', path: join(path, entry), rel: entry })
      }
    } else {
      const ext = extname(path).toLowerCase()
      found.push({ kind: ext === '.png' ? 'png' : 'outline', path })
    }
  }
  if (!found.length) fail('No outline files found')
  return found
}

async function readStdin() {
  const chunks = []
  for await (const chunk of process.stdin) chunks.push(chunk)
  return Buffer.concat(chunks).toString('utf8')
}

async function launch() {
  const executablePath = process.env.TREEDIAGRAM_BROWSER
  if (executablePath) return chromium.launch({ executablePath })
  const tried = []
  for (const channel of ['chrome', 'msedge', 'chromium']) {
    try {
      return await chromium.launch({ channel })
    } catch (error) {
      tried.push(channel)
    }
  }
  fail(
    `Could not start ${tried.join(', ')}. Install Chrome or Edge, ` +
      'or set TREEDIAGRAM_BROWSER to a Chromium executable.',
  )
}

async function main() {
  const args = parseArgs(process.argv.slice(2))
  const inputs = await collect(args.inputs)
  if (args.out && inputs.length > 1) fail('-o takes one input; use --out-dir for several')

  const server = await createServer({
    root,
    configFile: join(root, 'vite.config.ts'),
    logLevel: 'error',
    server: { port: 5199, strictPort: false, open: false },
  })
  await server.listen()
  const browser = await launch()

  let failed = false
  let warned = false
  try {
    const page = await browser.newPage()
    page.on('pageerror', (error) => process.stderr.write(`page error: ${error.message}\n`))
    const url = server.resolvedUrls?.local[0] ?? 'http://localhost:5199/'
    await page.goto(new URL('headless.html', url).href)
    await page.waitForFunction(() => window.treeDiagram, null, { timeout: 30_000 })

    for (const input of inputs) {
      let source
      let name = basename(input.path, extname(input.path))
      let fileOptions = {}
      if (input.kind === 'stdin') {
        source = input.source
        name = 'tree'
      } else if (input.kind === 'png') {
        const base64 = (await readFile(input.path)).toString('base64')
        const stored = await page.evaluate((b) => window.treeDiagram.outlineOf(b), base64)
        if (!stored) {
          process.stderr.write(`error: ${input.path} was not saved by this tool; it has no outline\n`)
          failed = true
          continue
        }
        source = stored.source
        name = stored.name ?? name
        // A saved PNG keeps the look it was saved with, unless told otherwise.
        fileOptions = stored.options ?? {}
      } else {
        source = await readFile(input.path, 'utf8')
      }

      const result = await page.evaluate((request) => window.treeDiagram.render(request), {
        name,
        source,
        options: { ...fileOptions, ...args.options },
        scale: args.scale,
      })

      const label = input.kind === 'stdin' ? 'stdin' : input.path
      for (const problem of result.problems) {
        warned = true
        process.stderr.write(`warning: ${label}:${problem.line + 1}: ${problem.message}\n`)
      }
      if (args.check) {
        process.stdout.write(`checked ${label} (${result.mode}, ${result.problems.length} warnings)\n`)
        continue
      }

      const out = args.out
        ? resolve(args.out)
        : args.outDir
          ? join(resolve(args.outDir), (input.rel ?? basename(input.path)).replace(/\.[^./\\]+$/, '') + '.png')
          : input.kind === 'stdin'
            ? resolve('tree.png')
            : input.path.replace(/\.[^./\\]+$/, '') + '.png'
      await mkdir(dirname(out), { recursive: true })
      await writeFile(out, Buffer.from(result.png, 'base64'))
      process.stdout.write(`wrote ${out} (${result.width}x${result.height}, ${result.scale}x, ${result.mode})\n`)
    }
  } catch (error) {
    process.stderr.write(`error: ${error.message}\n`)
    failed = true
  } finally {
    await browser.close()
    await server.close()
  }
  if (failed || (args.strict && warned)) process.exit(1)
}

main()
