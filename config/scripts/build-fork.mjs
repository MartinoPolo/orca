import fs from 'node:fs'
import path from 'node:path'
import { createRequire } from 'node:module'
import { resolvePnpmCliInvocation } from './pnpm-cli-invocation.mjs'

const require = createRequire(import.meta.url)
const { assertForkReleaseSource } = require('./fork-release-policy.cjs')
const { writeForkBuildSource } = require('./fork-build-source.cjs')
const { runProcess } = require('./fork-process-runtime.cjs')
const root = path.resolve(import.meta.dirname, '../..')

async function execute(stage, program, args, env, logDirectory) {
  const logPath = path.join(logDirectory, `${stage}.log`)
  console.log(`${stage} log: ${logPath}`)
  const result = await runProcess({
    program,
    args,
    cwd: root,
    env,
    timeoutMs: 30 * 60 * 1000,
    maxOutputBytes: 4 * 1024 * 1024,
    terminationBarrier: true
  })
  fs.writeFileSync(
    logPath,
    `command: ${program} ${args.join(' ')}\nexit: ${result.code}; timed out: ${result.timedOut}; truncated: ${result.outputTruncated}\n\nstdout:\n${result.stdout}\n\nstderr:\n${result.stderr}\n`
  )
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(`${stage} failed; see ${logPath}`)
  }
}

async function main() {
  if (process.platform !== 'win32' || process.arch !== 'x64') {
    throw new Error('build:fork currently supports Windows x64 only')
  }
  if (!process.env.MPX_APPS) {
    throw new Error('MPX_APPS is required')
  }
  const labRoot = path.join(process.env.MPX_APPS, 'Orca-Lab')
  const manifestPath = path.join(labRoot, 'verified-build.json')
  const source = assertForkReleaseSource({ cwd: root, manifestPath })
  const timestamp = new Date()
    .toISOString()
    .replace(/[-:T.Z]/g, '')
    .slice(0, 14)
  const baseVersion = JSON.parse(fs.readFileSync(path.join(root, 'package.json'), 'utf8')).version
  const version = `${baseVersion}-local.${timestamp}.g${source.commit.slice(0, 8)}`
  const output = path.join(labRoot, 'builds', version)
  if (fs.existsSync(output)) {
    throw new Error(`Build directory already exists: ${output}`)
  }
  const env = {
    ...process.env,
    ORCA_MANUAL_UPDATES_ONLY: '1',
    ORCA_BACKGROUND_LAUNCH: '1',
    ORCA_LOCAL_BUILD_VERSION: version,
    ORCA_BUILD_COMMIT: source.commit
  }
  const logDirectory = path.join(labRoot, 'logs', version)
  fs.mkdirSync(logDirectory, { recursive: true })
  const proofPath = path.join(root, 'out', 'fork-build-source.json')
  fs.rmSync(proofPath, { force: true })
  const pnpm = resolvePnpmCliInvocation()
  await execute('build', pnpm.command, [...pnpm.prefixArgs, 'run', 'build'], env, logDirectory)
  await execute(
    'ensure-runtime',
    pnpm.command,
    [...pnpm.prefixArgs, 'run', 'ensure:electron-runtime'],
    env,
    logDirectory
  )
  const builtSource = assertForkReleaseSource({
    cwd: root,
    manifestPath,
    expectedCommit: source.commit
  })
  writeForkBuildSource({ cwd: root, proofPath, source: builtSource, version })
  await execute(
    'package',
    process.execPath,
    [
      path.join(root, 'node_modules', 'electron-builder', 'out', 'cli', 'cli.js'),
      '--win',
      '--x64',
      '--dir',
      '--config',
      'config/electron-builder.config.cjs',
      `--config.directories.output=${output}`
    ],
    env,
    logDirectory
  )
  const completed = assertForkReleaseSource({
    cwd: root,
    manifestPath,
    expectedCommit: source.commit
  })
  if (fs.existsSync(path.join(output, 'source-provenance.json'))) {
    throw new Error('Build provenance already exists')
  }
  fs.writeFileSync(
    path.join(output, 'source-provenance.json'),
    `${JSON.stringify(
      {
        ...completed,
        version,
        builtAt: new Date().toISOString()
      },
      null,
      2
    )}\n`,
    { flag: 'wx' }
  )
  console.log(`Fork Lab build: ${path.join(output, 'win-unpacked')}`)
}

main().catch((error) => {
  console.error(error)
  process.exitCode = 1
})
