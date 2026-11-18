import type { AppState } from '@/store/types'

type AgentOrchestrationByPaneKey = AppState['runtimeAgentOrchestrationByPaneKey']

/** Notify once per observed dispatch failure on a finished agent; `state` is the snapshot read before the reply was applied. */
export async function notifyAgentDispatchFailures(
  state: AppState | null | undefined,
  nextOrchestration: AgentOrchestrationByPaneKey | undefined
): Promise<void> {
  if (!state || !nextOrchestration) {
    return
  }
  const previousOrchestration = state.runtimeAgentOrchestrationByPaneKey
  for (const [paneKey, current] of Object.entries(nextOrchestration)) {
    const previous = previousOrchestration?.[paneKey]
    const entry = state.agentStatusByPaneKey.get(paneKey)
    if (
      entry?.state !== 'done' ||
      !entry.worktreeId ||
      !previous ||
      previous.taskId !== current.taskId ||
      previous.dispatchId !== current.dispatchId ||
      (previous.dispatchStatus !== 'dispatched' &&
        previous.dispatchStatus !== 'pending' &&
        previous.dispatchStatus !== 'completed') ||
      (current.dispatchStatus !== 'failed' && current.dispatchStatus !== 'circuit_broken')
    ) {
      continue
    }
    // The notification module reads the store; loading it during terminal-slice construction cycles.
    const { dispatchTerminalNotification } =
      await import('@/components/terminal-pane/notifications/dispatch-terminal-notification')
    dispatchTerminalNotification(entry.worktreeId, {
      source: 'agent-task-complete',
      desktopOnly: true,
      soundCategory: 'failed',
      paneKey,
      terminalTitle: entry.terminalTitle,
      agentStatusSnapshot: {
        state: 'done',
        agentType: entry.agentType,
        prompt: entry.prompt,
        stateStartedAt: entry.stateStartedAt,
        lastAssistantMessage: entry.lastAssistantMessage
      }
    })
  }
}
