import type { AppState } from '@/store/types'

type AgentOrchestrationByPaneKey = AppState['runtimeAgentOrchestrationByPaneKey']

/** Store the published orchestration and notify once per observed dispatch failure on a finished agent. */
export async function publishAgentOrchestration(
  state: AppState | undefined,
  nextOrchestration: AgentOrchestrationByPaneKey
): Promise<void> {
  const previousOrchestration = state?.runtimeAgentOrchestrationByPaneKey
  state?.setRuntimeAgentOrchestrationByPaneKey?.(nextOrchestration)
  if (!state) {
    return
  }
  for (const [paneKey, current] of Object.entries(nextOrchestration)) {
    const previous = previousOrchestration?.[paneKey]
    const entry = state.agentStatusByPaneKey[paneKey]
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
      await import('@/components/terminal-pane/use-notification-dispatch')
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
