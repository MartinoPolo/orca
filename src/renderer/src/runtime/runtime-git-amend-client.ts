import {
  parseGitCommitResult,
  type GitCommitResult,
  type GitPushLease
} from '../../../shared/git-commit-command'
import type { GitPushTarget } from '../../../shared/worktree/types'
import { translate } from '@/i18n/i18n'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc } from './runtime-rpc-client'
import { RuntimeRpcCallError } from './runtime-rpc-result'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

function isMethodNotFound(error: unknown): boolean {
  return error instanceof RuntimeRpcCallError && error.code === 'method_not_found'
}

export async function amendRuntimeGitCommit(
  context: RuntimeGitContext,
  message: string | undefined,
  pushTarget?: GitPushTarget
): Promise<GitCommitResult> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.amendCommit({
      worktreePath: resolveLocalWorktreePath(context),
      ...(message !== undefined ? { message } : {}),
      ...(pushTarget ? { pushTarget } : {}),
      ...(pushTarget && context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      connectionId: context.connectionId
    })
  }
  try {
    const result = await callRuntimeRpc<unknown>(
      target,
      'git.amendCommit',
      {
        worktree: toRuntimeWorktreeSelector(context.worktreeId),
        ...(message !== undefined ? { message } : {}),
        ...(pushTarget ? { pushTarget } : {})
      },
      { timeoutMs: 30_000 }
    )
    return parseGitCommitResult(result)
  } catch (error) {
    if (isMethodNotFound(error)) {
      return {
        success: false,
        error: translate(
          'auto.runtime.runtimeGitAmendClient.amendNeedsNewerHost',
          'Amending a commit needs a newer Orca on this host. Update Orca on that host.'
        )
      }
    }
    throw error
  }
}

export async function pushRuntimeGitWithLease(
  context: RuntimeGitContext,
  lease: GitPushLease
): Promise<void> {
  const target = context.target
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.pushWithLease({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      lease
    })
    return
  }
  try {
    await callRuntimeRpc(
      target,
      'git.pushWithLease',
      { worktree: toRuntimeWorktreeSelector(context.worktreeId), lease },
      { timeoutMs: 30_000 }
    )
  } catch (error) {
    // Never retry as a bare --force-with-lease: it would trust a tracking ref refreshed after the amend.
    if (isMethodNotFound(error)) {
      throw new Error(
        translate(
          'auto.runtime.runtimeGitAmendClient.pushWithLeaseNeedsNewerHost',
          'Force pushing an amended commit needs a newer Orca on this host. Update Orca on that host.'
        )
      )
    }
    throw error
  }
}
