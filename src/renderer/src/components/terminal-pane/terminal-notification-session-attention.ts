import type { AppState } from '@/store/types'
import { resolveEntrySessionPriority } from '@/store/slices/agent-status/session-attention-transition'
import { agentMainAgentVerdict } from '../../../../shared/agent-main-agent-verdict'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { NotificationSoundCategory } from '../../../../shared/notification-settings-types'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import type { AgentCompletionStatusSnapshot } from './agent-completion-coordinator-types'

export function isStructuredSessionPane(
  state: AppState,
  worktreeId: string,
  paneKey: string | undefined
): boolean {
  const tabId = parsePaneKey(paneKey ?? '')?.tabId
  return (state.unifiedTabsByWorktree?.[worktreeId] ?? []).some(
    (tab) => tab.contentType === 'agent-session' && tab.id === tabId
  )
}

export function resolveAgentSoundCategory(
  status: AgentCompletionStatusSnapshot | AgentStatusEntry | undefined,
  stored: AgentStatusEntry | undefined,
  isStructuredSession: boolean
): NotificationSoundCategory {
  if (
    status?.state === 'waiting' ||
    (status?.state === 'blocked' &&
      (isStructuredSession || Boolean(status.interactivePrompt) || status.requiresInput === true))
  ) {
    return 'needs-input'
  }
  if (status?.state === 'blocked' || (status && agentMainAgentVerdict(status) === 'failure')) {
    return 'failed'
  }
  if (
    status &&
    stored?.agentType === status.agentType &&
    stored?.stateStartedAt === status.stateStartedAt &&
    (stored?.orchestration?.dispatchStatus === 'failed' ||
      stored?.orchestration?.dispatchStatus === 'circuit_broken')
  ) {
    return 'failed'
  }
  return 'done'
}

/** Priority of the session this event reports; a reused pane key must not lend another turn's priority. */
export function resolveNotificationSessionPriority(
  state: AppState,
  args: {
    worktreeId: string
    paneKey: string | undefined
    isStructuredSession: boolean
    storedAgentStatus: AgentStatusEntry | undefined
    eventAgentStatusSnapshot: AgentCompletionStatusSnapshot | undefined
  }
): number {
  const { worktreeId, paneKey, storedAgentStatus, eventAgentStatusSnapshot } = args
  const retainedAgentStatus = paneKey ? state.retainedAgentsByPaneKey[paneKey]?.entry : undefined
  let identityEntry: AgentStatusEntry | undefined
  if (
    args.isStructuredSession &&
    storedAgentStatus?.paneKey === paneKey &&
    storedAgentStatus?.worktreeId === worktreeId &&
    storedAgentStatus?.agentType === eventAgentStatusSnapshot?.agentType
  ) {
    identityEntry = storedAgentStatus
  } else if (eventAgentStatusSnapshot) {
    identityEntry = [storedAgentStatus, retainedAgentStatus].find(
      (entry) =>
        entry?.worktreeId === worktreeId &&
        entry.agentType === eventAgentStatusSnapshot.agentType &&
        (entry.stateStartedAt === eventAgentStatusSnapshot.stateStartedAt ||
          (eventAgentStatusSnapshot.localStateStartedAt !== undefined &&
            entry.stateStartedAt === eventAgentStatusSnapshot.localStateStartedAt))
    )
  } else if (storedAgentStatus?.worktreeId === worktreeId) {
    identityEntry = storedAgentStatus
  }
  return identityEntry ? resolveEntrySessionPriority(state, identityEntry) : 3
}
