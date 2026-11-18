import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { createRequire } from 'node:module'
import { afterEach, describe, expect, it } from 'vitest'
import { runProcessSync } from '@orca/process-host'

const require = createRequire(import.meta.url)
const { assertForkReleaseSource } = require('./fork-release-policy.cjs')
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
  return { cwd, bare, prior, later }
}
function check(f) {
  return assertForkReleaseSource({ cwd: f.cwd })
}

afterEach(() => {
  for (const directory of directories.splice(0)) {
    rmSync(directory, { recursive: true, force: true })
  }
})
describe('fork release safety', () => {
  it('accepts published main and audits refs', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'feature', f.prior)
    git(f.cwd, 'push', f.bare, `${f.prior}:refs/heads/martas/done`)
    const source = check(f)
    expect(source).toMatchObject({ commit: f.later, branch: 'main' })
    expect(source.auditedRefs.map((ref) => ref.name)).toEqual([
      'refs/heads/feature',
      'refs/remotes/fork/martas/done'
    ])
  })
  it('rejects an invalid fork remote', () => {
    const f = fixture()
    git(f.cwd, 'remote', 'set-url', 'fork', 'https://github.com/stablyai/orca.git')
    expect(() => check(f)).toThrow(/fork remote must be/)
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
  it('records pending local and personal remote refs without releasing their code', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'pending', f.prior)
    git(f.cwd, 'switch', 'pending')
    const pendingCommit = commit(f.cwd, 'pending change')
    git(f.cwd, 'switch', 'main')
    git(f.cwd, 'push', f.bare, `${pendingCommit}:refs/heads/martas/pending`)

    const source = check(f)
    expect(source.commit).toBe(f.later)
    expect(git(f.cwd, 'show', 'main:tracked.txt')).toBe('later')
    expect(source.auditedRefs).toEqual([
      { name: 'refs/heads/pending', commit: pendingCommit },
      { name: 'refs/remotes/fork/martas/pending', commit: pendingCommit }
    ])
  })
  it('prunes deleted personal remote branches and retains local pending branches', () => {
    const f = fixture()
    git(f.cwd, 'branch', 'pending', f.prior)
    git(f.cwd, 'switch', 'pending')
    const pendingCommit = commit(f.cwd, 'pending change')
    git(f.cwd, 'switch', 'main')
    git(f.cwd, 'push', f.bare, `${pendingCommit}:refs/heads/martas/removed`)
    expect(check(f).auditedRefs).toHaveLength(2)

    git(f.cwd, 'push', f.bare, ':refs/heads/martas/removed')
    expect(check(f).auditedRefs).toEqual([{ name: 'refs/heads/pending', commit: pendingCommit }])
  })
  it('rejects a build whose expected source is no longer published main', () => {
    const f = fixture()
    expect(() => assertForkReleaseSource({ cwd: f.cwd, expectedCommit: f.prior })).toThrow(
      /Build source changed/
    )
  })
})
