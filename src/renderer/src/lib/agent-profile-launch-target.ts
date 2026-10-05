import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import {
  getKnownExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '@/lib/worktree-runtime-owner'
import type { AgentProfileHostScope } from '../../../shared/agent-launch-profiles'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { isWslUncPath } from '../../../shared/wsl-paths'

export type AgentProfileLaunchTarget = 'local-native' | 'non-local' | 'unresolved'

type AgentProfileLaunchTargetState = Pick<
  AppState,
  | 'activeRepoId'
  | 'activeWorktreeId'
  | 'folderWorkspaces'
  | 'projectGroups'
  | 'projects'
  | 'repos'
  | 'settings'
  | 'worktreesByRepo'
> &
  Parameters<typeof getConnectionIdFromState>[0] &
  WorktreeRuntimeOwnerState

export function resolveAgentProfileLaunchTarget(
  state: AgentProfileLaunchTargetState,
  worktreeId: string,
  options: {
    executionHostId?: ExecutionHostId | null
    projectRuntime?: ProjectExecutionRuntimeResolution
    platform?: NodeJS.Platform
  } = {}
): AgentProfileLaunchTarget {
  const executionHost =
    parseExecutionHostId(options.executionHostId) ??
    parseExecutionHostId(getKnownExecutionHostIdForWorktree(state, worktreeId))
  if (!executionHost) {
    return 'unresolved'
  }
  if (executionHost.kind !== 'local') {
    return 'non-local'
  }

  const connectionId = getConnectionIdFromState(state, worktreeId)
  if (connectionId === undefined) {
    return 'unresolved'
  }
  if (connectionId !== null || getRuntimeEnvironmentIdForWorktree(state, worktreeId)) {
    return 'non-local'
  }

  const platform = options.platform ?? getRendererAppPlatform()
  const workspaceKey = parseWorkspaceKey(worktreeId)
  if (workspaceKey?.type === 'folder') {
    const folder = state.folderWorkspaces.find(
      (candidate) => candidate.id === workspaceKey.folderWorkspaceId
    )
    if (!folder) {
      return 'unresolved'
    }
    return platform === 'win32' && isWslUncPath(folder.folderPath) ? 'non-local' : 'local-native'
  }

  const runtime =
    options.projectRuntime ?? getLocalProjectExecutionRuntimeContext(state, worktreeId, platform)
  if (!runtime) {
    return 'local-native'
  }
  const runtimeKind =
    runtime.status === 'resolved' ? runtime.runtime.kind : runtime.repair.preferredRuntime.kind
  return runtimeKind === 'wsl' ? 'non-local' : 'local-native'
}

export type AgentProfileHostScopeResolution =
  | {
      status: 'resolved'
      scope: AgentProfileHostScope
      /** Connection id a resume origin must name before a profile may be selected for it. */
      profileOriginConnectionId: string | null
    }
  | { status: 'unsupported' }
  | { status: 'owner-unresolved' }
  | { status: 'remote-home-unknown' }

export type AgentProfileHostScopeState = AgentProfileLaunchTargetState &
  Partial<Pick<AppState, 'sshConnectionStates'>>

/** Which machine's account roots apply; profiles reach SSH hosts but never WSL or runtimes. */
export function resolveAgentProfileHostScope(
  state: AgentProfileHostScopeState,
  worktreeId: string,
  options: Parameters<typeof resolveAgentProfileLaunchTarget>[2] = {}
): AgentProfileHostScopeResolution {
  const target = resolveAgentProfileLaunchTarget(state, worktreeId, options)
  if (target === 'unresolved') {
    return { status: 'owner-unresolved' }
  }
  if (target === 'local-native') {
    return {
      status: 'resolved',
      scope: { kind: 'local', homeDirectory: getLocalHomeDirectory() },
      profileOriginConnectionId: null
    }
  }
  const sshTargetId = getSshTargetIdForWorktree(state, worktreeId, options.executionHostId)
  if (!sshTargetId) {
    return { status: 'unsupported' }
  }
  const homeDirectory = state.sshConnectionStates?.get(sshTargetId)?.remoteHomeDirectory?.trim()
  if (!homeDirectory) {
    return { status: 'remote-home-unknown' }
  }
  return {
    status: 'resolved',
    scope: { kind: 'remote', homeDirectory },
    profileOriginConnectionId: sshTargetId
  }
}

function getSshTargetIdForWorktree(
  state: AgentProfileLaunchTargetState,
  worktreeId: string,
  executionHostId: ExecutionHostId | null | undefined
): string | null {
  if (getRuntimeEnvironmentIdForWorktree(state, worktreeId)) {
    return null
  }
  const executionHost =
    parseExecutionHostId(executionHostId) ??
    parseExecutionHostId(getKnownExecutionHostIdForWorktree(state, worktreeId))
  if (executionHost?.kind !== 'ssh') {
    return null
  }
  const connectionId = getConnectionIdFromState(state, worktreeId)
  return connectionId && connectionId === executionHost.targetId ? connectionId : null
}

export function getLocalHomeDirectory(): string | undefined {
  try {
    return window.api.platform.get().homeDirectory
  } catch {
    return undefined
  }
}
