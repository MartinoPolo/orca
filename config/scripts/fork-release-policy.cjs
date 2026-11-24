const path = require('node:path')
const { runProcessSync } = require('@orca/process-host')

const REPOSITORY = 'MartinoPolo/orca'
const FORK_URL = 'https://github.com/MartinoPolo/orca.git'
const SHA = /^[0-9a-f]{40}$/
const LOCAL_GIT_TIMEOUT_MS = 20000
// GitHub fetches routinely take about 10 s; a slow network must not fail the release.
const FETCH_TIMEOUT_MS = 120000
// GIT_CONFIG_NOSYSTEM also drops Git for Windows' fscache, which makes a full status several times slower.
const PLATFORM_GIT_CONFIG = process.platform === 'win32' ? ['-c', 'core.fscache=true'] : []

function git(cwd, args, timeoutMs = LOCAL_GIT_TIMEOUT_MS) {
  const result = runProcessSync({
    program: 'git',
    args: [...PLATFORM_GIT_CONFIG, ...args],
    cwd,
    timeoutMs,
    maxOutputBytes: 1024 * 1024,
    env: { ...process.env, GIT_TERMINAL_PROMPT: '0', GIT_CONFIG_NOSYSTEM: '1' }
  })
  if (result.code !== 0 || result.timedOut || result.outputTruncated) {
    throw new Error(
      `Git ${args[0]} failed: ${result.stderr || result.stdout || 'timeout or truncated output'}`
    )
  }
  return result.stdout.trim()
}

function assertForkReleaseSource({ cwd = process.cwd(), expectedCommit, fetch = true } = {}) {
  if (
    git(cwd, ['rev-parse', '--show-toplevel']).replaceAll('\\', '/').toLowerCase() !==
    path.resolve(cwd).replaceAll('\\', '/').toLowerCase()
  ) {
    throw new Error('Run fork release from the repository root')
  }
  if (git(cwd, ['symbolic-ref', '--short', 'HEAD']) !== 'main') {
    throw new Error('Fork release requires main')
  }
  if (git(cwd, ['status', '--porcelain', '--untracked-files=all'])) {
    throw new Error('Fork release requires a clean tree')
  }
  const remote = git(cwd, ['config', '--get', 'remote.fork.url'])
  if (remote !== FORK_URL && remote !== 'git@github.com:MartinoPolo/orca.git') {
    throw new Error(`fork remote must be ${FORK_URL}`)
  }
  if (fetch) {
    git(
      cwd,
      [
        'fetch',
        '--no-tags',
        '--prune',
        'fork',
        '+refs/heads/main:refs/remotes/fork/main',
        '+refs/heads/martas/*:refs/remotes/fork/martas/*'
      ],
      FETCH_TIMEOUT_MS
    )
  }
  const commit = git(cwd, ['rev-parse', 'HEAD'])
  if (!SHA.test(commit) || commit !== git(cwd, ['rev-parse', 'refs/remotes/fork/main'])) {
    throw new Error('main is not the published fork/main commit')
  }
  if (expectedCommit !== undefined && expectedCommit !== commit) {
    throw new Error('Build source changed')
  }
  const refs = git(cwd, [
    'for-each-ref',
    '--format=%(refname) %(objectname)',
    'refs/heads',
    'refs/remotes/fork/martas'
  ])
    .split(/\r?\n/)
    .filter(Boolean)
    .map((line) => {
      const [name, sourceCommit] = line.split(' ')
      return { name, commit: sourceCommit }
    })
    .filter(({ name }) => name !== 'refs/heads/main')
  for (const ref of refs) {
    if (!SHA.test(ref.commit)) {
      throw new Error(`Invalid development ref: ${ref.name}`)
    }
  }
  return {
    repository: REPOSITORY,
    branch: 'main',
    commit,
    publishedCommit: commit,
    auditedRefs: refs
  }
}

module.exports = { assertForkReleaseSource, REPOSITORY }
