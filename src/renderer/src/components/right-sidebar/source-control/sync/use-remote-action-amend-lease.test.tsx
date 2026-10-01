// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { useSourceControlRemoteActionRunner } from './use-remote-action-runner'
import { runAmendAndForcePushFlow } from './amend-and-force-push-flow'
import type { SourceControlActionError } from './action-error'

vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))
const OWNER_SETTINGS = getDefaultSettings('/tmp')

function setup(pushLease?: {
  expectedHead: string
  pushTarget: { remoteName: string; branchName: string }
}) {
  const pushBranch = vi.fn(async () => {})
  let errors: Record<string, SourceControlActionError | null> = {}
  const setRemoteActionErrors: Parameters<
    typeof useSourceControlRemoteActionRunner
  >[0]['setRemoteActionErrors'] = (update) => {
    errors = typeof update === 'function' ? update(errors) : update
  }
  const handleCommit: Parameters<
    typeof useSourceControlRemoteActionRunner
  >[0]['handleCommit'] = async (_message, options) => {
    options?.onCommitted?.({ success: true, ...(pushLease ? { pushLease } : {}) })
    return true
  }
  const { result } = renderHook(() =>
    useSourceControlRemoteActionRunner({
      activeRepoSettings: OWNER_SETTINGS,
      activeWorktree: null,
      activeWorktreeId: 'worktree',
      branchName: 'topic',
      effectiveBaseRef: null,
      fastForwardBranch: vi.fn(async () => {}),
      fetchBranch: vi.fn(async () => {}),
      grouped: { staged: [], unstaged: [], untracked: [] },
      handleCommit,
      pullBranch: vi.fn(async () => {}),
      pushBranch,
      rebaseFromBase: vi.fn(async () => {}),
      refreshActiveGitStatusAfterMutation: vi.fn(async () => {}),
      refreshBranchCompareRef: { current: async () => {} },
      refreshGitHistoryRef: { current: async () => {} },
      remoteActionErrorSequenceByWorktreeRef: { current: {} },
      remoteStatus: undefined,
      remoteStatusForActions: undefined,
      setRemoteActionErrors,
      syncBranch: vi.fn(async () => {}),
      worktreePath: '/repo'
    })
  )
  return {
    pushBranch,
    readErrors: () => errors,
    run: () =>
      runAmendAndForcePushFlow({
        activeWorktreeId: 'worktree',
        handleCommit,
        runRemoteAction: result.current.runRemoteAction,
        setRemoteActionErrors
      })
  }
}

describe('automatic amend push lease boundary', () => {
  it('fails closed after a successful legacy amend response, without calling any push', async () => {
    const flow = setup()
    await flow.run()
    expect(flow.pushBranch).not.toHaveBeenCalled()
    expect(flow.readErrors().worktree?.message).toContain('Commit amended locally.')
    expect(flow.readErrors().worktree?.message).toContain('host did not provide a pre-amend lease')
    expect(flow.readErrors().worktree?.message).toContain('Use Force Push from the menu to retry.')
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
      runtimeTargetSettings: OWNER_SETTINGS,
      pushLease
    })
  })
})
