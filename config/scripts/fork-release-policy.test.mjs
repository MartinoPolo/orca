import { createHash } from 'node:crypto'
import { mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcessSync } from '../../src/shared/child-process/run-process'

const require = createRequire(import.meta.url)
const { assertForkReleaseSource, assertForkPromotion } = require('./fork-release-policy.cjs')
const directories = []
const forkUrl = 'https://github.com/MartinoPolo/orca.git'

function git(cwd, ...args) {
  const result = runProcessSync({ program: 'git', args, cwd, timeoutMs: 20000 })
  if (result.code !== 0) {
    throw new Error(`git ${args.join(' ')}: ${result.stderr}`)
  }
  return result.stdout.trim()
}
function commit(cwd, content) {
  writeFileSync(join(cwd, 'tracked.txt'), content)
  git(cwd, 'add', 'tracked.txt')
  git(cwd, 'commit', '-m', content)
  return git(cwd, 'rev-parse', 'HEAD')
}
function fixture() {
  const root = mkdtempSync(join(tmpdir(), 'fork-release-'))
  directories.push(root)
  const cwd = join(root, 'source')
  const bare = join(root, 'remote.git')
  mkdirSync(cwd)
  git(root, 'init', '--bare', bare)
  git(cwd, 'init', '-b', 'main')
  git(cwd, 'config', 'user.email', 'test@example.com')
  git(cwd, 'config', 'user.name', 'Test')
  git(cwd, 'remote', 'add', 'fork', forkUrl)
  git(cwd, 'config', `url.${bare}.insteadOf`, forkUrl)
  const prior = commit(cwd, 'prior')
  git(cwd, 'push', bare, 'main')
  const later = commit(cwd, 'later')
  git(cwd, 'push', bare, 'main')
  const artifact = join(root, 'old', 'win-unpacked')
  mkdirSync(join(artifact, 'resources'), { recursive: true })
  writeFileSync(join(artifact, 'Orca.exe'), 'old executable')
  writeFileSync(join(artifact, 'resources', 'app.asar'), 'old asar')
  const hash = (file) => createHash('sha256').update(readFileSync(file)).digest('hex')
  const manifestPath = join(root, 'verified-build.json')
  writeFileSync(
    manifestPath,
    JSON.stringify({
      version: `1.4.197-local.20260924100739.${prior.slice(0, 8)}`,
      build: { directory: artifact },
      buildHashes: {
        executable: hash(join(artifact, 'Orca.exe')),
        asar: hash(join(artifact, 'resources', 'app.asar'))
      }
    })
  )
  return { cwd, bare, root, prior, later, artifact, manifestPath }
}
function check(f) {
  return assertForkReleaseSource({ cwd: f.cwd, manifestPath: f.manifestPath })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
describe('fork release safety', () => {
  it('accepts merged published main, resolves verified legacy source, and audits refs', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'feature', f.prior)
    git(f.cwd, 'push', f.bare, `${f.prior}:refs/heads/martas/done`)
    const source = check(f)
    expect(source).toMatchObject({ commit: f.later, priorCommit: f.prior, branch: 'main' })
    expect(source.auditedRefs.map((ref) => ref.name)).toEqual([
      'refs/heads/feature',
      'refs/remotes/fork/martas/done'
    ])
    const candidate = {
      cwd: f.cwd,
      manifestPath: f.manifestPath,
      metadata: {
        orcaManualUpdatesOnly: true,
        version: 'candidate',
        orcaBuildSource: { commit: f.later, branch: 'main', repository: 'MartinoPolo/orca' }
      },
      provenance: { ...source, version: 'candidate' }
    }
    expect(assertForkPromotion(candidate).commit).toBe(f.later)
    expect(() =>
      assertForkPromotion({
        ...candidate,
        provenance: { ...candidate.provenance, auditedRefs: [] }
      })
    ).toThrow(/provenance does not match/)
  })
  it('rejects an invalid fork remote and malformed previous source without legacy fallback', () => {
    const f = fixture()
    git(f.cwd, 'remote', 'set-url', 'fork', 'https://github.com/stablyai/orca.git')
    expect(() => check(f)).toThrow(/fork remote must be/)
    git(f.cwd, 'remote', 'set-url', 'fork', forkUrl)
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'))
    manifest.source = { repository: 'MartinoPolo/orca', branch: 'main', commit: 'invalid' }
    writeFileSync(f.manifestPath, JSON.stringify(manifest))
    expect(() => check(f)).toThrow(/Previous Lab source identity is invalid/)
  })
  it('rejects feature checkout, dirty source, and unpublished main', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'feature')
    git(f.cwd, 'switch', 'feature')
    expect(() => check(f)).toThrow(/requires main/)
    git(f.cwd, 'switch', 'main')
    writeFileSync(join(f.cwd, 'untracked.txt'), 'dirty')
    expect(() => check(f)).toThrow(/clean tree/)
    rmSync(join(f.cwd, 'untracked.txt'))
    commit(f.cwd, 'unpublished')
    expect(() => check(f)).toThrow(/published fork\/main/)
  })
  it('rejects unmerged local and personal remote refs', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'unmerged', f.prior)
    git(f.cwd, 'switch', 'unmerged')
    const orphan = commit(f.cwd, 'unmerged change')
    git(f.cwd, 'switch', 'main')
    expect(() => check(f)).toThrow(/Unmerged development ref: refs\/heads\/unmerged/)
    git(f.cwd, 'branch', '-D', 'unmerged')
    git(f.cwd, 'push', f.bare, `${orphan}:refs/heads/martas/remote-only`)
    expect(() => check(f)).toThrow(/fork\/martas\/remote-only/)
  })
  it('prunes deleted personal remote branches while still rejecting unmerged local branches', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'unmerged', f.prior)
    git(f.cwd, 'switch', 'unmerged')
    const orphan = commit(f.cwd, 'unmerged change')
    git(f.cwd, 'switch', 'main')
    git(f.cwd, 'branch', '-D', 'unmerged')
    git(f.cwd, 'push', f.bare, `${orphan}:refs/heads/martas/removed`)
    expect(() => check(f)).toThrow(/Unmerged development ref: refs\/remotes\/fork\/martas\/removed/)

    git(f.cwd, 'push', f.bare, ':refs/heads/martas/removed')
    expect(check(f).auditedRefs).toEqual([])

    git(f.cwd, 'branch', 'unmerged', orphan)
    expect(() => check(f)).toThrow(/Unmerged development ref: refs\/heads\/unmerged/)
  })
  it('rejects dropped release ancestry, tampered artifact and ambiguous legacy identity', () => {
    const f = fixture()
    writeFileSync(join(f.artifact, 'Orca.exe'), 'tampered')
    expect(() => check(f)).toThrow(/artifact changed/)
    writeFileSync(join(f.artifact, 'Orca.exe'), 'old executable')
    git(f.cwd, 'reset', '--hard', f.prior)
    git(f.cwd, 'push', '--force', f.bare, 'main')
    git(f.cwd, 'fetch', 'fork')
    git(f.cwd, 'reset', '--hard', f.later)
    const other = commit(f.cwd, 'new tip')
    git(f.cwd, 'push', '--force', f.bare, 'main')
    expect(check(f).commit).toBe(other)
    const manifest = JSON.parse(readFileSync(f.manifestPath, 'utf8'))
    manifest.version = '1.4.197-local.20260924100739.deadbeef'
    writeFileSync(f.manifestPath, JSON.stringify(manifest))
    expect(() => check(f)).toThrow(/does not resolve to exactly one commit|Git rev-parse failed/)
  })
  it('rejects a replaced history without the prior commit and mismatched candidate source', () => {
    const f = fixture()
    git(f.cwd, 'checkout', '--orphan', 'replacement')
    git(f.cwd, 'rm', '-f', 'tracked.txt')
    const replacement = commit(f.cwd, 'replacement')
    git(f.cwd, 'branch', '-D', 'main')
    git(f.cwd, 'branch', '-m', 'main')
    git(f.cwd, 'push', '--force', f.bare, 'main')
    expect(() => check(f)).toThrow(/Previous released commit was dropped/)
    git(f.cwd, 'reset', '--hard', f.later)
    git(f.cwd, 'push', '--force', f.bare, 'main')
    const source = check(f)
    expect(() =>
      assertForkPromotion({
        cwd: f.cwd,
        manifestPath: f.manifestPath,
        metadata: {
          orcaManualUpdatesOnly: true,
          version: 'candidate',
          orcaBuildSource: { commit: replacement, branch: 'main', repository: 'MartinoPolo/orca' }
        },
        provenance: { ...source, version: 'candidate' }
      })
    ).toThrow(/Build source changed/)
    expect(() =>
      assertForkReleaseSource({
        cwd: f.cwd,
        manifestPath: f.manifestPath,
        expectedCommit: replacement
      })
    ).toThrow(/Build source changed/)
  })
})
