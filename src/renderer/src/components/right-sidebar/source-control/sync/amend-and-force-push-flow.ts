import type { GitPushLease } from '../../../../../../shared/git-commit-command'
import { translate } from '@/i18n/i18n'
import type { SourceControlCommitAction } from '../commit/use-commit-action'
import type { SourceControlWorktreeOperationState } from '../panel/use-worktree-operation-state'
import type { SourceControlRemoteActionRunner } from './use-remote-action-runner'

export type AmendAndForcePushDependencies = {
  activeWorktreeId: string | null
  handleCommit: SourceControlCommitAction['handleCommit']
  runRemoteAction: SourceControlRemoteActionRunner['runRemoteAction']
  setRemoteActionErrors: SourceControlWorktreeOperationState['setRemoteActionErrors']
}

/**
 * Amends HEAD and immediately force-pushes it with lease. Only offered when HEAD is already
 * published, so the branch never stays diverged with Sync as the suggested next step.
 */
export async function runAmendAndForcePushFlow({
  activeWorktreeId,
  handleCommit,
  runRemoteAction,
  setRemoteActionErrors
}: AmendAndForcePushDependencies): Promise<void> {
  let pushLease: GitPushLease | undefined
  const amended = await handleCommit(undefined, {
    amend: true,
    capturePushLease: true,
    onCommitted: (result) => {
      pushLease = result.pushLease
    }
  })
  if (!amended) {
    return
  }
  const result = await runRemoteAction('force_push', { amendPushLease: pushLease ?? null })
  if (result.status !== 'failed' || !activeWorktreeId) {
    return
  }
  const failedError = result.error
  // Why: the amend already rewrote local history, so the push error alone would hide that the retry is a plain Force Push.
  setRemoteActionErrors((previousErrors) => {
    const currentError = previousErrors[activeWorktreeId]
    if (!currentError || currentError.sequence !== failedError.sequence) {
      return previousErrors
    }
    return {
      ...previousErrors,
      [activeWorktreeId]: {
        ...currentError,
        message: translate(
          'auto.components.right.sidebar.source.control.sync.amend.and.force.push.flow.pushFailed',
          'Commit amended locally. {{error}} Use Force Push from the menu to retry.',
          { error: failedError.message }
        )
      }
    }
  })
}
