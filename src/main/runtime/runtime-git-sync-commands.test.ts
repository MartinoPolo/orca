import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { GlobalSettings } from '../../shared/global-settings-types'
import { getDefaultSettings } from '../../shared/constants'
import type { GitPushTarget } from '../../shared/worktree/types'
import type * as GitRemoteModule from '../git/remote'
import type * as GitStatusModule from '../git/status'
import type * as GitForkSyncModule from '../git/fork-sync'
import type { ResolvedRuntimeGitWorktree } from './runtime-git-command-target'
import { RuntimeGitSyncCommands } from './runtime-git-sync-commands'

const mocks = vi.hoisted(() => ({
  abortMerge: vi.fn(),
  abortRebase: vi.fn(),
  amendCommit: vi.fn(),
  commitChanges: vi.fn(),
  getSshGitProvider: vi.fn(),
  gitSyncForkDefaultBranch: vi.fn(),
  gitFastForward: vi.fn(),
  gitFetch: vi.fn(),
  gitPull: vi.fn(),
  gitPushWithLease: vi.fn(),
  materializeLocal: vi.fn(),
  materializeSsh: vi.fn()
}))

vi.mock('../git/fork-sync', async () => ({
  ...(await vi.importActual<typeof GitForkSyncModule>('../git/fork-sync')),
  gitSyncForkDefaultBranch: mocks.gitSyncForkDefaultBranch
}))

vi.mock('../git/status', async () => ({
  ...(await vi.importActual<typeof GitStatusModule>('../git/status')),
  abortMerge: mocks.abortMerge,
  abortRebase: mocks.abortRebase,
  amendCommit: mocks.amendCommit,
  commitChanges: mocks.commitChanges
}))

vi.mock('../git/remote', async () => ({
  ...(await vi.importActual<typeof GitRemoteModule>('../git/remote')),
  gitFastForward: mocks.gitFastForward,
  gitFetch: mocks.gitFetch,
  gitPull: mocks.gitPull,
  gitPushWithLease: mocks.gitPushWithLease
}))

vi.mock('../ipc/worktree-remote', () => ({
  materializeWorktreePushTargetRemote: mocks.materializeLocal,
  materializeWorktreePushTargetRemoteSsh: mocks.materializeSsh
}))

vi.mock('../providers/ssh-git-dispatch', () => ({
  getSshGitProvider: mocks.getSshGitProvider
}))

const worktree = {
  id: 'wt-1',
  path: '/workspace/repo'
} as ResolvedRuntimeGitWorktree
const pushTarget = {
  remoteName: 'origin',
  branchName: 'main'
} satisfies GitPushTarget
const expectedUpstream = { owner: 'stablyai', repo: 'orca' }

