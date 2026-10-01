import { expect, it, vi } from 'vitest'
import type * as RuntimeGitSyncClient from '@/runtime/runtime-git-sync-client'
import { createEditorStore } from './editor-slice-test-harness'

const calls = vi.hoisted(() => ({ push: vi.fn(), pushWithLease: vi.fn(), upstream: vi.fn() }))
vi.mock('@/runtime/runtime-git-sync-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeGitSyncClient>()),
  pushRuntimeGit: calls.push,
  getRuntimeGitUpstreamStatus: calls.upstream
}))
vi.mock('@/runtime/runtime-git-amend-client', () => ({
  pushRuntimeGitWithLease: calls.pushWithLease
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

it('routes the existing push action exclusively through explicit lease push after amend', async () => {
  const store = createEditorStore()
  const runtimeTarget = { kind: 'local' as const }
  const pushLease = {
    expectedHead: 'a'.repeat(40),
    pushTarget: { remoteName: 'fork', branchName: 'topic' }
  }
  calls.upstream.mockResolvedValue({ hasUpstream: true, ahead: 0, behind: 0 })
  await store.getState().pushBranch('wt-1', '/repo', false, undefined, undefined, {
    forceWithLease: true,
    pushLease,
    runtimeTarget
  })
  expect(calls.pushWithLease).toHaveBeenCalledWith(
    { target: runtimeTarget, worktreeId: 'wt-1', worktreePath: '/repo', connectionId: undefined },
    pushLease
  )
  expect(calls.push).not.toHaveBeenCalled()
})
