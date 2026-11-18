// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSourceControlRemoteActionRunner } from './use-remote-action-runner'
import { runAmendAndForcePushFlow } from './amend-and-force-push-flow'
import { getWorktreeOperationStore } from '../panel/worktree-operation-store'

vi.mock('@/lib/workspace/ownership/connection-context', () => ({ getConnectionId: () => undefined }))
const OWNER_TARGET = { kind: 'local' as const }
let setupCount = 0

function setup(pushLease?: {
  expectedHead: string
  pushTarget: { remoteName: string; branchName: string }
}) {
  const pushBranch = vi.fn(async () => {})
  setupCount += 1
  const operationStore = getWorktreeOperationStore(`worktree-${setupCount}`, null, undefined)
  const handleCommit: Parameters<
    typeof useSourceControlRemoteActionRunner
  >[0]['handleCommit'] = async (_message, options) => {
    options?.onCommitted?.({ success: true, ...(pushLease ? { pushLease } : {}) })
    return true
  }
  const { result } = renderHook(() =>
    useSourceControlRemoteActionRunner({
      activeRepoTarget: OWNER_TARGET,
      activeWorktree: null,
      activeWorktreeId: 'worktree',
      branchName: 'topic',
      effectiveBaseRef: null,
      fastForwardBranch: vi.fn(async () => {}),
      fetchBranch: vi.fn(async () => {}),
      grouped: { staged: [], unstaged: [], untracked: [] },
      handleCommit,
      operationStore,
      pullBranch: vi.fn(async () => {}),
      pushBranch,
      rebaseFromBase: vi.fn(async () => {}),
      refreshActiveGitStatusAfterMutation: vi.fn(async () => {}),
      refreshBranchCompareRef: { current: async () => {} },
      refreshGitHistoryRef: { current: async () => {} },
      remoteStatus: undefined,
      remoteStatusForActions: undefined,
      syncBranch: vi.fn(async () => {}),
      worktreePath: '/repo'
    })
  )
  return {
    pushBranch,
    readError: () => operationStore.getState().remoteActionError,
    run: () =>
      runAmendAndForcePushFlow({
        handleCommit,
        runRemoteAction: result.current.runRemoteAction,
        operationStore
      })
  }
}

describe('automatic amend push lease boundary', () => {
  it('fails closed after a successful legacy amend response, without calling any push', async () => {
    const flow = setup()
    await flow.run()
    expect(flow.pushBranch).not.toHaveBeenCalled()
    expect(flow.readError()?.message).toContain('Commit amended locally.')
    expect(flow.readError()?.message).toContain('host did not provide a pre-amend lease')
    expect(flow.readError()?.message).toContain('Use Force Push from the menu to retry.')
  })

  it('passes the host-captured lease to the existing push action', async () => {
    const pushLease = {
      expectedHead: 'a'.repeat(40),
      pushTarget: { remoteName: 'fork', branchName: 'review/topic' }
    }
    const flow = setup(pushLease)
    await flow.run()
    expect(flow.pushBranch).toHaveBeenCalledWith('worktree', '/repo', false, undefined, undefined, {
      forceWithLease: true,
      runtimeTarget: OWNER_TARGET,
      pushLease
    })
  })
})
