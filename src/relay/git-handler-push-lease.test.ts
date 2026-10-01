import { describe, expect, it, vi } from 'vitest'
import { GitHandlerSyncOperations } from './git-handler-sync-operations'
import { GitHandlerWorktreeChangeOperations } from './git-handler-worktree-change-operations'
import type { GitHandlerOperationHost } from './git-handler-operation-context'
import { GitCapabilityCache } from '../shared/git-capability-cache'
import { InFlightPromiseDedupe } from '../shared/in-flight-promise-dedupe'
import { createSubmodulePathsCache } from './git-handler-submodule-ops'

function setup() {
  const expectedHead = 'a'.repeat(40)
  const git = vi.fn(async (args: string[], _cwd: string) => ({
    stdout: args[0] === 'rev-parse' ? expectedHead : '',
    stderr: ''
  }))
  const host: GitHandlerOperationHost = {
    git,
    gitCapabilities: new GitCapabilityCache(),
    gitDiffReadDedupe: new InFlightPromiseDedupe(),
    submodulePathsCache: createSubmodulePathsCache(),
    watcherRegistry: undefined,
    gitBuffer: async () => Buffer.alloc(0),
    spawnClone: async () => ({ stdout: '', stderr: '' }),
    clearGitMutationReadCaches: vi.fn(),
    runWithGitReadCacheClear: (run) => run(),
    maybeStreamResponse: (result) => result
  }
  return {
    git,
    expectedHead,
    changes: new GitHandlerWorktreeChangeOperations(host),
    sync: new GitHandlerSyncOperations(host)
  }
}

describe('relay explicit amend push lease', () => {
  it('captures the original host HEAD before amend and pushes only with that explicit lease', async () => {
    const { changes, sync, git, expectedHead } = setup()
    const pushTarget = { remoteName: 'fork', branchName: 'review/topic' }
    const amended = await changes.amendCommit({ worktreePath: '/remote/repo', pushTarget })
    expect(amended).toEqual({ success: true, pushLease: { expectedHead, pushTarget } })
    expect(git.mock.calls.map(([args]) => args)).toEqual([
      ['rev-parse', '--verify', 'HEAD'],
      ['check-ref-format', '--branch', 'review/topic'],
      ['rev-parse', '--verify', 'refs/remotes/fork/review/topic'],
      ['commit', '--amend', '--no-edit']
    ])
    git.mockClear()
    await sync.pushWithLease({ worktreePath: '/remote/repo', lease: amended.pushLease })
    expect(git.mock.calls.map(([args]) => args)).toEqual([
      ['check-ref-format', '--branch', 'review/topic'],
      [
        'push',
        `--force-with-lease=refs/heads/review/topic:${expectedHead}`,
        '--set-upstream',
        'fork',
        'HEAD:refs/heads/review/topic'
      ]
    ])
    for (const [, cwd] of git.mock.calls) {
      expect(cwd).toBe('/remote/repo')
    }
  })

  it.each([
    undefined,
    null,
    {},
    { expectedHead: 'HEAD', pushTarget: { remoteName: 'origin', branchName: 'topic' } }
  ])('refuses missing or invalid leases without invoking Git: %j', async (pushLease) => {
    const { sync, git } = setup()
    await expect(
      sync.pushWithLease({ worktreePath: '/remote/repo', lease: pushLease })
    ).rejects.toThrow('pre-amend push lease')
    expect(git).not.toHaveBeenCalled()
  })
})
