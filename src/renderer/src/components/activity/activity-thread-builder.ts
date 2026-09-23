import {
  activityThreadStatusId,
  paneTitleForEntry,
  paneTitleForEvent,
  statusPreviewForEntry
} from './activity-thread-presentation'
import type {
  ActivityEvent,
  ActivityLiveAgentSnapshot,
  AgentPaneThread
} from './activity-thread-types'
import type { ExecutionHostId } from '../../../../shared/execution-host'
import type { SessionAttentionMetadata } from '../../../../shared/session-attention'
import {
  findSessionAttentionMetadata,
  resolveSessionAttentionIdentity,
  resolveSessionAttentionWorkspaceFallback
} from '@/attention/session-attention-identity'
import {
  isAttentionQueueEligible,
  resolveAttentionStartedAt
} from './session-attention-presentation'

/**
 * Caller-owned reuse cache: threads whose derived content is unchanged keep their
 * previous object (and the whole list keeps its array) identity, so memo'd rows and
 * the search-text cache survive unrelated store writes.
 */
export type AgentPaneThreadReuseCache = {
  previousByPaneKey: Map<string, AgentPaneThread>
  previousList: AgentPaneThread[]
}

export function createAgentPaneThreadReuseCache(): AgentPaneThreadReuseCache {
  return { previousByPaneKey: new Map(), previousList: [] }
}

function arrayItemsEqual<T>(a: readonly T[], b: readonly T[]): boolean {
  if (a.length !== b.length) {
    return false
  }
  for (let i = 0; i < a.length; i += 1) {
    if (a[i] !== b[i]) {
      return false
    }
  }
  return true
}

// Why: event and live-snapshot identities are preserved upstream (activity-event-builder
// cache), so identity comparison on the referenced objects is a correct change detector.
function reuseThreadIfEqual(
  previous: AgentPaneThread | undefined,
  next: AgentPaneThread
): AgentPaneThread {
  if (
    previous !== undefined &&
    previous.paneKey === next.paneKey &&
    previous.paneTitle === next.paneTitle &&
    previous.worktree === next.worktree &&
    previous.repo === next.repo &&
    previous.tab === next.tab &&
    previous.projectedTab === next.projectedTab &&
    previous.capturedExecutionHostId === next.capturedExecutionHostId &&
    previous.agentType === next.agentType &&
    previous.currentAgentState === next.currentAgentState &&
    previous.currentAgentEntry === next.currentAgentEntry &&
    previous.responsePreview === next.responsePreview &&
    previous.latestTimestamp === next.latestTimestamp &&
    previous.latestEvent === next.latestEvent &&
    previous.migrationUnsupportedPtyId === next.migrationUnsupportedPtyId &&
    previous.unread === next.unread &&
    previous.sessionIdentity === next.sessionIdentity &&
    previous.priority === next.priority &&
    previous.savedMarker?.savedColor === next.savedMarker?.savedColor &&
    previous.savedMarker?.savedAt === next.savedMarker?.savedAt &&
    previous.attentionStartedAt === next.attentionStartedAt &&
    previous.attentionEligible === next.attentionEligible &&
    arrayItemsEqual(previous.events, next.events)
  ) {
    return previous
  }
  return next
}

