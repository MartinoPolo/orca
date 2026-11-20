import type { AppState } from '@/store/types'
import { resolveEntrySessionPriority } from '@/store/slices/agent-status/session-attention-transition'
import { resolveNotificationEffectivePriority } from '@/attention/notification-session-priority'
import { agentMainAgentVerdict } from '../../../../shared/agent-status/lifecycle/agent-main-agent-verdict'
import type { AgentStatusEntry } from '../../../../shared/agent-status/contracts/agent-status-types'
import type { NotificationSoundCategory } from '../../../../shared/notifications/notification-settings-types'
import { DEFAULT_SESSION_PRIORITY } from '../../../../shared/session-effective-priority'
import { parsePaneKey } from '../../../../shared/workspace-layout/stable-pane-id'
import type { AgentCompletionStatusSnapshot } from './agent-completion/agent-completion-coordinator-types'

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

/** Effective priority of the session this event reports; a reused pane key must not lend another turn's priority. */
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
  let identityEntry: AgentStatusEntry | undefined
  if (
    args.isStructuredSession &&
    storedAgentStatus?.paneKey === paneKey &&
    storedAgentStatus?.worktreeId === worktreeId &&
    storedAgentStatus?.agentType === eventAgentStatusSnapshot?.agentType
  ) {
    identityEntry = storedAgentStatus
  } else if (eventAgentStatusSnapshot) {
    identityEntry =
      storedAgentStatus?.worktreeId === worktreeId &&
      storedAgentStatus.agentType === eventAgentStatusSnapshot.agentType &&
      (storedAgentStatus.stateStartedAt === eventAgentStatusSnapshot.stateStartedAt ||
        (eventAgentStatusSnapshot.localStateStartedAt !== undefined &&
          storedAgentStatus.stateStartedAt === eventAgentStatusSnapshot.localStateStartedAt))
        ? storedAgentStatus
        : undefined
  } else if (storedAgentStatus?.worktreeId === worktreeId) {
    identityEntry = storedAgentStatus
  }
  return resolveNotificationEffectivePriority(
    state,
    worktreeId,
    identityEntry ? resolveEntrySessionPriority(state, identityEntry) : DEFAULT_SESSION_PRIORITY
  )
}
