import { spawn, type ChildProcess } from 'node:child_process'
import { existsSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { dirname, resolve } from 'node:path'
import { defineConfig, type Plugin } from 'vite'

const here = dirname(fileURLToPath(import.meta.url))
const API_PORT = 8765

/** The interpreter to run the backend with: prefer the project venv. */
function pythonExecutable(): string {
  const candidates = [
    resolve(here, '.venv/Scripts/python.exe'),
    resolve(here, '.venv/bin/python'),
  ]
  return candidates.find(existsSync) ?? 'python'
}

/**
 * Runs the Python API alongside the dev server, so `npm run dev` is the only
 * command you need. Its output is prefixed and forwarded to this terminal.
 */
function pythonBackend(): Plugin {
  let child: ChildProcess | null = null

  return {
    name: 'usd-refgraph:backend',
    apply: 'serve',
    configureServer(server) {
      const serverDir = resolve(here, 'server')
      const exe = pythonExecutable()
      let restarting = false

      const relay = (chunk: Buffer, isError: boolean) => {
        const text = chunk.toString().trimEnd()
        if (!text) return
        const tag = isError ? '\x1b[31m[usd]\x1b[0m' : '\x1b[35m[usd]\x1b[0m'
        for (const line of text.split('\n')) server.config.logger.info(`${tag} ${line}`)
      }

      const start = () => {
        child = spawn(
          exe,
          ['-m', 'usd_refgraph', '--no-browser', '--quiet', '--port', String(API_PORT)],
          { cwd: serverDir, stdio: ['ignore', 'pipe', 'pipe'] },
        )
        child.stdout?.on('data', (c: Buffer) => relay(c, false))
        child.stderr?.on('data', (c: Buffer) => relay(c, true))

        child.on('error', (err) => {
          server.config.logger.error(
            `\x1b[31m[usd]\x1b[0m could not start the backend with "${exe}": ${err.message}\n` +
              '      Create the environment first:  python -m venv .venv && ' +
              '.venv/Scripts/pip install usd-core',
          )
        })
        child.on('exit', (code) => {
          if (code && !restarting) {
            server.config.logger.error(`\x1b[31m[usd]\x1b[0m backend exited (${code})`)
          }
        })
      }

      const stop = () => {
        const previous = child
        child = null
        previous?.kill()
      }

      start()

      // Python is a separate process, so Vite's HMR cannot reach it. Watch the
      // backend's sources and restart it, or an edit there silently does
      // nothing until you restart the whole dev server.
      server.watcher.add(serverDir)
      server.watcher.on('change', (file) => {
        if (!file.endsWith('.py')) return
        restarting = true
        server.config.logger.info('\x1b[35m[usd]\x1b[0m restarting backend…')
        stop()
        // Give the socket a moment to close before rebinding it.
        setTimeout(() => {
          restarting = false
          start()
        }, 300)
      })

      process.once('exit', stop)
      process.once('SIGINT', stop)
      process.once('SIGTERM', stop)
    },
    closeBundle() {
      child?.kill()
      child = null
    },
  }
}

export default defineConfig({
  plugins: [pythonBackend()],
  resolve: {
    alias: {
      '@shared': resolve(here, 'src/shared'),
      '@client': resolve(here, 'src/client'),
    },
  },
  server: {
    port: 5173,
    strictPort: false,
    open: true,
    proxy: {
      '/api': {
        target: `http://127.0.0.1:${API_PORT}`,
        changeOrigin: false,
      },
    },
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    target: 'es2022',
  },
})
