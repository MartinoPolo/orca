import type { AgentLaunchPreferences } from './agent-session-host-authority'
import { isProfileAgent } from './agent-launch-profile-agents'
import { getAgentSessionOptionCatalog } from './agent-session-option-catalog'
import type { TuiAgent } from './tui-agent'

export type AutomationAgentLaunchSelection = {
  /** Named launch profile (account) of a profile agent, resolved from the dispatching client's
   *  settings; absent launches the agent's configured command. */
  agentProfileId?: string | null
  /** Model and effort the run launches with; absent leaves both to the agent's own config. */
  launchPreferences?: AgentLaunchPreferences | null
}

/** Keeps only the account and model picks the record's agent can launch with. Effort is a
 *  per-model option, so it is dropped without a model. */
export function normalizeAutomationAgentLaunch<
  AutomationRecord extends AutomationAgentLaunchSelection & { agentId: TuiAgent }
>(
  automation: AutomationRecord
): Omit<AutomationRecord, keyof AutomationAgentLaunchSelection> & AutomationAgentLaunchSelection {
  const { agentProfileId, launchPreferences, ...rest } = automation
  const profileId = isProfileAgent(automation.agentId) ? agentProfileId?.trim() : undefined
  const model = getAgentSessionOptionCatalog(automation.agentId)?.modelApply.launchArgs
    ? launchPreferences?.model?.trim()
    : undefined
  const effort = model ? launchPreferences?.effort?.trim() : undefined
  return {
    ...rest,
    ...(profileId ? { agentProfileId: profileId } : {}),
    ...(model ? { launchPreferences: { model, ...(effort ? { effort } : {}) } } : {})
  }
}
