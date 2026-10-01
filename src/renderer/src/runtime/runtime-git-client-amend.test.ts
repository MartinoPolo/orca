import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { amendRuntimeGitCommit, pushRuntimeGitWithLease } from './runtime-git-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const gitAmendCommit = vi.fn()
const gitPushWithLease = vi.fn()
const gitPush = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()
const runtimeCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  gitAmendCommit.mockReset()
  gitPushWithLease.mockReset()
  gitPush.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      git: { amendCommit: gitAmendCommit, pushWithLease: gitPushWithLease, push: gitPush },
      runtime: { call: runtimeCall },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

const lease = {
  expectedHead: 'a'.repeat(40),
  pushTarget: { remoteName: 'fork', branchName: 'feature' }
}

describe('runtime git client amend', () => {
  it('preserves the captured lease and supplied target through local amend', async () => {
    const result = { success: true, pushLease: lease }
    gitAmendCommit.mockResolvedValue(result)
    const context = {
      settings: { activeRuntimeEnvironmentId: null },
      worktreeId: 'wt-1',
      worktreePath: '/repo',
      connectionId: 'conn-1'
    }

    await expect(amendRuntimeGitCommit(context, undefined, lease.pushTarget)).resolves.toEqual(
      result
    )
    expect(gitAmendCommit).toHaveBeenCalledWith({
      worktreePath: '/repo',
      worktreeId: 'wt-1',
      connectionId: 'conn-1',
      pushTarget: lease.pushTarget
    })
    await pushRuntimeGitWithLease(context, lease)
    expect(gitPushWithLease).toHaveBeenCalledWith({
      worktreePath: '/repo',
      connectionId: 'conn-1',
      lease
    })
    expect(gitPush).not.toHaveBeenCalled()
  })

  it('forwards the amend target and captured lease through the paired runtime', async () => {
    const context = {
      settings: { activeRuntimeEnvironmentId: 'env-1' },
      worktreeId: 'wt-1',
      worktreePath: '/repo'
    }
    const result = { success: true, pushLease: lease }
    runtimeEnvironmentCall.mockResolvedValue({ id: 'rpc-1', ok: true, result })

    await expect(amendRuntimeGitCommit(context, undefined, lease.pushTarget)).resolves.toEqual(
      result
    )
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'git.amendCommit',
      params: { worktree: 'id:wt-1', pushTarget: lease.pushTarget },
      timeoutMs: 30_000
    })
    runtimeEnvironmentCall.mockResolvedValue({ id: 'rpc-2', ok: true, result: { ok: true } })
    await pushRuntimeGitWithLease(context, lease)
    expect(runtimeEnvironmentCall).toHaveBeenLastCalledWith({
      selector: 'env-1',
      method: 'git.pushWithLease',
      params: { worktree: 'id:wt-1', lease },
      timeoutMs: 30_000
    })
    expect(gitPushWithLease).not.toHaveBeenCalled()
  })

  it('refuses an old runtime without an unsafe push or local fallback', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: false,
      error: { code: 'method_not_found', message: 'Unknown method: git.pushWithLease' }
    })

    await expect(
      pushRuntimeGitWithLease(
        {
          settings: { activeRuntimeEnvironmentId: 'env-1' },
          worktreeId: 'wt-1',
          worktreePath: '/repo'
        },
        lease
      )
    ).rejects.toMatchObject({ code: 'method_not_found' })
    expect(runtimeEnvironmentCall).toHaveBeenCalledTimes(1)
    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'git.pushWithLease',
      params: { worktree: 'id:wt-1', lease },
      timeoutMs: 30_000
    })
    expect(gitPush).not.toHaveBeenCalled()
    expect(gitPushWithLease).not.toHaveBeenCalled()
    expect(runtimeCall).not.toHaveBeenCalled()
  })

  it('uses local git IPC and omits an absent message so the old one is kept', async () => {
    gitAmendCommit.mockResolvedValue({ success: true })

    await amendRuntimeGitCommit(
      {
        settings: { activeRuntimeEnvironmentId: null },
        worktreeId: 'wt-1',
        worktreePath: '/repo',
        connectionId: 'conn-1'
      },
      undefined
    )

    expect(gitAmendCommit).toHaveBeenCalledWith({ worktreePath: '/repo', connectionId: 'conn-1' })
    expect(runtimeEnvironmentCall).not.toHaveBeenCalled()
  })

  it('routes amend through the git.amendCommit RPC on the active runtime', async () => {
    runtimeEnvironmentCall.mockResolvedValue({
      id: 'rpc-1',
      ok: true,
      result: { success: true },
      _meta: { runtimeId: 'remote-runtime' }
    })

    await amendRuntimeGitCommit(
      {
        settings: { activeRuntimeEnvironmentId: 'env-1' },
        worktreeId: 'wt-1',
        worktreePath: '/repo'
      },
      'fix: reworded'
    )

    expect(runtimeEnvironmentCall).toHaveBeenCalledWith({
      selector: 'env-1',
      method: 'git.amendCommit',
      params: { worktree: 'id:wt-1', message: 'fix: reworded' },
      timeoutMs: 30_000
    })
    expect(gitAmendCommit).not.toHaveBeenCalled()
  })
})
