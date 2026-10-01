import { ipcMain } from 'electron'
import type { GitCommitResult } from '../../../shared/git-commit-command'
import type { GitPushTarget } from '../../../shared/worktree/types'
import { assertValidGitPushTarget } from '../../../shared/git-push-target-validation'
import {
  materializeWorktreePushTargetRemote,
  materializeWorktreePushTargetRemoteSsh
} from '../worktree-remote'
import { amendCommit, commitChanges } from '../../git/status'
import {
  getSshGitProvider,
  SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE
} from '../../providers/ssh-git-dispatch'
import { resolveRegisteredWorktreePath } from '../registered-worktree-roots-cache'
import { getLocalGitOptionsForRegisteredWorktree } from '../local-worktree-runtime-options'
import type { FilesystemHandlerContext } from './filesystem-handler-context'

export function registerFilesystemGitCommitHandlers(context: FilesystemHandlerContext): void {
  const { store } = context
  ipcMain.handle(
    'git:commit',
    async (
      _event,
      args: { worktreePath: string; message: string; connectionId?: string }
    ): Promise<GitCommitResult> => {
      // Why: validate at the IPC boundary so the renderer gets a clear error instead of an opaque execFile failure.
      if (typeof args.message !== 'string' || args.message.trim().length === 0) {
        throw new Error('Commit message is required')
      }
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        return provider.commit(args.worktreePath, args.message)
      }
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
      if (args.connectionId) {
        const provider = getSshGitProvider(args.connectionId)
        if (!provider) {
          throw new Error(SSH_GIT_PROVIDER_UNAVAILABLE_MESSAGE)
        }
        const materializedPushTarget = args.pushTarget
          ? await materializeWorktreePushTargetRemoteSsh(
              provider,
              args.worktreePath,
              args.pushTarget,
              store,
              undefined,
              args.worktreeId
            )
          : undefined
        return provider.amendCommit(args.worktreePath, message, materializedPushTarget)
      }
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
            args.worktreeId
          )
        : undefined
      return amendCommit(
        worktreePath,
        message,
        {
          ...gitOptions,
          admissionTier: 'interactive'
        },
        materializedPushTarget
      )
    }
  )
}
