// @vitest-environment happy-dom
import { renderHook } from '@testing-library/react'
import { describe, expect, it, vi } from 'vitest'
import { useSourceControlCommitAction } from './use-commit-action'

const calls = vi.hoisted(() => ({ amend: vi.fn(), commit: vi.fn() }))
vi.mock('@/runtime/runtime-git-amend-client', () => ({ amendRuntimeGitCommit: calls.amend }))
vi.mock('@/runtime/runtime-git-sync-client', () => ({
  commitRuntimeGit: calls.commit,
  completeRuntimeGitMerge: vi.fn()
}))
vi.mock('@/lib/connection-context', () => ({ getConnectionId: () => undefined }))

const runtimeTarget = { kind: 'local' as const }
const target = {
  target: runtimeTarget,
  worktreeId: 'worktree',
  worktreePath: '/repo',
  pushTarget: { remoteName: 'fork', branchName: 'topic' }
}
const expectedContext = {
  target: runtimeTarget,
  worktreeId: 'worktree',
  worktreePath: '/repo',
  connectionId: undefined
}

function setup() {
  return renderHook(() =>
    useSourceControlCommitAction({
      activeRepoTarget: runtimeTarget,
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
    expect(calls.amend).toHaveBeenLastCalledWith(expectedContext, undefined, target.pushTarget)
    expect(onCommitted).toHaveBeenCalledWith(result)
    expect(calls.commit).not.toHaveBeenCalled()
  })

  it('does not materialize a push target for an ordinary local amend', async () => {
    calls.amend.mockResolvedValueOnce({ success: true })
    expect(await setup().handleCommit(undefined, { amend: true, target })).toBe(true)
    expect(calls.amend).toHaveBeenLastCalledWith(expectedContext, undefined, undefined)
  })
})
