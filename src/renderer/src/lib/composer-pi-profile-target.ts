import type { PiLaunchProfile } from '../../../shared/pi-launch-profiles'
import { normalizePiLaunchProfiles } from '../../../shared/pi-launch-profiles'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getFolderWorkspaceAgentLaunchPlatform } from '@/components/sidebar/folder-workspace-agent-startup'
import { getNewWorkspaceProjectGroupHostId } from '@/lib/new-workspace-project-options'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

export function canLaunchComposerPiProfile(target: {
  executionHostId: ExecutionHostId | null
  connectionId: string | null | undefined
  runtimeEnvironmentId?: string | null
  launchPlatform: NodeJS.Platform
  ephemeralVmRecipeId?: string | null
}): boolean {
  return (
    parseExecutionHostId(target.executionHostId)?.kind === 'local' &&
    !target.connectionId &&
    !target.runtimeEnvironmentId &&
    !target.ephemeralVmRecipeId &&
    target.launchPlatform === CLIENT_PLATFORM
  )
}

export function canLaunchFolderComposerPiProfile(group: ProjectGroup | null): boolean {
  return Boolean(
    group &&
    canLaunchComposerPiProfile({
      executionHostId: getNewWorkspaceProjectGroupHostId(group),
      connectionId: group.connectionId,
      launchPlatform: getFolderWorkspaceAgentLaunchPlatform(group)
    })
  )
}

export function getValidatedComposerPiProfile(
  profile: PiLaunchProfile | undefined,
  settings: Pick<GlobalSettings, 'piLaunchProfiles'> | null | undefined,
  allowed: boolean
): PiLaunchProfile | undefined {
  if (!profile) {
    return undefined
  }
  const registered = normalizePiLaunchProfiles(settings?.piLaunchProfiles).find(
    (candidate) => candidate.id === profile.id
  )
  if (
    !allowed ||
    !registered ||
    registered.command !== profile.command ||
    registered.agentDirectory !== profile.agentDirectory
  ) {
    throw new Error(
      'This Pi profile is unavailable for the selected workspace target. Choose a local target or another agent.'
    )
  }
  return registered
}

export function isComposerRepoPiProfileTarget(target: {
  executionHostId: ExecutionHostId | null
  connectionId: string | null | undefined
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
  launchPlatform: NodeJS.Platform
  ephemeralVmRecipeId: string | null
}): boolean {
  return canLaunchComposerPiProfile({
    ...target,
    runtimeEnvironmentId:
      getActiveRuntimeTarget(target.settings).kind === 'environment'
        ? target.settings?.activeRuntimeEnvironmentId
        : null
  })
}
