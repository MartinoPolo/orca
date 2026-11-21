import { recordDurableCrashBreadcrumb } from '../../crash-reporting/breadcrumbs/durable-crash-breadcrumb'
import type { AgentHookEventPayload } from '../../../shared/agent-hook-listener/listener-event'
import type { EnrichedAgentHookEventPayload } from './server-types'
import { isForeignTurnHook } from './server-foreign-turn-hook'

/** A pane's hooks switching provider sessions explains phantom Done alerts, e.g. a nested `claude -p` inheriting the pane's hook environment. */
function recordAgentHookSessionSwitch(
  previous: EnrichedAgentHookEventPayload | undefined,
  incoming: AgentHookEventPayload
): void {
  const previousSessionId = previous?.providerSession?.id
  const sessionId = incoming.providerSession?.id
  if (!previousSessionId || !sessionId || previousSessionId === sessionId) {
    return
  }
  recordDurableCrashBreadcrumb('agent_hook_session_switch', {
    paneKey: incoming.paneKey,
    agentType: incoming.payload.agentType ?? 'unknown',
    hookEventName: incoming.hookEventName ?? 'unknown',
    state: incoming.payload.state,
    previousState: previous.payload.state,
    previousSessionId,
    sessionId
  })
}

/** Foreign-turn hooks keep the row unchanged; any other hook is checked for a provider session switch. */
export function isForeignTurnHookElseRecordSessionSwitch(
  previous: EnrichedAgentHookEventPayload,
  incoming: AgentHookEventPayload
): boolean {
  if (isForeignTurnHook(previous, incoming)) {
    return true
  }
  recordAgentHookSessionSwitch(previous, incoming)
  return false
}
