import type { GitCommitResult, GitPushLease } from '../../../shared/git-commit-command'
import type { GitForkSyncExpectedUpstream, GitForkSyncResult } from '../../../shared/git-fork-sync'
import type { GitUpstreamStatus } from '../../../shared/git-status-types'
import { REBASE_FROM_BASE_RPC_TIMEOUT_MS } from '../../../shared/git-rebase-source'
import type { GitPushTarget } from '../../../shared/worktree/types'
import { resolveLocalWorktreePath, type RuntimeGitContext } from './runtime-git-client-context'
import { callRuntimeRpc, getActiveRuntimeTarget } from './runtime-rpc-client'
import { toRuntimeWorktreeSelector } from './runtime-worktree-selector'

export async function abortRuntimeGitMerge(context: RuntimeGitContext): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.abortMerge({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.abortMerge',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId) },
    { timeoutMs: 30_000 }
  )
}

export async function abortRuntimeGitRebase(context: RuntimeGitContext): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.abortRebase({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.abortRebase',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId) },
    { timeoutMs: 30_000 }
  )
}

export async function getRuntimeGitUpstreamStatus(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<GitUpstreamStatus> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.upstreamStatus({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...(pushTarget ? { pushTarget } : {})
    })
  }
  return callRuntimeRpc<GitUpstreamStatus>(
    target,
    'git.upstreamStatus',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 15_000 }
  )
}

export async function fetchRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.fetch({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...(context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      ...(pushTarget ? { pushTarget } : {})
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.fetch',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function syncRuntimeGitForkDefaultBranch(
  context: RuntimeGitContext,
  expectedUpstream: GitForkSyncExpectedUpstream
): Promise<GitForkSyncResult> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.syncFork({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      expectedUpstream
    })
  }
  return callRuntimeRpc<GitForkSyncResult>(
    target,
    'git.forkSync',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), expectedUpstream },
    { timeoutMs: 60_000 }
  )
}

export async function pullRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.pull({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...(context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      ...(pushTarget ? { pushTarget } : {})
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.pull',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function fastForwardRuntimeGit(
  context: RuntimeGitContext,
  pushTarget?: GitPushTarget
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.fastForward({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...(context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      ...(pushTarget ? { pushTarget } : {})
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.fastForward',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function rebaseRuntimeGitFromBase(
  context: RuntimeGitContext,
  baseRef: string
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.rebaseFromBase({
      worktreePath: resolveLocalWorktreePath(context),
      baseRef,
      connectionId: context.connectionId
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.rebaseFromBase',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), baseRef },
    { timeoutMs: REBASE_FROM_BASE_RPC_TIMEOUT_MS }
  )
}

export async function pushRuntimeGit(
  context: RuntimeGitContext,
  args: { publish?: boolean; pushTarget?: GitPushTarget; forceWithLease?: boolean } = {}
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.push({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      ...(context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      ...(args.publish !== undefined ? { publish: args.publish } : {}),
      ...(args.pushTarget !== undefined ? { pushTarget: args.pushTarget } : {}),
      ...(args.forceWithLease !== undefined ? { forceWithLease: args.forceWithLease } : {})
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.push',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(args.publish !== undefined ? { publish: args.publish } : {}),
      ...(args.pushTarget !== undefined ? { pushTarget: args.pushTarget } : {}),
      ...(args.forceWithLease !== undefined ? { forceWithLease: args.forceWithLease } : {})
    },
    { timeoutMs: 30_000 }
  )
}

export async function pushRuntimeGitWithLease(
  context: RuntimeGitContext,
  lease: GitPushLease
): Promise<void> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    await window.api.git.pushWithLease({
      worktreePath: resolveLocalWorktreePath(context),
      connectionId: context.connectionId,
      lease
    })
    return
  }
  await callRuntimeRpc(
    target,
    'git.pushWithLease',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), lease },
    { timeoutMs: 30_000 }
  )
}

export async function commitRuntimeGit(
  context: RuntimeGitContext,
  message: string
): Promise<GitCommitResult> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.commit({
      worktreePath: resolveLocalWorktreePath(context),
      message,
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<GitCommitResult>(
    target,
    'git.commit',
    { worktree: toRuntimeWorktreeSelector(context.worktreeId), message },
    { timeoutMs: 30_000 }
  )
}

export async function amendRuntimeGitCommit(
  context: RuntimeGitContext,
  message: string | undefined,
  pushTarget?: GitPushTarget
): Promise<GitCommitResult> {
  const target = getActiveRuntimeTarget(context.settings)
  if (target.kind === 'local' || !context.worktreeId) {
    return window.api.git.amendCommit({
      worktreePath: resolveLocalWorktreePath(context),
      ...(message !== undefined ? { message } : {}),
      ...(pushTarget ? { pushTarget } : {}),
      ...(pushTarget && context.worktreeId ? { worktreeId: context.worktreeId } : {}),
      connectionId: context.connectionId
    })
  }
  return callRuntimeRpc<GitCommitResult>(
    target,
    'git.amendCommit',
    {
      worktree: toRuntimeWorktreeSelector(context.worktreeId),
      ...(message !== undefined ? { message } : {}),
      ...(pushTarget ? { pushTarget } : {})
    },
    { timeoutMs: 30_000 }
  )
}
