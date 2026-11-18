import type { PreloadApi } from '../../../../../preload/api-types'
import { parseGitCommitResult } from '../../../../../shared/git/commands/git-commit-command'
import { toRuntimeWorktreeSelector } from '../../../runtime/rpc/targets/runtime-worktree-selector'
import { callRuntimeResult } from '../../runtime/client/web-runtime-calls'
import { resolveRuntimeWorktreeByPath } from '../workspaces/web-runtime-worktree-catalog'

type WebGitAmendApi = Pick<PreloadApi['git'], 'amendCommit' | 'pushWithLease'>

export function createWebGitAmendApi(): WebGitAmendApi {
  return {
    amendCommit: async ({ worktreePath, message, pushTarget }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      const result = await callRuntimeResult('git.amendCommit', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        ...(message !== undefined ? { message } : {}),
        ...(pushTarget ? { pushTarget } : {})
      })
      return parseGitCommitResult(result)
    },
    pushWithLease: async ({ worktreePath, lease }) => {
      const worktree = await resolveRuntimeWorktreeByPath(worktreePath)
      await callRuntimeResult('git.pushWithLease', {
        worktree: toRuntimeWorktreeSelector(worktree.id),
        lease
      })
    }
  }
}
