import { describe, expect, it, vi } from 'vitest'
import { i18n } from '@/i18n/i18n'
import type { SourceControlActionError } from './action-error'
import {
  runAmendAndForcePushFlow,
  type AmendAndForcePushDependencies
} from './amend-and-force-push-flow'
import type { RunRemoteActionResult } from './use-remote-action-runner'

type RemoteActionErrors = Record<string, SourceControlActionError | null>

const WORKTREE_ID = 'worktree-1'
const PUSH_LEASE = {
  expectedHead: 'a'.repeat(40),
  pushTarget: { remoteName: 'fork', branchName: 'topic' }
}

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
  storedErrors = {},
  pushLease = PUSH_LEASE
}: {
  amended: boolean
  pushResult: RunRemoteActionResult
  storedErrors?: RemoteActionErrors
  pushLease?: typeof PUSH_LEASE | null
}) {
  let remoteActionErrors = storedErrors
  const handleCommit = vi.fn<AmendAndForcePushDependencies['handleCommit']>(
    async (_message, options) => {
      if (amended) {
        options?.onCommitted?.({ success: true, ...(pushLease ? { pushLease } : {}) })
      }
      return amended
    }
  )
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
    expect(flow.handleCommit).toHaveBeenCalledWith(undefined, {
      amend: true,
      capturePushLease: true,
      onCommitted: expect.any(Function)
    })
    expect(flow.runRemoteAction).not.toHaveBeenCalled()
  })

  it('force pushes after a successful amend', async () => {
    const flow = setup({ amended: true, pushResult: { status: 'ok' } })
    await flow.run()
    expect(flow.runRemoteAction).toHaveBeenCalledWith('force_push', { amendPushLease: PUSH_LEASE })
  })

  it('requires the explicit-lease path when an older amend host omits the lease', async () => {
    const flow = setup({
      amended: true,
      pushResult: { status: 'failed', error: actionError() },
      pushLease: null
    })
    await flow.run()
    expect(flow.runRemoteAction).toHaveBeenCalledWith('force_push', { amendPushLease: null })
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

  it('translates the failure message and interpolates the original push error', async () => {
    i18n.addResourceBundle('amendtest', 'translation', {
      'auto.components.right.sidebar.source.control.sync.amend.and.force.push.flow.pushFailed':
        'Retry Force Push. Original error: {{error}}. Local amend completed.'
    })
    try {
      await i18n.changeLanguage('amendtest')
      const failedError = actionError({ message: 'Rejected <remote> & {{reason}}' })
      const flow = setup({
        amended: true,
        pushResult: { status: 'failed', error: failedError },
        storedErrors: { [WORKTREE_ID]: failedError }
      })
      await flow.run()
      expect(flow.runRemoteAction).toHaveBeenCalledWith('force_push', {
        amendPushLease: PUSH_LEASE
      })
      expect(flow.readErrors()[WORKTREE_ID]).toEqual({
        ...failedError,
        message:
          'Retry Force Push. Original error: Rejected <remote> & {{reason}}. Local amend completed.'
      })
    } finally {
      await i18n.changeLanguage('en')
      i18n.removeResourceBundle('amendtest', 'translation')
    }
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