export function buildAgentPaneThreads(
  args: {
    events: ActivityEvent[]
    liveAgentByPaneKey: Record<string, ActivityLiveAgentSnapshot>
    sessionAttentionMetadataByIdentity?: Record<string, SessionAttentionMetadata>
    defaultHostId?: ExecutionHostId
    generatedTitlesEnabled?: boolean
  },
  reuseCache?: AgentPaneThreadReuseCache
): AgentPaneThread[] {
  const generatedTitlesEnabled = args.generatedTitlesEnabled === true
  const byPaneKey = new Map<string, AgentPaneThread>()
  for (const event of args.events) {
    const paneKey = event.entry.paneKey
    const existing = byPaneKey.get(paneKey)
    if (!existing) {
      byPaneKey.set(paneKey, {
        paneKey,
        paneTitle: paneTitleForEvent(event, generatedTitlesEnabled),
        worktree: event.worktree,
        repo: event.repo,
        tab: event.tab,
        projectedTab: event.projectedTab,
        capturedExecutionHostId: event.capturedExecutionHostId,
        agentType: event.agentType,
        currentAgentState: null,
        currentAgentEntry: null,
        responsePreview: statusPreviewForEntry(event.entry, event.state),
        latestTimestamp: event.timestamp,
        latestEvent: event,
        events: [event],
        migrationUnsupportedPtyId: event.migrationUnsupportedPtyId,
        unread: event.unread,
        sessionIdentity: null,
        priority: 3,
        savedMarker: null,
        attentionStartedAt: null,
        attentionEligible: false
      })
      continue
    }
    existing.events.push(event)
    existing.unread = existing.unread || event.unread
    existing.migrationUnsupportedPtyId =
      existing.migrationUnsupportedPtyId ?? event.migrationUnsupportedPtyId
    if (!existing.latestEvent || event.timestamp > existing.latestEvent.timestamp) {
      existing.latestEvent = event
      existing.paneTitle = paneTitleForEvent(event, generatedTitlesEnabled)
      existing.agentType = event.agentType
      existing.tab = event.tab
      existing.projectedTab = event.projectedTab
      existing.capturedExecutionHostId = event.capturedExecutionHostId
      existing.responsePreview = statusPreviewForEntry(
        event.entry,
        event.state,
        existing.responsePreview
      )
      existing.latestTimestamp = event.timestamp
    }
  }

  for (const [paneKey, liveAgent] of Object.entries(args.liveAgentByPaneKey)) {
    const existing = byPaneKey.get(paneKey)
    if (!existing) {
      byPaneKey.set(paneKey, {
        paneKey,
        paneTitle: paneTitleForEntry(liveAgent.entry, liveAgent.tab, generatedTitlesEnabled),
        worktree: liveAgent.worktree,
        repo: liveAgent.repo,
        tab: liveAgent.tab,
        projectedTab: liveAgent.projectedTab,
        capturedExecutionHostId: liveAgent.capturedExecutionHostId,
        agentType: liveAgent.agentType,
        currentAgentState: liveAgent.state,
        currentAgentEntry: liveAgent.entry,
        responsePreview: statusPreviewForEntry(liveAgent.entry, liveAgent.entry.state),
        latestTimestamp: liveAgent.timestamp,
        latestEvent: null,
        events: [],
        unread: false,
        sessionIdentity: null,
        priority: 3,
        savedMarker: null,
        attentionStartedAt: null,
        attentionEligible: false
      })
      continue
    }
    // Why: row title/time/target must follow the active turn (not historical events) so a running agent never shows the previous prompt as primary.
    existing.paneTitle = paneTitleForEntry(liveAgent.entry, liveAgent.tab, generatedTitlesEnabled)
    existing.worktree = liveAgent.worktree
    existing.repo = liveAgent.repo
    existing.tab = liveAgent.tab
    existing.projectedTab = liveAgent.projectedTab
    existing.capturedExecutionHostId = liveAgent.capturedExecutionHostId
    existing.agentType = liveAgent.agentType
    existing.currentAgentState = liveAgent.state
    existing.currentAgentEntry = liveAgent.entry
    existing.responsePreview = statusPreviewForEntry(
      liveAgent.entry,
      liveAgent.entry.state,
      existing.responsePreview
    )
    existing.latestTimestamp = liveAgent.timestamp
  }

  const built = Array.from(byPaneKey.values())
    .map((thread) => {
      const entry = thread.currentAgentEntry ?? thread.latestEvent?.entry
      const identity = entry
        ? resolveSessionAttentionIdentity({
            workspaceId: thread.worktree.id,
            agentType: thread.agentType,
            entry,
            terminalTab: thread.tab,
            projectedTab: thread.projectedTab,
            capturedExecutionHostId: thread.capturedExecutionHostId,
            resolveFallbackExecutionHostId: () =>
              resolveSessionAttentionWorkspaceFallback({
                worktree: thread.worktree,
                repo: thread.repo ?? undefined,
                defaultHostId: args.defaultHostId
              })
          })
        : null
      const sessionIdentity = identity?.sessionIdentity ?? null
      const metadata = identity
        ? findSessionAttentionMetadata(args.sessionAttentionMetadataByIdentity ?? {}, identity)
        : undefined
      const savedMarker = metadata?.savedColor
        ? { savedColor: metadata.savedColor, savedAt: metadata.savedAt }
        : null
      const nextWithEvents: AgentPaneThread = {
        ...thread,
        events: [...thread.events].sort((a, b) => b.timestamp - a.timestamp),
        sessionIdentity,
        priority: metadata?.priority ?? 3,
        savedMarker,
        attentionStartedAt: null,
        attentionEligible: false
      }
      const status = activityThreadStatusId(nextWithEvents)
      const statusStartedAt =
        nextWithEvents.currentAgentEntry?.stateStartedAt ??
        nextWithEvents.latestEvent?.timestamp ??
        null
      const supportsStatusAttention = nextWithEvents.migrationUnsupportedPtyId === undefined
      const next: AgentPaneThread = {
        ...nextWithEvents,
        attentionStartedAt: resolveAttentionStartedAt({
          status,
          unread: supportsStatusAttention && nextWithEvents.unread,
          statusStartedAt: metadata?.attentionEpisodeStartedAt ?? statusStartedAt,
          savedAt: savedMarker?.savedAt,
          supportsStatusAttention
        }),
        attentionEligible: isAttentionQueueEligible({
          status,
          unread: supportsStatusAttention && nextWithEvents.unread,
          saved: savedMarker !== null,
          supportsStatusAttention
        })
      }
      return reuseThreadIfEqual(reuseCache?.previousByPaneKey.get(thread.paneKey), next)
    })
    .sort((a, b) => b.latestTimestamp - a.latestTimestamp)

  if (!reuseCache) {
    return built
  }
  // Why: keep the list's array identity too, so downstream memos keyed on the list bail out.
  const result = arrayItemsEqual(reuseCache.previousList, built) ? reuseCache.previousList : built
  reuseCache.previousList = result
  reuseCache.previousByPaneKey = new Map(result.map((thread) => [thread.paneKey, thread]))
  return result
}
