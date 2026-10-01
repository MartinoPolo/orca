import { expect, it, vi } from 'vitest'
import { getDefaultSettings } from '../../../../shared/constants'
import type * as RuntimeGitClient from '@/runtime/runtime-git-client'
import { createEditorStore } from './editor-slice-test-harness'

const calls = vi.hoisted(() => ({ push: vi.fn(), pushWithLease: vi.fn(), upstream: vi.fn() }))
vi.mock('@/runtime/runtime-git-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeGitClient>()),
  pushRuntimeGit: calls.push,
  pushRuntimeGitWithLease: calls.pushWithLease,
  getRuntimeGitUpstreamStatus: calls.upstream
}))
vi.mock('sonner', () => ({ toast: { error: vi.fn() } }))

it('routes the existing push action exclusively through explicit lease push after amend', async () => {
  const store = createEditorStore()
  const settings = getDefaultSettings('/tmp')
  const pushLease = {
    expectedHead: 'a'.repeat(40),
    pushTarget: { remoteName: 'fork', branchName: 'topic' }
  }
  store.setState({ settings })
  calls.upstream.mockResolvedValue({ hasUpstream: true, ahead: 0, behind: 0 })
  await store.getState().pushBranch('wt-1', '/repo', false, undefined, undefined, {
    forceWithLease: true,
    pushLease,
    runtimeTargetSettings: settings
  })
  expect(calls.pushWithLease).toHaveBeenCalledWith(
    { settings, worktreeId: 'wt-1', worktreePath: '/repo', connectionId: undefined },
    pushLease
  )
  expect(calls.push).not.toHaveBeenCalled()
})
