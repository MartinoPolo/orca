import type { AgentProfileHostScope } from '../../../../shared/agent-launch-profiles'
import type { AppState } from '@/store/types'
import { getFolderWorkspaceAgentLaunchFact } from '@/components/sidebar/folder-workspace-agent-startup'
import { resolveComposerProfileHostScope } from '@/lib/composer-agent-profile-target'
import { getNewWorkspaceProjectGroupHostId } from '@/lib/new-workspace-project-options'
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
          executionHostId: getNewWorkspaceProjectGroupHostId(group),
          connectionId: group.connectionId,
          runtimeEnvironmentId: state.folderTargetRuntimeEnvironmentId,
          launchHost: getFolderWorkspaceAgentLaunchFact(store, group),
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
