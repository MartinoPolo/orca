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
import { detectConflictOperation } from './git-conflict-operation'
import { invalidateGitReadCaches } from './git-read-cache-invalidation'

export function commitChanges(
  worktreePath: string,
  message: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitResult> {
  return runCommit(worktreePath, buildGitCommitArgs(message), 'Commit failed', options)
}

/** Concludes a paused merge with Git's MERGE_MSG; strip drops its "# Conflicts:" comments like an editor commit would. */
export async function completeMerge(
  worktreePath: string,
  options: GitRuntimeOptions = {}
): Promise<GitCommitResult> {
  // Without MERGE_HEAD, --no-edit would commit staged changes under commit.template text.
  if ((await detectConflictOperation(worktreePath, options)) !== 'merge') {
    return { success: false, error: 'There is no merge in progress.' }
  }
  return runCommit(
    worktreePath,
    ['commit', '--no-edit', '--cleanup=strip'],
    'Commit failed',
    options
  )
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
  const result = await runCommit(
    worktreePath,
    buildGitAmendCommitArgs(message),
    'Amend failed',
    options
  )
  return result.success && pushLease ? { ...result, pushLease } : result
}

async function runCommit(
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
