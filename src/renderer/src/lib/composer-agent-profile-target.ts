import {
  scopeAgentLaunchProfilesToHost,
  type AgentLaunchProfile,
  type AgentProfileHostScope
} from '../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  isProfileAgent,
  PROFILE_AGENTS,
  type AgentProfileSelection
} from '../../../shared/agent-launch-profile-agents'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { TuiAgent } from '../../../shared/tui-agent'
import { getActiveRuntimeTarget } from '@/runtime/runtime-rpc-client'
import { getFolderWorkspaceAgentLaunchPlatform } from '@/components/sidebar/folder-workspace-agent-startup'
import { getNewWorkspaceProjectGroupHostId } from '@/lib/new-workspace-project-options'
import { getLocalHomeDirectory } from '@/lib/agent-profile-launch-target'
import type { ProjectGroup } from '../../../shared/project-group-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { SshConnectionState } from '../../../shared/ssh-types'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

type SshConnectionStates = ReadonlyMap<string, Pick<SshConnectionState, 'remoteHomeDirectory'>>

/** Where a composer launch's profile roots live: this machine, or an SSH host's own home. */
export function resolveComposerProfileHostScope(target: {
  executionHostId: ExecutionHostId | null
  connectionId: string | null | undefined
  runtimeEnvironmentId?: string | null
  launchPlatform: NodeJS.Platform
  ephemeralVmRecipeId?: string | null
  sshConnectionStates: SshConnectionStates | undefined
}): AgentProfileHostScope | null {
  if (target.runtimeEnvironmentId || target.ephemeralVmRecipeId) {
    return null
  }
  const executionHost = parseExecutionHostId(target.executionHostId)
  if (executionHost?.kind === 'local') {
    return !target.connectionId && target.launchPlatform === CLIENT_PLATFORM
      ? { kind: 'local', homeDirectory: getLocalHomeDirectory() }
      : null
  }
  if (executionHost?.kind !== 'ssh' || executionHost.targetId !== target.connectionId) {
    return null
  }
  const homeDirectory = target.sshConnectionStates
    ?.get(executionHost.targetId)
    ?.remoteHomeDirectory?.trim()
  return homeDirectory ? { kind: 'remote', homeDirectory } : null
}

export function resolveFolderComposerProfileHostScope(
  group: ProjectGroup | null,
  sshConnectionStates: SshConnectionStates | undefined
): AgentProfileHostScope | null {
  return group
    ? resolveComposerProfileHostScope({
        executionHostId: getNewWorkspaceProjectGroupHostId(group),
        connectionId: group.connectionId,
        launchPlatform: getFolderWorkspaceAgentLaunchPlatform(group),
        sshConnectionStates
      })
    : null
}

export function resolveComposerRepoProfileHostScope(target: {
  executionHostId: ExecutionHostId | null
  connectionId: string | null | undefined
  settings: Pick<GlobalSettings, 'activeRuntimeEnvironmentId'> | null
  launchPlatform: NodeJS.Platform
  ephemeralVmRecipeId: string | null
  sshConnectionStates: SshConnectionStates | undefined
}): AgentProfileHostScope | null {
  return resolveComposerProfileHostScope({
    ...target,
    runtimeEnvironmentId:
      getActiveRuntimeTarget(target.settings).kind === 'environment'
        ? target.settings?.activeRuntimeEnvironmentId
        : null
  })
}

/** Profiles the composer may offer for a target, with roots resolved on that target's host. */
export function getComposerAgentProfiles(
  settings: Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'> | null | undefined,
  scope: AgentProfileHostScope | null,
  disabledAgents: readonly TuiAgent[] | undefined
): AgentProfileSelection[] {
  if (!scope) {
    return []
  }
  return PROFILE_AGENTS.filter((agent) => !disabledAgents?.includes(agent)).flatMap((agent) =>
    scopeAgentLaunchProfilesToHost(getAgentLaunchProfiles(settings, agent), scope).map(
      (profile) => ({ agent, profile })
    )
  )
}

export function getValidatedComposerAgentProfile(
  agent: TuiAgent | null,
  profile: AgentLaunchProfile | undefined,
  settings: Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'> | null | undefined,
  scope: AgentProfileHostScope | null
): AgentLaunchProfile | undefined {
  if (!profile) {
    return undefined
  }
  const registered =
    agent && isProfileAgent(agent) && scope
      ? scopeAgentLaunchProfilesToHost(getAgentLaunchProfiles(settings, agent), scope).find(
          (candidate) => candidate.id === profile.id
        )
      : undefined
  if (
    !registered ||
    registered.command !== profile.command ||
    registered.agentDirectory !== profile.agentDirectory
  ) {
    const agentLabel =
      agent && isProfileAgent(agent) ? AGENT_LAUNCH_PROFILE_AGENTS[agent].label : 'agent'
    throw new Error(
      `This ${agentLabel} profile is unavailable for the selected workspace target. Choose another target or agent.`
    )
  }
  return registered
}
