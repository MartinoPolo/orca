import { useMemo } from 'react'
import type { AgentProfileHostScope } from '../../../../shared/agent-launch-profiles'
import type { AppState } from '@/store/types'
import { getFolderWorkspaceAgentLaunchFact } from '@/components/sidebar/workspace-creation/folder/folder-workspace-agent-startup'
import { resolveComposerProfileHostScope } from '@/lib/composer-agent-profile-target'
import { readRuntimeStatuses } from '@/store/slices/runtime-status/views/runtime-status-owner'
import { getRepoExecutionHostId } from '../../../../shared/execution-host/execution-host'
import type { ComposerModel } from './composer-model'

export type ComposerProfileScopeState = Pick<
  ComposerModel,
  | 'ephemeralVmsEnabled'
  | 'folderTargetRuntimeEnvironmentId'
  | 'isProjectGroupTarget'
  | 'selectedEphemeralVmRecipeId'
  | 'selectedProjectGroup'
  | 'selectedRepo'
  | 'selectedRepoAgentLaunchFact'
  | 'selectedRepoExecutionHostId'
  | 'selectedRepoRuntimeEnvironmentId'
  | 'selectedWorkspaceTarget'
>

type ProfileScopeStore = Pick<
  AppState,
  'sshConnectionStates' | 'sshStateByEnvironment' | 'runtimeStatusByEnvironmentId'
>

/** The host whose account roots the composer's submit would launch against, as submit resolves it. */
export function resolveComposerAgentProfileHostScope(
  state: ComposerProfileScopeState,
  store: ProfileScopeStore
): AgentProfileHostScope | null {
  if (state.isProjectGroupTarget) {
    const group = state.selectedProjectGroup
    return group
      ? resolveComposerProfileHostScope({
          executionHostId: getRepoExecutionHostId(group),
          connectionId: group.connectionId,
          runtimeEnvironmentId: state.folderTargetRuntimeEnvironmentId,
          launchHost: getFolderWorkspaceAgentLaunchFact(store, readRuntimeStatuses(), group),
          ephemeralVmRecipeId: null,
          sshConnectionStates: store.sshConnectionStates
        })
      : null
  }
  if (!state.selectedRepo) {
    return null
  }
  return resolveComposerProfileHostScope({
    executionHostId:
      state.selectedWorkspaceTarget.status === 'ready'
        ? state.selectedWorkspaceTarget.target.hostId
        : state.selectedRepoExecutionHostId,
    connectionId: state.selectedRepo.connectionId,
    runtimeEnvironmentId: state.selectedRepoRuntimeEnvironmentId,
    launchHost: state.selectedRepoAgentLaunchFact,
    ephemeralVmRecipeId: state.ephemeralVmsEnabled ? state.selectedEphemeralVmRecipeId : null,
    sshConnectionStates: store.sshConnectionStates
  })
}

/** Keeps submit callbacks stable while carrying every input the profile host scope reads. */
export function useComposerProfileScopeState(
  state: ComposerProfileScopeState
): ComposerProfileScopeState {
  const {
    ephemeralVmsEnabled,
    folderTargetRuntimeEnvironmentId,
    isProjectGroupTarget,
    selectedEphemeralVmRecipeId,
    selectedProjectGroup,
    selectedRepo,
    selectedRepoAgentLaunchFact,
    selectedRepoExecutionHostId,
    selectedRepoRuntimeEnvironmentId,
    selectedWorkspaceTarget
  } = state
  return useMemo(
    () => ({
      ephemeralVmsEnabled,
      folderTargetRuntimeEnvironmentId,
      isProjectGroupTarget,
      selectedEphemeralVmRecipeId,
      selectedProjectGroup,
      selectedRepo,
      selectedRepoAgentLaunchFact,
      selectedRepoExecutionHostId,
      selectedRepoRuntimeEnvironmentId,
      selectedWorkspaceTarget
    }),
    [
      ephemeralVmsEnabled,
      folderTargetRuntimeEnvironmentId,
      isProjectGroupTarget,
      selectedEphemeralVmRecipeId,
      selectedProjectGroup,
      selectedRepo,
      selectedRepoAgentLaunchFact,
      selectedRepoExecutionHostId,
      selectedRepoRuntimeEnvironmentId,
      selectedWorkspaceTarget
    ]
  )
}
