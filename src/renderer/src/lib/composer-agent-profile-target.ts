import {
  scopeAgentLaunchProfilesToHost,
  type AgentProfileHostScope
} from '../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  PROFILE_AGENTS,
  type AgentProfileSelection
} from '../../../shared/agent-launch-profile-agents'
import { parseExecutionHostId, type ExecutionHostId } from '../../../shared/execution-host'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { SshConnectionState } from '../../../shared/ssh-types'
import type { TuiAgent } from '../../../shared/tui-agent'
import type { ExecutionHostPlatformFact } from '@/lib/execution-host-facts'
import { getLocalHomeDirectory } from '@/lib/agent-profile-launch-target'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'
import { translate } from '@/i18n/i18n'

type ProfileSettings = Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'>

export type ComposerProfileHostTarget = {
  executionHostId: ExecutionHostId | null | undefined
  connectionId: string | null | undefined
  runtimeEnvironmentId: string | null | undefined
  launchHost: ExecutionHostPlatformFact
  ephemeralVmRecipeId: string | null | undefined
  sshConnectionStates: ReadonlyMap<string, Pick<SshConnectionState, 'remoteHomeDirectory'>>
}

/** Where a composer launch's profile roots live: this machine, or an SSH host's own home. */
export function resolveComposerProfileHostScope(
  target: ComposerProfileHostTarget
): AgentProfileHostScope | null {
  // Runtime-owned, ephemeral VM, and WSL targets never receive this client's account paths.
  if (target.runtimeEnvironmentId?.trim() || target.ephemeralVmRecipeId) {
    return null
  }
  const executionHost = parseExecutionHostId(target.executionHostId)
  if (executionHost?.kind === 'local') {
    return !target.connectionId &&
      target.launchHost.kind === 'known' &&
      target.launchHost.platform === CLIENT_PLATFORM
      ? { kind: 'local', homeDirectory: getLocalHomeDirectory() }
      : null
  }
  if (executionHost?.kind !== 'ssh' || executionHost.targetId !== target.connectionId) {
    return null
  }
  const homeDirectory = target.sshConnectionStates
    .get(executionHost.targetId)
    ?.remoteHomeDirectory?.trim()
  return homeDirectory ? { kind: 'remote', homeDirectory } : null
}

/** Profiles the composer may offer for a target, with roots resolved on that target's host. */
export function getComposerAgentProfiles(
  settings: ProfileSettings | null | undefined,
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

/** Re-reads the pick against current settings so a stale or edited profile never launches. */
export function getValidatedComposerAgentProfile(
  selection: AgentProfileSelection | undefined,
  settings: ProfileSettings | null | undefined,
  scope: AgentProfileHostScope | null
): AgentProfileSelection | undefined {
  if (!selection) {
    return undefined
  }
  const registered = scope
    ? scopeAgentLaunchProfilesToHost(getAgentLaunchProfiles(settings, selection.agent), scope).find(
        (candidate) => candidate.id === selection.profile.id
      )
    : undefined
  if (
    !registered ||
    registered.command !== selection.profile.command ||
    registered.agentDirectory !== selection.profile.agentDirectory
  ) {
    throw new Error(
      translate(
        'settings.agentLaunchProfiles.composerProfileUnavailable',
        'This {{agentLabel}} profile is unavailable for the selected workspace target. Choose another target or agent.',
        { agentLabel: AGENT_LAUNCH_PROFILE_AGENTS[selection.agent].label }
      )
    )
  }
  return { agent: selection.agent, profile: registered }
}

/** A profile launch runs the profile's command in a terminal; the agent itself must not change. */
export function assertComposerProfileAgent(
  selection: AgentProfileSelection | undefined,
  agent: TuiAgent | null
): void {
  if (selection && selection.agent !== agent) {
    throw new Error(
      translate(
        'settings.agentLaunchProfiles.composerProfileAgentChanged',
        'The selected agent is no longer available. Select another agent before creating the workspace.'
      )
    )
  }
}
