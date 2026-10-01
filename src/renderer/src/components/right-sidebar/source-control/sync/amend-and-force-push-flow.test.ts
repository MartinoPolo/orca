import { describe, expect, it, vi } from 'vitest'
import type { SourceControlActionError } from './action-error'
import {
  runAmendAndForcePushFlow,
  type AmendAndForcePushDependencies
} from './amend-and-force-push-flow'
import type { RunRemoteActionResult } from './use-remote-action-runner'

type RemoteActionErrors = Record<string, SourceControlActionError | null>

const WORKTREE_ID = 'worktree-1'

function actionError(overrides: Partial<SourceControlActionError> = {}): SourceControlActionError {
  return {
    kind: 'force_push',
    message: 'Remote rejected the push.',
    rawError: 'stale info',
    sequence: 4,
    ...overrides
  }
}

function setup({
  amended,
  pushResult,
  storedErrors = {}
}: {
  amended: boolean
  pushResult: RunRemoteActionResult
  storedErrors?: RemoteActionErrors
}) {
  let remoteActionErrors = storedErrors
  const handleCommit = vi.fn<AmendAndForcePushDependencies['handleCommit']>(async () => amended)
  const runRemoteAction = vi.fn<AmendAndForcePushDependencies['runRemoteAction']>(
    async () => pushResult
  )
  const setRemoteActionErrors: AmendAndForcePushDependencies['setRemoteActionErrors'] = (
    update
  ) => {
    remoteActionErrors = typeof update === 'function' ? update(remoteActionErrors) : update
  }
  const run = (activeWorktreeId: string | null = WORKTREE_ID): Promise<void> =>
    runAmendAndForcePushFlow({
      activeWorktreeId,
      handleCommit,
      runRemoteAction,
      setRemoteActionErrors
    })
  return { handleCommit, runRemoteAction, run, readErrors: () => remoteActionErrors }
}

describe('runAmendAndForcePushFlow', () => {
  it('does not push when the amend fails', async () => {
    const flow = setup({ amended: false, pushResult: { status: 'ok' } })
    await flow.run()
    expect(flow.handleCommit).toHaveBeenCalledWith(undefined, { amend: true })
    expect(flow.runRemoteAction).not.toHaveBeenCalled()
  })

  it('force pushes after a successful amend', async () => {
    const flow = setup({ amended: true, pushResult: { status: 'ok' } })
    await flow.run()
    expect(flow.runRemoteAction).toHaveBeenCalledWith('force_push')
  })

  it('explains the local amend when the force push fails', async () => {
    const failedError = actionError()
    const flow = setup({
      amended: true,
      pushResult: { status: 'failed', error: failedError },
      storedErrors: { [WORKTREE_ID]: failedError }
    })
    await flow.run()
    expect(flow.readErrors()[WORKTREE_ID]).toEqual({
      ...failedError,
      message:
        'Commit amended locally. Remote rejected the push. Use Force Push from the menu to retry.'
    })
  })

  it('leaves a newer stored error untouched', async () => {
    const newerError = actionError({ sequence: 5, message: 'Newer failure.' })
    const storedErrors = { [WORKTREE_ID]: newerError }
    const flow = setup({
      amended: true,
      pushResult: { status: 'failed', error: actionError({ sequence: 4 }) },
      storedErrors
    })
    await flow.run()
    expect(flow.readErrors()).toBe(storedErrors)
  })

  it('does not rewrite errors without an active worktree', async () => {
    const failedError = actionError()
    const storedErrors = { [WORKTREE_ID]: failedError }
    const flow = setup({
      amended: true,
      pushResult: { status: 'failed', error: failedError },
      storedErrors
    })
    await flow.run(null)
    expect(flow.readErrors()).toBe(storedErrors)
  })

  it.each<RunRemoteActionResult>([
    { status: 'ok' },
    { status: 'skipped' },
    { status: 'superseded' }
  ])('leaves errors untouched when the force push ends as $status', async (pushResult) => {
    const storedErrors = { [WORKTREE_ID]: actionError() }
    const flow = setup({ amended: true, pushResult, storedErrors })
    await flow.run()
    expect(flow.readErrors()).toBe(storedErrors)
  })
})
