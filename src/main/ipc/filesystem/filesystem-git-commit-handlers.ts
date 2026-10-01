import { ipcMain } from 'electron'
import type { GitCommitResult } from '../../../shared/git-commit-command'
import { assertValidGitPushTarget } from '../../../shared/git-push-target-validation'
import type { GitPushTarget } from '../../../shared/worktree/types'
import { amendCommit, commitChanges, completeMerge } from '../../git/status'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import { ipcGitWorktreeTarget, materializeWorktreePushTargetRemote } from '../worktree-remote'
import type { FilesystemHandlerContext } from './filesystem-handler-context'
import { requireReachableGitRoute } from '../../providers/execution-host-provider-dispatch'
import { getConnectionExecutionHostId } from '../../../shared/execution-host'

export function registerFilesystemGitCommitHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:commit',
    async (
      _event,
      args: { worktreePath: string; message: string; connectionId?: string }
    ): Promise<GitCommitResult> => {
      // Validate at IPC so users receive a clear error before process launch.
      if (typeof args.message !== 'string' || args.message.trim().length === 0) {
        throw new Error('Commit message is required')
      }
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return commitChanges(worktreePath, args.message, {
        ...gitOptions,
        admissionTier: 'interactive'
      })
    }
  )
  ipcMain.handle(
    'git:amendCommit',
    async (
      _event,
      args: {
        worktreePath: string
        worktreeId?: string
        message?: string
        connectionId?: string
        pushTarget?: GitPushTarget
      }
    ): Promise<GitCommitResult> => {
      const message = typeof args.message === 'string' ? args.message : undefined
      if (args.pushTarget) {
        assertValidGitPushTarget(args.pushTarget)
      }
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      const materializedPushTarget = args.pushTarget
        ? await materializeWorktreePushTargetRemote(
            worktreePath,
            args.pushTarget,
            store,
            undefined,
            gitOptions,
            ipcGitWorktreeTarget(args)
          )
        : undefined
      return amendCommit(
        worktreePath,
        message,
        { ...gitOptions, admissionTier: 'interactive' },
        materializedPushTarget
      )
    }
  )
  ipcMain.handle(
    'git:completeMerge',
    async (
      _event,
      args: { worktreePath: string; connectionId?: string }
    ): Promise<GitCommitResult> => {
      requireReachableGitRoute(getConnectionExecutionHostId(args.connectionId))
      const worktreePath = await resolveRegisteredWorktreePath(args.worktreePath, store)
      const gitOptions = getLocalGitOptionsForRegisteredWorktree(
        store,
        args.worktreePath,
        worktreePath
      )
      return completeMerge(worktreePath, {
        ...gitOptions,
        admissionTier: 'interactive'
      })
    }
  )
}
