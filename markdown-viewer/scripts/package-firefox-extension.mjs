import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'dist-firefox-extension')
const artifactsDir = path.join(root, 'release', 'firefox-extension')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
    })

    child.on('error', reject)
    child.on('close', (code) => {
      if (code === 0) {
        resolve()
        return
      }
      reject(new Error(`${command} exited with code ${code ?? 'unknown'}`))
    })
  })
}

async function main() {
  try {
    await access(sourceDir)
  } catch {
    throw new Error(
      'Extension source folder is missing. Run "npm run build:firefox-extension" first.',
    )
  }

  const webExtBin =
    process.platform === 'win32'
      ? path.join(root, 'node_modules', '.bin', 'web-ext.cmd')
      : path.join(root, 'node_modules', '.bin', 'web-ext')

  await run(webExtBin, [
    'build',
    '--source-dir',
    sourceDir,
    '--artifacts-dir',
    artifactsDir,
    '--filename',
    'quiet-reader-markdown.xpi',
    '--overwrite-dest',
  ])

  console.log('')
  console.log(`Install in Firefox: about:addons -> gear -> Install Add-on From File`)
  console.log(`Package: ${path.join(artifactsDir, 'quiet-reader-markdown.xpi')}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
