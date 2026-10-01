// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../../../shared/constants'
import { useSourceControlCommitAction } from './use-commit-action'

const calls = vi.hoisted(() => ({ amend: vi.fn(), commit: vi.fn() }))
vi.mock('@/runtime/runtime-git-client', () => ({
  amendRuntimeGitCommit: calls.amend,
  commitRuntimeGit: calls.commit
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const target = {
  settings: getDefaultSettings('/tmp'),
  worktreeId: 'worktree',
  worktreePath: '/repo',
  pushTarget: { remoteName: 'fork', branchName: 'topic' }
}

function setup() {
  return renderHook(() =>
    useSourceControlCommitAction({
      activeRepoSettings: target.settings,
      activeWorktree: null,
      activeWorktreeId: 'worktree',
      beginGitBranchCompareRequest: vi.fn(),
      commitInFlightRef: { current: {} },
      commitMessage: '',
      compareBaseRef: null,
      refreshActiveGitStatusAfterMutation: vi.fn(async () => {}),
      refreshBranchCompareRef: { current: async () => {} },
      refreshGitHistoryRef: { current: async () => {} },
      setCommitErrorForWorktree: vi.fn(),
      setCommitInFlightByWorktree: vi.fn(),
      stagedCount: 1,
      unresolvedConflictCount: 0,
      updateCommitDrafts: vi.fn(),
      worktreePath: '/repo'
    })
  ).result.current
}

describe('commit action amend lease result', () => {
  it('returns the host lease to the combined action and supplies its explicit push target', async () => {
    const pushLease = { expectedHead: 'a'.repeat(40), pushTarget: target.pushTarget }
    const result = { success: true, pushLease }
    calls.amend.mockResolvedValueOnce(result)
    const onCommitted = vi.fn()
    expect(
      await setup().handleCommit(undefined, {
        amend: true,
        target,
        capturePushLease: true,
        onCommitted
      })
    ).toBe(true)
    expect(calls.amend).toHaveBeenLastCalledWith(
      {
        settings: target.settings,
        worktreeId: 'worktree',
        worktreePath: '/repo',
        connectionId: undefined
      },
      undefined,
      target.pushTarget
    )
    expect(onCommitted).toHaveBeenCalledWith(result)
  })

  it('does not materialize a push target for an ordinary local amend', async () => {
    calls.amend.mockResolvedValueOnce({ success: true })
    expect(await setup().handleCommit(undefined, { amend: true, target })).toBe(true)
    expect(calls.amend).toHaveBeenLastCalledWith(
      {
        settings: target.settings,
        worktreeId: 'worktree',
        worktreePath: '/repo',
        connectionId: undefined
      },
      undefined,
      undefined
    )
  })
})
