import { describe, expect, it, vi } from 'vitest'
import type { OrcaRuntimeService } from '../../orca-runtime'
import { RpcDispatcher } from '../dispatcher'
import { GIT_METHODS } from './git'

const lease = {
  expectedHead: 'a'.repeat(40),
  pushTarget: { remoteName: 'fork', branchName: 'feature' }
}

function createDispatcher() {
  const pushRuntimeGitWithLease = vi.fn().mockResolvedValue({ ok: true })
  const amendRuntimeGitCommit = vi.fn().mockResolvedValue({ success: true, pushLease: lease })
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: these tests dispatch only the two mocked Git commands and runtime identity.
  const runtime = {
    getRuntimeId: () => 'test-runtime',
    pushRuntimeGitWithLease,
    amendRuntimeGitCommit
  } as unknown as OrcaRuntimeService
  return {
    dispatcher: new RpcDispatcher({ runtime, methods: GIT_METHODS }),
    pushRuntimeGitWithLease,
    amendRuntimeGitCommit
  }
}

describe('explicit lease Git RPC routing', () => {
  it('forwards the captured destination and expected HEAD through the dedicated method', async () => {
    const { dispatcher, pushRuntimeGitWithLease } = createDispatcher()
    const response = await dispatcher.dispatch({
      id: 'req-1',
      authToken: 'tok',
      method: 'git.pushWithLease',
      params: { worktree: 'id:wt-1', lease }
    })

    expect(response).toMatchObject({ ok: true, result: { ok: true } })
    expect(pushRuntimeGitWithLease).toHaveBeenCalledWith('id:wt-1', lease)
  })

  it.each([
    undefined,
    { pushTarget: lease.pushTarget },
    { expectedHead: 'abc123', pushTarget: lease.pushTarget },
    { expectedHead: lease.expectedHead },
    { expectedHead: lease.expectedHead, pushTarget: { remoteName: 'fork' } }
  ])('refuses incomplete leases before invoking the runtime: %j', async (invalidLease) => {
    const { dispatcher, pushRuntimeGitWithLease } = createDispatcher()
    const response = await dispatcher.dispatch({
      id: 'req-1',
      authToken: 'tok',
      method: 'git.pushWithLease',
      params: { worktree: 'id:wt-1', lease: invalidLease }
    })

    expect(response).toMatchObject({ ok: false, error: { code: 'invalid_argument' } })
    expect(pushRuntimeGitWithLease).not.toHaveBeenCalled()
  })

  it('forwards an optional amend target and preserves the lease result', async () => {
    const { dispatcher, amendRuntimeGitCommit } = createDispatcher()
    const response = await dispatcher.dispatch({
      id: 'req-1',
      authToken: 'tok',
      method: 'git.amendCommit',
      params: { worktree: 'id:wt-1', pushTarget: lease.pushTarget }
    })

    expect(amendRuntimeGitCommit).toHaveBeenCalledWith('id:wt-1', undefined, lease.pushTarget)
    expect(response).toMatchObject({ ok: true, result: { success: true, pushLease: lease } })
  })
})
