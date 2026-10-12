import type { Automation } from '../../../shared/automations-types'
import type { GlobalSettings } from '../../../shared/global-settings-types'
import type { AgentLaunchProfile } from '../../../shared/agent-launch-profiles'
import { getAgentLaunchProfiles, isProfileAgent } from '../../../shared/agent-launch-profile-agents'
import { toAgentSessionOptions } from '../../../shared/agent-launch-preferences'

export type AutomationAgentLaunchInputs = {
  agentLaunchProfile?: AgentLaunchProfile
  sessionOptions?: Record<string, string>
}

/** The account and model picks a run launches with. A missing profile fails the run: falling back
 *  to the default command would silently bill another account. */
export function resolveAutomationAgentLaunchInputs(
  settings: Pick<GlobalSettings, 'piLaunchProfiles' | 'claudeLaunchProfiles'> | null | undefined,
  automation: Pick<Automation, 'agentId' | 'agentProfileId' | 'launchPreferences'>
): AutomationAgentLaunchInputs {
  const sessionOptions = toAgentSessionOptions(automation.launchPreferences)
  const inputs: AutomationAgentLaunchInputs = sessionOptions ? { sessionOptions } : {}
  if (!automation.agentProfileId || !isProfileAgent(automation.agentId)) {
    return inputs
  }
  const agentLaunchProfile = getAgentLaunchProfiles(settings, automation.agentId).find(
    (profile) => profile.id === automation.agentProfileId
  )
  if (!agentLaunchProfile) {
    throw new Error('The launch profile selected for this automation no longer exists.')
  }
  return { ...inputs, agentLaunchProfile }
}
