import type { Automation } from '../../../shared/automations/automation-definition'
import type { AutomationRun } from '../../../shared/automations/history/automation-run'
import type { GlobalSettings } from '../../../shared/settings/global-settings-types'
import {
  normalizeAgentAccountPath,
  type AgentLaunchProfile
} from '../../../shared/agent-launch-profiles'
import {
  AGENT_LAUNCH_PROFILE_AGENTS,
  getAgentLaunchProfiles,
  isProfileAgent,
  type ProfileAgent
} from '../../../shared/agent-launch-profile-agents'
import type { OrcaRuntimeService } from '../../runtime/orca-runtime'

export type AutomationLaunchProfileSettings = Partial<
  Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'>
>

/** The account a run launches under: its pinned profile, else the agent's built-in account. */
type AutomationLaunchAccount = {
  agent: ProfileAgent
  profile: AgentLaunchProfile | undefined
  /** Every configured profile of the agent, so an unpinned run never continues a profile's pane. */
  profiles: readonly AgentLaunchProfile[]
}

/**
 * Null settings mean a host without desktop client settings (headless or paired server). A pin
 * that cannot launch fails the run: falling back to the built-in account would bill another one.
 */
export function resolveAutomationLaunchAccount(
  automation: Pick<Automation, 'agentId' | 'agentProfileId' | 'surface'>,
  settings: AutomationLaunchProfileSettings | null
): AutomationLaunchAccount | undefined {
  const agent = automation.agentId
  if (!isProfileAgent(agent)) {
    return undefined
  }
  const profiles = getAgentLaunchProfiles(settings, agent)
  if (!automation.agentProfileId) {
    return { agent, profile: undefined, profiles }
  }
  if (!settings) {
    throw new Error(
      'This automation pins a launch profile, which only the Orca desktop app can launch.'
    )
  }
  if (automation.surface === 'chat') {
    throw new Error(
      'Launch profiles run only in a terminal. Switch this automation to Terminal or use the default account.'
    )
  }
  const profile = profiles.find((entry) => entry.id === automation.agentProfileId)
  if (!profile) {
    throw new Error('The launch profile selected for this automation no longer exists.')
  }
  return { agent, profile, profiles }
}

/** The profile a terminal run launches with, and the earlier runs whose panes it may reuse. */
export function resolveAutomationTerminalLaunchAccount<
  Run extends Pick<AutomationRun, 'terminalPaneKey'>
>(
  runtime: Pick<OrcaRuntimeService, 'getTerminalLaunchEnvironmentForPaneKey'>,
  automation: Pick<Automation, 'agentId' | 'agentProfileId' | 'surface'>,
  runs: readonly Run[],
  settings: AutomationLaunchProfileSettings | null
): { runs: readonly Run[]; launchProfile?: AgentLaunchProfile } {
  const account = resolveAutomationLaunchAccount(automation, settings)
  if (!account) {
    return { runs }
  }
  // A pane keeps the account it launched with, so reuse never continues another account's session.
  const reusableRuns = runs.filter(
    (run) =>
      !run.terminalPaneKey ||
      paneRunsLaunchAccount(
        account,
        runtime.getTerminalLaunchEnvironmentForPaneKey(run.terminalPaneKey)?.agentEnv
      )
  )
  return { runs: reusableRuns, ...(account.profile ? { launchProfile: account.profile } : {}) }
}

function paneRunsLaunchAccount(
  account: AutomationLaunchAccount,
  paneAgentEnv: Readonly<Record<string, string>> | undefined
): boolean {
  const accountRoot =
    paneAgentEnv?.[AGENT_LAUNCH_PROFILE_AGENTS[account.agent].accountEnvironmentName]
  const paneRoot = accountRoot ? normalizeAgentAccountPath(accountRoot) : undefined
  const profileRootMatches = (profile: AgentLaunchProfile): boolean =>
    paneRoot === normalizeAgentAccountPath(profile.agentDirectory)
  // An unrecorded or unpinned root can only be the built-in account, which may still be routed.
  return account.profile
    ? profileRootMatches(account.profile)
    : paneRoot === undefined || !account.profiles.some(profileRootMatches)
}
