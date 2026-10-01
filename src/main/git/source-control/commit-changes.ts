import {
  buildGitAmendCommitArgs,
  buildGitCommitArgs,
  readGitCommitFailureMessage,
  type GitCommitResult
} from '../../../shared/git-commit-command'
import { captureGitAmendPushLease } from '../../../shared/git-push-lease'
import type { GitPushTarget } from '../../../shared/worktree/types'
import type { GitRuntimeOptions } from '../git-runtime-options'
import { gitOptionsForWorktree } from '../git-runtime-options'
import { gitExecFileAsync } from '../runner'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

export async function commitChanges(
  worktreePath: string,
  message: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitResult> {
  return runGitCommit(worktreePath, buildGitCommitArgs(message), 'Commit failed', options)
}

export async function amendCommit(
  worktreePath: string,
  message: string | undefined,
  options: GitRuntimeOptions = {},
  pushTarget?: GitPushTarget
): Promise<GitCommitResult> {
  const pushLease = await captureGitAmendPushLease(
    (args) => gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options)),
    pushTarget
  )
  const result = await runGitCommit(
    worktreePath,
    buildGitAmendCommitArgs(message),
    'Amend failed',
    options
  )
  return result.success && pushLease ? { ...result, pushLease } : result
}

async function runGitCommit(
  worktreePath: string,
  args: string[],
  fallbackError: string,
  options: GitRuntimeOptions
): Promise<GitCommitResult> {
  invalidateGitReadCaches()
  try {
    await gitExecFileAsync(args, gitOptionsForWorktree(worktreePath, options))
    return { success: true }
  } catch (error) {
    return { success: false, error: readGitCommitFailureMessage(error, fallbackError) }
  } finally {
    invalidateGitReadCaches()
  }
}
