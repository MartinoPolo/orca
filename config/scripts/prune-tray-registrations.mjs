import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'

const require = createRequire(import.meta.url)
const NOTIFY_ICON_SETTINGS = 'HKCU\\Control Panel\\NotifyIconSettings'
const EXECUTABLE_NAME = 'orca.exe'

export function parseTrayRegistrations(registryQueryOutput) {
  const registrations = []
  let key = null
  for (const line of registryQueryOutput.split(/\r?\n/)) {
    if (line.startsWith('HKEY_')) {
      key = line.trim()
      continue
    }
    const match = /^\s+ExecutablePath\s+REG_SZ\s+(.+)$/.exec(line)
    if (key && match) {
      registrations.push({ key, executablePath: match[1].trim() })
    }
  }
  return registrations
}

export function selectStaleOrcaRegistrations(registrations, keptExecutablePaths) {
  const kept = new Set(
    keptExecutablePaths.map((filePath) => path.win32.normalize(filePath).toLowerCase())
  )
  return registrations.filter(({ executablePath }) => {
    const normalized = path.win32.normalize(executablePath).toLowerCase()
    return path.win32.basename(normalized) === EXECUTABLE_NAME && !kept.has(normalized)
  })
}

function keptExecutablePaths() {
  const paths = [path.join(process.env.LOCALAPPDATA, 'Programs', 'orca', 'Orca.exe')]
  const manifestPath = path.join(process.env.MPX_APPS ?? '', 'Orca-Lab', 'verified-build.json')
  if (process.env.MPX_APPS && fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    paths.push(path.join(manifest.build.directory, 'Orca.exe'))
  }
  return paths
}

async function runRegistry(args) {
  const { runProcess } = require('@orca/process-host')
  const result = await runProcess({
    program: 'reg.exe',
    args,
    timeoutMs: 30 * 1000,
    maxOutputBytes: 4 * 1024 * 1024
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`reg ${args.join(' ')} failed: ${result.stderr}`)
  }
  return result.stdout
}

async function main() {
  if (process.platform !== 'win32') {
    throw new Error('prune:tray supports Windows only')
  }
  const output = await runRegistry(['query', NOTIFY_ICON_SETTINGS, '/s', '/v', 'ExecutablePath'])
  const stale = selectStaleOrcaRegistrations(parseTrayRegistrations(output), keptExecutablePaths())
  for (const { key, executablePath } of stale) {
    await runRegistry(['delete', key, '/f'])
    console.log(`Removed tray registration: ${executablePath}`)
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error)
    process.exitCode = 1
  })
}
