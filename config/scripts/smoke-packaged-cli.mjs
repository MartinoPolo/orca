import { cp, mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { basename, join, resolve } from 'node:path'
import { createRequire } from 'node:module'
import { pathToFileURL } from 'node:url'
import assert from 'node:assert/strict'

function readAppDirArg(argv) {
  const explicit = argv.find((arg) => arg.startsWith('--app-dir='))
  if (explicit) {
    return explicit.slice('--app-dir='.length)
  }
  if (process.platform === 'darwin') {
    return 'dist/mac-arm64/Orca.app'
  }
  if (process.platform === 'win32') {
    return 'dist/win-unpacked'
  }
  return 'dist/linux-unpacked'
}

function getPackagedCliPath(appDir) {
  if (process.platform === 'darwin' || appDir.endsWith('.app')) {
    return join(appDir, 'Contents', 'Resources', 'bin', 'orca')
  }
  if (process.platform === 'win32') {
    return join(appDir, 'resources', 'bin', 'orca.exe')
  }
  return join(appDir, 'resources', 'bin', 'orca-ide')
}

export async function runPackagedCliCommand(runProcess, cliPath, args, env) {
  const result = await runProcess({
    program: cliPath,
    args,
    env,
    timeoutMs: 30_000,
    maxOutputBytes: 16 * 1024 * 1024,
    terminationBarrier: true
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(
      `Packaged CLI ${args.join(' ')} failed: code=${result.code}, signal=${result.signal}, timedOut=${result.timedOut}, outputTruncated=${result.outputTruncated}\n` +
        `stdout: ${result.stdout.slice(-1024)}\nstderr: ${result.stderr.slice(-1024)}`
    )
  }
  return result
}

async function main(argv = process.argv.slice(2)) {
  const appDir = resolve(readAppDirArg(argv))
  const tempRoot = await mkdtemp(join(tmpdir(), 'orca-packaged-cli-smoke-'))
  const copiedAppDir = join(tempRoot, basename(appDir))

  let smokeFailure = null
  try {
    await cp(appDir, copiedAppDir, { recursive: true, verbatimSymlinks: true })
    const cliPath = getPackagedCliPath(copiedAppDir)
    const env = { ...process.env, NODE_PATH: '', ORCA_BACKGROUND_LAUNCH: '1' }
    delete env.ORCA_CLI_CWD
    const { runProcess } = createRequire(import.meta.url)(
      resolve('out/shared/child-process/run-process.js')
    )
    const run = (args) => runPackagedCliCommand(runProcess, cliPath, args, env)

    await run(['--help'])
    const list = JSON.parse((await run(['skills', 'list', '--json'])).stdout)
    assert(list.topics.some((topic) => topic.name === 'orca-cli'))
    assert.match((await run(['skills', 'get', 'orca-cli'])).stdout, /name: orca-cli/)
    assert.match((await run(['skills', 'get', 'computer-use'])).stdout, /name: computer-use/)
    const install = JSON.parse(
      (
        await run([
          'skills',
          'install',
          '--skill',
          'orca-cli',
          '--agent',
          'codex',
          '--dry-run',
          '--json'
        ])
      ).stdout
    )
    const update = JSON.parse(
      (await run(['skills', 'update', '--skill', 'orca-cli', '--dry-run', '--json'])).stdout
    )
    assert.equal(install.executed, false)
    assert.equal(update.executed, false)
    console.log(`[packaged-cli-smoke] help and skills commands passed via ${cliPath}`)
  } catch (error) {
    smokeFailure = error
  }

  // Why: on Windows the launcher spawns copied Orca.exe children whose handles can outlive exit.
  // A persistent cleanup failure must not mask a CLI assertion failure.
  const cleanupFailure = await rm(tempRoot, {
    recursive: true,
    force: true,
    maxRetries: 20,
    retryDelay: 250
  }).then(
    () => null,
    (error) => error
  )

  if (smokeFailure) {
    if (cleanupFailure) {
      console.warn(`[packaged-cli-smoke] temp cleanup failed: ${cleanupFailure.message}`)
    }
    throw smokeFailure
  }
  if (cleanupFailure) {
    throw cleanupFailure
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main()
}
