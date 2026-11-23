import { activityThreadStatusId } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'
import type { ExecutionHostId } from '../../../../../shared/execution-host/execution-host'
import type { SessionAttentionMetadata } from '../../../../../shared/session-attention'
import {
  findSessionAttentionMetadata,
  resolveSessionAttentionIdentity,
  resolveSessionAttentionWorkspaceFallback
} from '@/attention/session-attention-identity'
import {
  isAttentionQueueEligible,
  resolveAttentionStartedAt
} from './session-attention-presentation'
import { DEFAULT_SESSION_PRIORITY } from '../../../../../shared/session-effective-priority'

export type SessionAttentionInputs = {
  metadataByIdentity: Record<string, SessionAttentionMetadata> | undefined
  defaultHostId: ExecutionHostId | undefined
}

/** Adds the session identity, priority, saved marker and attention-queue standing. */
export function withSessionAttention(
  thread: AgentPaneThread,
  { metadataByIdentity, defaultHostId }: SessionAttentionInputs
): AgentPaneThread {
  const entry = thread.currentAgentEntry ?? thread.latestEvent?.entry
  const identity = entry
    ? resolveSessionAttentionIdentity({
        workspaceId: thread.worktree.id,
        agentType: thread.agentType,
        entry,
        terminalTab: thread.tab,
        projectedTab: thread.projectedTab,
        resolveFallbackExecutionHostId: () =>
          resolveSessionAttentionWorkspaceFallback({
            worktree: thread.worktree,
            repo: thread.repo ?? undefined,
            defaultHostId
          })
      })
    : null
  const metadata = identity
    ? findSessionAttentionMetadata(metadataByIdentity ?? {}, identity)
    : undefined
  const savedMarker = metadata?.savedColor
    ? { savedColor: metadata.savedColor, savedAt: metadata.savedAt }
    : null
  const status = activityThreadStatusId(thread)
  const statusStartedAt =
    thread.currentAgentEntry?.stateStartedAt ?? thread.latestEvent?.timestamp ?? null
  const supportsStatusAttention = thread.migrationUnsupportedPtyId === undefined
  const unread = supportsStatusAttention && thread.unread
  return {
    ...thread,
    sessionIdentity: identity?.sessionIdentity ?? null,
    priority: metadata?.priority ?? DEFAULT_SESSION_PRIORITY,
    savedMarker,
    attentionStartedAt: resolveAttentionStartedAt({
      status,
      unread,
      statusStartedAt: metadata?.attentionEpisodeStartedAt ?? statusStartedAt,
      savedAt: savedMarker?.savedAt,
      supportsStatusAttention
    }),
    attentionEligible: isAttentionQueueEligible({
      status,
      unread,
      saved: savedMarker !== null,
      supportsStatusAttention
    })
  }
}
