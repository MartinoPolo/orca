import type { AppState } from '@/store/types'
import { getConnectionIdFromState } from '@/lib/connection-context'
import { getLocalProjectExecutionRuntimeContext } from '@/lib/local-preflight-context'
import { getRendererAppPlatform } from '@/lib/renderer-app-platform'
import {
  getKnownExecutionHostIdForWorktree,
  getRuntimeEnvironmentIdForWorktree,
  type WorktreeRuntimeOwnerState
} from '@/lib/worktree-runtime-owner'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { ProjectExecutionRuntimeResolution } from '../../../shared/project-execution-runtime'
import { parseWorkspaceKey } from '../../../shared/workspace-scope'
import { isWslUncPath } from '../../../shared/wsl-paths'

export type PiProfileLaunchTarget = 'local-native' | 'non-local' | 'unresolved'

type PiProfileLaunchTargetState = Pick<
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

export function resolvePiProfileLaunchTarget(
  state: PiProfileLaunchTargetState,
  worktreeId: string,
  options: {
    executionHostId?: ExecutionHostId | null
    projectRuntime?: ProjectExecutionRuntimeResolution
    platform?: NodeJS.Platform
  } = {}
): PiProfileLaunchTarget {
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

export function isLocalNativePiProfileTarget(
  state: PiProfileLaunchTargetState,
  worktreeId: string,
  platform: NodeJS.Platform = getRendererAppPlatform()
): boolean {
  return resolvePiProfileLaunchTarget(state, worktreeId, { platform }) === 'local-native'
}
