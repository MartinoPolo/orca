import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { mkdtemp, mkdir, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { gitExecFileAsync } from './runner'
import { amendCommit } from './source-control/commit-changes'
import { gitPushWithLease } from './remote'

describe('amend push lease with real Git', () => {
  let directory: string
  let repository: string
  let remote: string
  let collaborator: string
  const git = (cwd: string, args: string[]) => gitExecFileAsync(args, { cwd, timeout: 10_000 })

  beforeEach(async () => {
    directory = await mkdtemp(join(tmpdir(), 'orca-amend-lease-'))
    repository = join(directory, 'local')
    remote = join(directory, 'remote.git')
    collaborator = join(directory, 'collaborator')
    await mkdir(repository)
    await git(directory, ['init', '--bare', remote])
    await git(repository, ['init', '-b', 'topic'])
    await git(repository, ['config', 'user.name', 'Lease Test'])
    await git(repository, ['config', 'user.email', 'lease@example.test'])
    await writeFile(join(repository, 'file.txt'), 'original')
    await git(repository, ['add', '.'])
    await git(repository, ['commit', '-m', 'original'])
    await git(repository, ['remote', 'add', 'origin', remote])
    await git(repository, ['push', '-u', 'origin', 'topic'])
    await git(directory, ['clone', '--branch', 'topic', remote, collaborator])
    await git(collaborator, ['config', 'user.name', 'Collaborator'])
    await git(collaborator, ['config', 'user.email', 'collaborator@example.test'])
  })

  afterEach(async () => {
    await rm(directory, { recursive: true, force: true })
  })

  it('rejects an unseen remote advance even after fetch replaces the tracking ref', async () => {
    const originalHead = (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
    const amended = await amendCommit(repository, 'amended')
    expect(amended.success).toBe(true)
    expect(amended.pushLease).toEqual({
      expectedHead: originalHead,
      pushTarget: { remoteName: 'origin', branchName: 'topic' }
    })
    if (!amended.pushLease) {
      throw new Error('Missing pre-amend lease')
    }

    await writeFile(join(collaborator, 'other.txt'), 'unseen remote work')
    await git(collaborator, ['add', '.'])
    await git(collaborator, ['commit', '-m', 'unseen remote advance'])
    await git(collaborator, ['push'])
    const remoteHead = (await git(collaborator, ['rev-parse', 'HEAD'])).stdout.trim()
    await git(repository, ['fetch', 'origin'])
    expect((await git(repository, ['rev-parse', 'origin/topic'])).stdout.trim()).toBe(remoteHead)

    await expect(gitPushWithLease(repository, amended.pushLease)).rejects.toThrow()
    expect((await git(remote, ['rev-parse', 'refs/heads/topic'])).stdout.trim()).toBe(remoteHead)
    // A bare lease now accepts the unseen commit, demonstrating the regression's precondition.
    await git(repository, ['push', '--force-with-lease', 'origin', 'HEAD:topic'])
    expect((await git(remote, ['rev-parse', 'refs/heads/topic'])).stdout.trim()).not.toBe(
      remoteHead
    )
  })

  it('pushes to the captured destination despite later configuration changes', async () => {
    const amended = await amendCommit(repository, 'amended')
    if (!amended.pushLease) {
      throw new Error('Missing pre-amend lease')
    }
    await git(repository, ['config', 'branch.topic.merge', 'refs/heads/other'])
    await gitPushWithLease(repository, amended.pushLease)
    expect((await git(remote, ['rev-parse', 'refs/heads/topic'])).stdout.trim()).toBe(
      (await git(repository, ['rev-parse', 'HEAD'])).stdout.trim()
    )
  })

  it('allows a normal local amend without a published destination', async () => {
    await git(repository, ['remote', 'remove', 'origin'])
    await expect(amendCommit(repository, 'local amendment')).resolves.toEqual({ success: true })
  })
})
