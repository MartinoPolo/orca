const fs = require('node:fs')
const path = require('node:path')
const { runProcessSync } = require('./fork-process-runtime.cjs')

const REPOSITORY = 'MartinoPolo/orca'
const FORK_URL = 'https://github.com/MartinoPolo/orca.git'
const SHA = /^[0-9a-f]{40}$/

function git(cwd, args) {
  const result = runProcessSync({
    program: 'git',
    args,
    cwd,
    timeoutMs: 20000,
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

function previousSource(cwd, manifest) {
  if (manifest.source !== undefined) {
    if (
      !SHA.test(manifest.source?.commit ?? '') ||
      manifest.source.repository !== REPOSITORY ||
      manifest.source.branch !== 'main'
    ) {
      throw new Error('Previous Lab source identity is invalid')
    }
    return manifest.source.commit
  }
  const suffix = /\.(?:g)?([0-9a-f]{7,39})$/.exec(manifest.version ?? '')?.[1]
  if (!suffix) {
    throw new Error('Previous Lab manifest lacks an unambiguous source commit')
  }
  const matches = git(cwd, ['rev-parse', `--disambiguate=${suffix}`])
    .split(/\r?\n/)
    .filter(Boolean)
  if (
    matches.length !== 1 ||
    !SHA.test(matches[0]) ||
    git(cwd, ['cat-file', '-t', matches[0]]) !== 'commit'
  ) {
    throw new Error('Previous Lab version suffix does not resolve to exactly one commit')
  }
  return matches[0]
}

function checkPreviousArtifact(manifest) {
  if (
    !manifest.build?.directory ||
    !manifest.buildHashes?.asar ||
    !manifest.buildHashes?.executable
  ) {
    throw new Error('Previous Lab artifact identity is missing')
  }
  const crypto = require('node:crypto')
  for (const { name, relative } of [
    { name: 'asar', relative: ['resources', 'app.asar'] },
    { name: 'executable', relative: ['Orca.exe'] }
  ]) {
    const file = path.join(manifest.build.directory, ...relative)
    const hash = crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex')
    if (hash !== manifest.buildHashes[name]) {
      throw new Error(`Previous Lab ${name} artifact changed`)
    }
  }
}

function assertForkReleaseSource({
  cwd = process.cwd(),
  manifestPath,
  expectedCommit,
  fetch = true
} = {}) {
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
    git(cwd, [
      'fetch',
      '--no-tags',
      '--prune',
      'fork',
      '+refs/heads/main:refs/remotes/fork/main',
      '+refs/heads/martas/*:refs/remotes/fork/martas/*'
    ])
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
    if (
      !SHA.test(ref.commit) ||
      runProcessSync({
        program: 'git',
        args: ['merge-base', '--is-ancestor', ref.commit, commit],
        cwd,
        timeoutMs: 20000
      }).code !== 0
    ) {
      throw new Error(`Unmerged development ref: ${ref.name}`)
    }
  }
  let priorCommit = null
  if (manifestPath && fs.existsSync(manifestPath)) {
    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'))
    checkPreviousArtifact(manifest)
    priorCommit = previousSource(cwd, manifest)
    const ancestry = runProcessSync({
      program: 'git',
      args: ['merge-base', '--is-ancestor', priorCommit, commit],
      cwd,
      timeoutMs: 20000
    })
    if (ancestry.code !== 0 || ancestry.timedOut) {
      throw new Error('Previous released commit was dropped')
    }
  }
  return {
    repository: REPOSITORY,
    branch: 'main',
    commit,
    publishedCommit: commit,
    priorCommit,
    auditedRefs: refs
  }
}

function assertForkPromotion({ cwd, manifestPath, metadata, provenance }) {
  if (
    metadata.orcaManualUpdatesOnly !== true ||
    metadata.orcaBuildSource?.repository !== REPOSITORY ||
    metadata.orcaBuildSource?.branch !== 'main' ||
    !SHA.test(metadata.orcaBuildSource?.commit ?? '')
  ) {
    throw new Error('Candidate package lacks verified fork source metadata')
  }
  const source = assertForkReleaseSource({
    cwd,
    manifestPath,
    expectedCommit: metadata.orcaBuildSource.commit
  })
  if (
    provenance?.repository !== source.repository ||
    provenance?.branch !== 'main' ||
    provenance?.commit !== source.commit ||
    provenance?.publishedCommit !== source.commit ||
    provenance?.priorCommit !== source.priorCommit ||
    provenance?.version !== metadata.version ||
    JSON.stringify(provenance?.auditedRefs) !== JSON.stringify(source.auditedRefs)
  ) {
    throw new Error(
      'Candidate build provenance does not match current published main and audited refs'
    )
  }
  return source
}

module.exports = { assertForkReleaseSource, assertForkPromotion, REPOSITORY }
