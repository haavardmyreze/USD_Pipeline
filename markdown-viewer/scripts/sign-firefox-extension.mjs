import { access } from 'node:fs/promises'
import { spawn } from 'node:child_process'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))
const root = path.resolve(__dirname, '..')
const sourceDir = path.join(root, 'dist-firefox-extension')
const artifactsDir = path.join(root, 'release', 'firefox-extension-signed')

function run(command, args) {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, {
      cwd: root,
      stdio: 'inherit',
      shell: process.platform === 'win32',
      env: process.env,
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
  const apiKey = process.env.WEB_EXT_API_KEY?.trim()
  const apiSecret = process.env.WEB_EXT_API_SECRET?.trim()

  if (!apiKey || !apiSecret) {
    throw new Error(
      'Set WEB_EXT_API_KEY and WEB_EXT_API_SECRET (from addons.mozilla.org) before signing.',
    )
  }

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
    'sign',
    '--api-key',
    apiKey,
    '--api-secret',
    apiSecret,
    '--source-dir',
    sourceDir,
    '--artifacts-dir',
    artifactsDir,
    '--channel',
    'unlisted',
    '--overwrite-dest',
  ])

  console.log('')
  console.log(`Signed package written to: ${artifactsDir}`)
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error)
  process.exitCode = 1
})