describe('RuntimeGitSyncCommands admission', () => {
  beforeEach(() => {
    vi.resetAllMocks()
    mocks.materializeLocal.mockImplementation(async (_path, target) => target)
    mocks.materializeSsh.mockImplementation(async (_provider, _path, target) => target)
  })

  it('routes captured lease pushes locally with execution-host options', async () => {
    const lease = { expectedHead: 'a'.repeat(40), pushTarget }
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({
        executionHostId: 'local',
        worktree,
        localGitOptions: { wslDistro: 'Ubuntu' }
      }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })

    await expect(commands.pushRuntimeGitWithLease('id:wt-1', lease)).resolves.toEqual({ ok: true })
    expect(mocks.gitPushWithLease).toHaveBeenCalledWith(worktree.path, lease, {
      admissionTier: 'interactive',
      wslDistro: 'Ubuntu'
    })
  })

  it('routes captured lease pushes to SSH without creating a remote or executing locally', async () => {
    const lease = { expectedHead: 'a'.repeat(40), pushTarget }
    const provider = { pushWithLease: vi.fn(), exec: vi.fn() }
    mocks.getSshGitProvider.mockReturnValue(provider)
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({ executionHostId: 'ssh:conn-1', worktree }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })

    await commands.pushRuntimeGitWithLease('id:wt-1', lease)
    expect(provider.pushWithLease).toHaveBeenCalledWith(worktree.path, lease)
    expect(provider.exec).not.toHaveBeenCalled()
    expect(mocks.gitPushWithLease).not.toHaveBeenCalled()
  })

  it('refuses a missing SSH provider rather than executing a lease push locally', async () => {
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({ executionHostId: 'ssh:conn-1', worktree }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })
    await expect(
      commands.pushRuntimeGitWithLease('id:wt-1', {
        expectedHead: 'a'.repeat(40),
        pushTarget
      })
    ).rejects.toThrow()
    expect(mocks.gitPushWithLease).not.toHaveBeenCalled()
  })

  it('materializes supplied local amend targets before capturing and persists ownership', async () => {
    const materialized = { ...pushTarget, remoteName: 'captured-fork', remoteCreated: true }
    const lease = { expectedHead: 'a'.repeat(40), pushTarget: materialized }
    const persistMaterializedPushTarget = vi.fn()
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({
        executionHostId: 'local',
        worktree,
        localGitOptions: { wslDistro: 'Ubuntu' }
      }),
      getRuntimeSettings: () => getDefaultSettings('/tmp'),
      persistMaterializedPushTarget
    })
    mocks.materializeLocal.mockResolvedValue(materialized)
    mocks.amendCommit.mockResolvedValue({ success: true, pushLease: lease })

    await expect(commands.amendRuntimeGitCommit('id:wt-1', undefined, pushTarget)).resolves.toEqual(
      { success: true, pushLease: lease }
    )
    expect(mocks.materializeLocal).toHaveBeenCalledWith(
      worktree.path,
      pushTarget,
      undefined,
      undefined,
      {
        wslDistro: 'Ubuntu'
      }
    )
    expect(mocks.amendCommit).toHaveBeenCalledWith(
      worktree.path,
      undefined,
      {
        wslDistro: 'Ubuntu',
        admissionTier: 'interactive'
      },
      materialized
    )
    expect(persistMaterializedPushTarget).toHaveBeenCalledWith(worktree.id, materialized)
  })

  it('materializes supplied SSH amend targets on their execution host', async () => {
    const materialized = { ...pushTarget, remoteName: 'captured-fork' }
    const lease = { expectedHead: 'a'.repeat(40), pushTarget: materialized }
    const provider = { amendCommit: vi.fn().mockResolvedValue({ success: true, pushLease: lease }) }
    mocks.getSshGitProvider.mockReturnValue(provider)
    mocks.materializeSsh.mockResolvedValue(materialized)
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({ executionHostId: 'ssh:conn-1', worktree }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })

    await expect(commands.amendRuntimeGitCommit('id:wt-1', undefined, pushTarget)).resolves.toEqual(
      { success: true, pushLease: lease }
    )
    expect(mocks.materializeSsh).toHaveBeenCalledWith(provider, worktree.path, pushTarget)
    expect(provider.amendCommit).toHaveBeenCalledWith(worktree.path, undefined, materialized)
    expect(mocks.materializeLocal).not.toHaveBeenCalled()
    expect(mocks.amendCommit).not.toHaveBeenCalled()
  })

  it('does not materialize any remote for ordinary amend', async () => {
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({ executionHostId: 'local', worktree }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })
    await commands.amendRuntimeGitCommit('id:wt-1', undefined)
    expect(mocks.materializeLocal).not.toHaveBeenCalled()
    expect(mocks.materializeSsh).not.toHaveBeenCalled()
  })

  it('prioritizes local runtime git actions and preserves host routing', async () => {
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({
        executionHostId: 'local',
        worktree,
        localGitOptions: { wslDistro: 'Ubuntu' }
      }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })
    mocks.commitChanges.mockResolvedValue({ success: true })
    mocks.gitSyncForkDefaultBranch.mockResolvedValue({ status: 'up-to-date' })

    await commands.abortRuntimeGitMerge('id:wt-1')
    await commands.abortRuntimeGitRebase('id:wt-1')
    await commands.fetchRuntimeGit('id:wt-1', pushTarget)
    await commands.syncRuntimeGitForkDefaultBranch('id:wt-1', expectedUpstream)
    await commands.pullRuntimeGit('id:wt-1', pushTarget)
    await commands.fastForwardRuntimeGit('id:wt-1', pushTarget)
    await commands.commitRuntimeGit('id:wt-1', 'feat: prioritize user action')
    await commands.amendRuntimeGitCommit('id:wt-1', undefined)

    const options = { admissionTier: 'interactive', wslDistro: 'Ubuntu' }
    expect(mocks.abortMerge).toHaveBeenCalledWith(worktree.path, options)
    expect(mocks.abortRebase).toHaveBeenCalledWith(worktree.path, options)
    expect(mocks.gitFetch).toHaveBeenCalledWith(worktree.path, pushTarget, options)
    expect(mocks.gitSyncForkDefaultBranch).toHaveBeenCalledWith(
      worktree.path,
      expectedUpstream,
      options
    )
    expect(mocks.gitPull).toHaveBeenCalledWith(worktree.path, pushTarget, options)
    expect(mocks.gitFastForward).toHaveBeenCalledWith(worktree.path, pushTarget, options)
    expect(mocks.commitChanges).toHaveBeenCalledWith(
      worktree.path,
      'feat: prioritize user action',
      options
    )
    expect(mocks.amendCommit).toHaveBeenCalledWith(worktree.path, undefined, options, undefined)
  })

  it('keeps remote runtime git actions owned by the SSH provider', async () => {
    const provider = {
      abortMerge: vi.fn(),
      abortRebase: vi.fn(),
      amendCommit: vi.fn().mockResolvedValue({ success: true }),
      commit: vi.fn().mockResolvedValue({ success: true }),
      fastForwardBranch: vi.fn(),
      fetchRemote: vi.fn(),
      syncForkDefaultBranch: vi.fn().mockResolvedValue({ status: 'up-to-date' }),
      pullBranch: vi.fn()
    }
    mocks.getSshGitProvider.mockReturnValue(provider)
    const commands = new RuntimeGitSyncCommands({
      resolveRuntimeGitTarget: async () => ({
        worktree,
        executionHostId: 'ssh:conn-1'
      }),
      getRuntimeSettings: () => ({}) as GlobalSettings
    })

    await commands.abortRuntimeGitMerge('id:wt-1')
    await commands.abortRuntimeGitRebase('id:wt-1')
    await commands.fetchRuntimeGit('id:wt-1', pushTarget)
    await commands.syncRuntimeGitForkDefaultBranch('id:wt-1', expectedUpstream)
    await commands.pullRuntimeGit('id:wt-1', pushTarget)
    await commands.fastForwardRuntimeGit('id:wt-1', pushTarget)
    await commands.commitRuntimeGit('id:wt-1', 'feat: keep execution remote')
    await commands.amendRuntimeGitCommit('id:wt-1', 'fix: reworded remotely')

    expect(provider.abortMerge).toHaveBeenCalledWith(worktree.path)
    expect(provider.abortRebase).toHaveBeenCalledWith(worktree.path)
    expect(provider.fetchRemote).toHaveBeenCalledWith(worktree.path, pushTarget)
    expect(provider.syncForkDefaultBranch).toHaveBeenCalledWith(worktree.path, expectedUpstream)
    expect(provider.pullBranch).toHaveBeenCalledWith(worktree.path, pushTarget)
    expect(provider.fastForwardBranch).toHaveBeenCalledWith(worktree.path, pushTarget)
    expect(provider.commit).toHaveBeenCalledWith(worktree.path, 'feat: keep execution remote')
    expect(provider.amendCommit).toHaveBeenCalledWith(
      worktree.path,
      'fix: reworded remotely',
      undefined
    )
    expect(mocks.abortMerge).not.toHaveBeenCalled()
    expect(mocks.abortRebase).not.toHaveBeenCalled()
    expect(mocks.gitFetch).not.toHaveBeenCalled()
    expect(mocks.gitSyncForkDefaultBranch).not.toHaveBeenCalled()
    expect(mocks.gitPull).not.toHaveBeenCalled()
    expect(mocks.gitFastForward).not.toHaveBeenCalled()
    expect(mocks.commitChanges).not.toHaveBeenCalled()
    expect(mocks.amendCommit).not.toHaveBeenCalled()
  })
})
