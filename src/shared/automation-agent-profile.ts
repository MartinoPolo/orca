import { isProfileAgent } from './agent-launch-profile-agents'
import type { Automation, AutomationUpdateInput } from './automations-types'
import type { TuiAgent } from './tui-agent'

/** Stored form of a launch-profile pick: kept only for an agent with profiles; empty clears it. */
export function storedAutomationAgentProfileId(
  agentId: TuiAgent,
  agentProfileId: string | undefined
): string | undefined {
  const profileId = agentProfileId?.trim()
  return profileId && isProfileAgent(agentId) ? profileId : undefined
}

/** Omitted preserves; empty clears; an agent without profiles drops the pick. */
export function applyAutomationAgentProfileUpdate(
  merged: Automation,
  updates: AutomationUpdateInput,
  current: Automation
): void {
  const agentProfileId = storedAutomationAgentProfileId(
    merged.agentId,
    Object.hasOwn(updates, 'agentProfileId') ? updates.agentProfileId : current.agentProfileId
  )
  if (agentProfileId === undefined) {
    delete merged.agentProfileId
  } else {
    merged.agentProfileId = agentProfileId
  }
}
