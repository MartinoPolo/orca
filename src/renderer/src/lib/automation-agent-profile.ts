import type { AppState } from '@/store/types'
import type { Automation } from '../../../shared/automations-types'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import type { AgentStartupPlanInputs } from '../../../shared/agent-startup-plan-inputs'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  isProfileAgent
} from '../../../shared/agent-launch-profile-agents'
import { resolveTuiAgentLaunchEnv } from '../../../shared/tui-agent-launch-defaults'
import type { TuiAgent } from '../../../shared/tui-agent'
import { resolveAgentProfileLaunchInputs } from '@/lib/agent-profile-launch-inputs'
import { CLIENT_PLATFORM } from '@/lib/new-workspace'

/** The saved profile a run launches with. A deleted profile fails the run: falling back to the
 *  configured command would silently bill another account. */
export function resolveAutomationAgentProfile(
  settings: Parameters<typeof getAgentLaunchProfiles>[0],
  automation: Pick<Automation, 'agentId' | 'agentProfileId'>
): AgentLaunchProfile | undefined {
  if (!automation.agentProfileId || !isProfileAgent(automation.agentId)) {
    return undefined
  }
  const profile = getAgentLaunchProfiles(settings, automation.agentId).find(
    (entry) => entry.id === automation.agentProfileId
  )
  if (!profile) {
    throw new Error('The launch profile selected for this automation no longer exists.')
  }
  return profile
}

/** Applies a profile to a background launch on its workspace host; refuses rather than falling back. */
export function applyBackgroundLaunchProfile(args: {
  planInputs: AgentStartupPlanInputs
  profile: AgentLaunchProfile | undefined
  state: AppState
  worktreeId: string
  launchPlatform: NodeJS.Platform
}): AgentStartupPlanInputs {
  if (!args.profile) {
    return args.planInputs
  }
  const profileInputs = resolveAgentProfileLaunchInputs({
    agent: args.planInputs.agent,
    profile: args.profile,
    state: args.state,
    worktreeId: args.worktreeId,
    resolvedLaunchPlatform: args.launchPlatform,
    clientPlatform: CLIENT_PLATFORM,
    commandOverrides: args.planInputs.cmdOverrides,
    environment: args.planInputs.agentEnv
  })
  if (!profileInputs.ok) {
    throw new Error(
      `Launch profile "${args.profile.name}" is not available on this workspace's host.`
    )
  }
  return {
    ...args.planInputs,
    cmdOverrides: profileInputs.commandOverrides,
    agentEnv: profileInputs.environment
  }
}

export type AutomationLaunchAccount = { environmentName: string; directory: string | undefined }

/** The account root a fresh launch would use, so reuse never continues another account's pane.
 *  Null when the profile cannot launch on this host; the fresh launch then reports why. */
export function resolveAutomationLaunchAccount(args: {
  state: AppState
  agent: TuiAgent
  worktreeId: string
  profile: AgentLaunchProfile | undefined
}): AutomationLaunchAccount | undefined | null {
  if (!isProfileAgent(args.agent)) {
    return undefined
  }
  const profileInputs = resolveAgentProfileLaunchInputs({
    agent: args.agent,
    profile: args.profile,
    state: args.state,
    worktreeId: args.worktreeId,
    resolvedLaunchPlatform: CLIENT_PLATFORM,
    clientPlatform: CLIENT_PLATFORM,
    commandOverrides: {},
    environment: resolveTuiAgentLaunchEnv(args.agent, args.state.settings)
  })
  if (!profileInputs.ok) {
    return null
  }
  const environmentName = AGENT_LAUNCH_PROFILE_AGENTS[args.agent].accountEnvironmentName
  return { environmentName, directory: profileInputs.environment[environmentName] }
}
