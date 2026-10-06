import {
  resolveTerminalNotificationOwner,
  type TerminalNotificationBinding
} from '@/attention/notification-subject-owner'
import { notificationSourceForOwner } from '../../../../shared/notification-source'
import { useCallback } from 'react'
import { useAppStore } from '@/store'
import { resolveCommittedTitleAgentType } from '@/lib/pane-agent-evidence'
import { resolveEntrySessionPriority } from '@/store/slices/session-attention-transition'
import type { NotificationSoundCategory } from '../../../../shared/notification-settings-types'
import { buildAgentNotificationId } from '../../../../shared/agent-notification-id'
import { agentMainAgentVerdict } from '../../../../shared/agent-main-agent-verdict'
import { shareCompatibleTitleIdentityGroup } from '../../../../shared/agent-title-owner'
import {
  isFreshNonDoneAgentStatus,
  type AgentStatusEntry
} from '../../../../shared/agent-status-types'
import { isSupersededAgentCompletionSnapshot } from './agent-completion-snapshot-staleness'
import type {
  AgentCompletionDispatchMeta,
  AgentCompletionStatusSnapshot
} from './agent-completion-coordinator-types'
import { getNotificationWorkspaceLabels } from './terminal-notification-state'
import { createTerminalAttentionSurface } from './terminal-attention-surface'
import { createStructuredAttentionSurface } from '../native-chat/structured-attention-surface'
import { parsePaneKey } from '../../../../shared/stable-pane-id'
import {
  applyAgentAttention,
  resolveAgentAttention,
  type AgentAttentionDeliveryRequest
} from '@/attention/agent-attention-policy'
import { deliverAgentAttentionNotification } from '@/attention/agent-attention-notification-delivery'

const AGENT_NOTIFICATION_SNAPSHOT_MAX_AGE_MS = 10_000

