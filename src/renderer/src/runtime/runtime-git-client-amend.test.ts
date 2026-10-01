import { beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createCompatibleRuntimeStatusResponseIfNeeded,
  type RuntimeEnvironmentCallRequest
} from './runtime-compatibility-test-fixture'
import { amendRuntimeGitCommit } from './runtime-git-client'
import { clearRuntimeCompatibilityCacheForTests } from './runtime-rpc-client'

const gitAmendCommit = vi.fn()
const runtimeEnvironmentCall = vi.fn()
const runtimeEnvironmentTransportCall = vi.fn()
const runtimeCall = vi.fn()

beforeEach(() => {
  clearRuntimeCompatibilityCacheForTests()
  gitAmendCommit.mockReset()
  runtimeEnvironmentCall.mockReset()
  runtimeEnvironmentTransportCall.mockReset()
  runtimeCall.mockReset()
  runtimeEnvironmentTransportCall.mockImplementation((args: RuntimeEnvironmentCallRequest) => {
    return createCompatibleRuntimeStatusResponseIfNeeded(args) ?? runtimeEnvironmentCall(args)
  })
  vi.stubGlobal('window', {
    api: {
      git: { amendCommit: gitAmendCommit },
      runtime: { call: runtimeCall },
      runtimeEnvironments: { call: runtimeEnvironmentTransportCall }
    }
  })
})

describe('runtime git client amend', () => {
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