function resolveAgentSoundCategory(
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

function agentSnapshotMatchesExplicitTitle(
  snapshot: { agentType?: string | null } | undefined,
  explicitTitleAgentType: string | null
): boolean {
  return !snapshot || !explicitTitleAgentType || snapshot.agentType === explicitTitleAgentType
}

function hasFreshActiveHookStatus(
  snapshot: Pick<AgentStatusEntry, 'state' | 'updatedAt' | 'agentType'> | undefined,
  explicitTitleAgentType: string | null
): boolean {
  // Why: pick-a-winner ownership would treat a Pi idle title as a different
  // agent than a live OMP hook. Same-group titles are wrapper frames, not reuse.
  const titleNamesDifferentKnownAgent =
    explicitTitleAgentType &&
    snapshot?.agentType &&
    snapshot.agentType !== 'unknown' &&
    !shareCompatibleTitleIdentityGroup(snapshot.agentType, explicitTitleAgentType)
  return Boolean(isFreshNonDoneAgentStatus(snapshot) && !titleNamesDifferentKnownAgent)
}

export type TerminalNotificationEvent = TerminalNotificationBinding & {
  source: 'terminal-bell' | 'agent-task-complete'
  terminalTitle?: string
  agentStatusSnapshot?: AgentCompletionStatusSnapshot
  agentCompletionSource?: AgentCompletionDispatchMeta['source']
  desktopOnly?: boolean
  soundCategory?: NotificationSoundCategory
}

/**
 * Returns a stable dispatch function for terminal notifications.
 * Reads repo/worktree labels from the store at dispatch time rather
 * than via selectors — avoids the allWorktrees() anti-pattern which
 * creates a new array reference on every store update and triggers
 * excessive re-renders of TerminalPane.
 */
export function dispatchTerminalNotification(
  worktreeId: string,
  event: TerminalNotificationEvent
): void {
  const state = useAppStore.getState()
  // Why: the completion title is the live identity. If it explicitly names an
  // agent, any snapshot from another agent is stale pane-reuse residue and must
  // not lend its prompt/agentType or timing id to this notification.
  const explicitTitleAgentType =
    event.source === 'agent-task-complete' && event.terminalTitle
      ? resolveCommittedTitleAgentType(event.terminalTitle)
      : null
  const storedAgentStatus =
    event.source === 'agent-task-complete' && event.paneKey
      ? state.agentStatusByPaneKey[event.paneKey]
      : undefined
  const eventAgentStatusSnapshot =
    event.source === 'agent-task-complete' &&
    agentSnapshotMatchesExplicitTitle(event.agentStatusSnapshot, explicitTitleAgentType)
      ? event.agentStatusSnapshot
      : undefined
  const freshStoredAgentStatus =
    storedAgentStatus &&
    Date.now() - storedAgentStatus.updatedAt <= AGENT_NOTIFICATION_SNAPSHOT_MAX_AGE_MS &&
    agentSnapshotMatchesExplicitTitle(storedAgentStatus, explicitTitleAgentType)
      ? storedAgentStatus
      : undefined
  if (
    event.source === 'agent-task-complete' &&
    event.agentCompletionSource !== 'process-exit' &&
    !eventAgentStatusSnapshot &&
    hasFreshActiveHookStatus(storedAgentStatus, explicitTitleAgentType)
  ) {
    // Why: a title-only idle signal can race behind active hook state; a
    // confirmed process exit is independent authority that the turn ended.
    return
  }
  // Why: a process can die before its hook emits done; do not label the
  // resulting completion notification with that stale active state or prompt.
  const agentStatus =
    event.source === 'agent-task-complete'
      ? (eventAgentStatusSnapshot ??
        (event.agentCompletionSource === 'process-exit' && freshStoredAgentStatus?.state !== 'done'
          ? undefined
          : freshStoredAgentStatus))
      : undefined
  if (
    event.source === 'agent-task-complete' &&
    isSupersededAgentCompletionSnapshot(storedAgentStatus, eventAgentStatusSnapshot)
  ) {
    return
  }
  const agentNotificationStateStartedAt =
    eventAgentStatusSnapshot?.stateStartedAt ?? freshStoredAgentStatus?.stateStartedAt
  const tabId = parsePaneKey(event.paneKey ?? '')?.tabId
  const isStructuredSession = (state.unifiedTabsByWorktree?.[worktreeId] ?? []).some(
    (tab) => tab.contentType === 'agent-session' && tab.id === tabId
  )
  const soundCategory =
    event.soundCategory ??
    resolveAgentSoundCategory(agentStatus, storedAgentStatus, isStructuredSession)
  const attentionDecision = resolveAgentAttention(
    {
      subject: { workspaceId: worktreeId, surfaceKey: event.paneKey },
      reason: event.source === 'agent-task-complete' ? 'agent-completion' : 'terminal-bell',
      settlesTurn: event.source === 'agent-task-complete',
      // Why: main-process hook IPC can update inactive worktrees before the renderer's live-PTY
      // map catches up. An accepted fresh hook snapshot is authority that the turn ended;
      // title/BEL-only paths still need surface liveness.
      hasFreshActivityEvidence: Boolean(agentStatus),
      groupAttentionEnabled: state.settings?.experimentalTerminalAttention === true
    },
    isStructuredSession
      ? createStructuredAttentionSurface(state)
      : createTerminalAttentionSurface(state)
  )
  if (!attentionDecision.admitted) {
    return
  }

  // Desktop settings are applied in main after independent mobile delivery.

  const retainedAgentStatus = event.paneKey
    ? state.retainedAgentsByPaneKey[event.paneKey]?.entry
    : undefined
  let identityEntry: AgentStatusEntry | undefined
  if (
    isStructuredSession &&
    storedAgentStatus?.paneKey === event.paneKey &&
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
  const priority = identityEntry ? resolveEntrySessionPriority(state, identityEntry) : 3
  // Why: pane keys are reused across turns. A rich OS notification must not
  // expose the previous turn's prompt if the current turn has no fresh hook snapshot yet.
  const agentSnapshot = agentStatus
    ? {
        agentType: agentStatus.agentType,
        agentState: agentStatus.state,
        agentPrompt: agentStatus.prompt,
        agentToolName: agentStatus.toolName,
        agentToolInput: agentStatus.toolInput,
        agentLastAssistantMessage: agentStatus.lastAssistantMessage,
        agentTurnOutcome: agentMainAgentVerdict(agentStatus) ?? undefined
      }
    : {}
  const notificationId =
    event.source === 'agent-task-complete'
      ? buildAgentNotificationId({
          worktreeId,
          paneKey: event.paneKey,
          // Why: delayed hook completions may dispatch after PTY teardown has
          // removed the live row; carry the hook timing so the OS notification
          // still has the same dismissible id as the unread agent event.
          stateStartedAt: agentNotificationStateStartedAt
        })
      : null

  const requestDelivery = (request: AgentAttentionDeliveryRequest): void => {
    deliverAgentAttentionNotification(
      {
        source: event.source,
        ...(event.source === 'agent-task-complete' ? { priority, soundCategory } : {}),
        ...(event.desktopOnly ? { desktopOnly: true } : {}),
        ...(notificationId ? { notificationId } : {}),
        worktreeId: request.workspaceId,
        paneKey: request.subjectKey ?? undefined,
        ...getNotificationWorkspaceLabels(state, request.workspaceId, event.terminalTitle),
        notificationSourceId: notificationSourceForOwner(
          resolveTerminalNotificationOwner(state, worktreeId, event),
          state
        ),
        terminalTitle: event.terminalTitle,
        isActiveWorktree: request.workspaceIsActive,
        ...agentSnapshot
      },
      state.settings?.notifications
    )
  }

  if (event.desktopOnly) {
    requestDelivery(attentionDecision.delivery)
    return
  }

  applyAgentAttention(attentionDecision, {
    unread: {
      markWorkspaceUnread: state.markWorktreeUnread,
      markSubjectUnread: state.markAgentCompletionPaneUnread,
      markGroupUnread: state.markTerminalTabUnread,
      markSurfaceUnread: state.markTerminalPaneUnread
    },
    requestDelivery
  })
}

export function useNotificationDispatch(
  worktreeId: string
): (event: TerminalNotificationEvent) => void {
  return useCallback(
    (event: TerminalNotificationEvent) => dispatchTerminalNotification(worktreeId, event),
    [worktreeId]
  )
}
