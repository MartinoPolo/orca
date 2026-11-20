import type { AgentListStatus } from '../../../../../shared/agent-status/presentation/agent-list-status'
import type { AgentPaneThread } from './activity-thread-types'
import { activityThreadStatusId } from './activity-thread-presentation'
import { resolveEffectiveSessionPriority } from '../../../../../shared/session-effective-priority'

export type SessionAttentionTone = 'input' | 'outcome' | 'done' | null

export function isAttentionQueueEligible({
  status,
  unread,
  saved,
  supportsStatusAttention = true
}: {
  status: AgentListStatus
  unread: boolean
  saved: boolean
  supportsStatusAttention?: boolean
}): boolean {
  if (!supportsStatusAttention) {
    return saved
  }
  return (
    saved ||
    status === 'waiting' ||
    status === 'blocked' ||
    status === 'permission' ||
    status === 'failed' ||
    (unread && (status === 'done' || status === 'interrupted'))
  )
}

export function sessionAttentionTone({
  status,
  unread
}: {
  status: AgentListStatus
  unread: boolean
}): SessionAttentionTone {
  if (status === 'waiting' || status === 'permission') {
    return 'input'
  }
  if (status === 'blocked' || status === 'failed') {
    return 'outcome'
  }
  if (unread && status === 'interrupted') {
    return 'outcome'
  }
  if (unread && status === 'done') {
    return 'done'
  }
  return null
}

export function resolveAttentionStartedAt({
  status,
  unread,
  statusStartedAt,
  savedAt,
  supportsStatusAttention = true
}: {
  status: AgentListStatus
  unread: boolean
  statusStartedAt: number | null
  savedAt?: number
  supportsStatusAttention?: boolean
}): number | null {
  const qualifyingTimes: number[] = []
  if (
    supportsStatusAttention &&
    (status === 'waiting' ||
      status === 'blocked' ||
      status === 'permission' ||
      status === 'failed' ||
      (unread && (status === 'done' || status === 'interrupted')))
  ) {
    if (statusStartedAt !== null && Number.isFinite(statusStartedAt) && statusStartedAt > 0) {
      qualifyingTimes.push(statusStartedAt)
    }
  }
  if (savedAt !== undefined && Number.isFinite(savedAt) && savedAt > 0) {
    qualifyingTimes.push(savedAt)
  }
  return qualifyingTimes.length > 0 ? Math.min(...qualifyingTimes) : null
}

// Unique ranks keep header-free tiers deterministic: unread completion is news ahead of an interruption, read completion follows unconfirmed turns.
const ACTIVITY_STATE_RANK = {
  waiting: 0,
  blocked: 1,
  permission: 2,
  failed: 3,
  'unread-done': 4,
  interrupted: 5,
  unconfirmed: 6,
  done: 7,
  working: 8,
  monitoring: 9,
  unverifiable: 10,
  idle: 11
} as const satisfies Record<AgentListStatus | 'unread-done', number>

const NEEDS_YOU_STATUSES: ReadonlySet<AgentListStatus> = new Set([
  'waiting',
  'blocked',
  'permission',
  'failed'
])

function activityThreadEffectivePriority(
  thread: AgentPaneThread,
  workProjectPriorityRaised: boolean
): number {
  return resolveEffectiveSessionPriority({
    priority: thread.priority,
    workProject: thread.repo?.workProject,
    workProjectPriorityRaised
  })
}

type ActivityThreadSortKey = {
  thread: AgentPaneThread
  stateRank: number
  needsYou: boolean
  effectivePriority: number
}

function activityThreadSortKey(
  thread: AgentPaneThread,
  workProjectPriorityRaised: boolean
): ActivityThreadSortKey {
  const status: AgentListStatus =
    thread.migrationUnsupportedPtyId === undefined ? activityThreadStatusId(thread) : 'idle'
  return {
    thread,
    stateRank:
      status === 'done' && thread.unread
        ? ACTIVITY_STATE_RANK['unread-done']
        : ACTIVITY_STATE_RANK[status],
    needsYou: NEEDS_YOU_STATUSES.has(status),
    effectivePriority: activityThreadEffectivePriority(thread, workProjectPriorityRaised)
  }
}

function compareActivityThreadSortKeys(
  left: ActivityThreadSortKey,
  right: ActivityThreadSortKey
): number {
  if (left.stateRank !== right.stateRank) {
    return left.stateRank - right.stateRank
  }
  if (left.effectivePriority !== right.effectivePriority) {
    return right.effectivePriority - left.effectivePriority
  }
  if (left.thread.unread !== right.thread.unread) {
    return left.thread.unread ? -1 : 1
  }
  if (left.needsYou) {
    // Needs-you rows queue by how long they have waited; quieter states lead with fresh activity.
    const leftStartedAt = left.thread.attentionStartedAt ?? Number.POSITIVE_INFINITY
    const rightStartedAt = right.thread.attentionStartedAt ?? Number.POSITIVE_INFINITY
    if (leftStartedAt !== rightStartedAt) {
      return leftStartedAt - rightStartedAt
    }
  } else if (left.thread.latestTimestamp !== right.thread.latestTimestamp) {
    return right.thread.latestTimestamp - left.thread.latestTimestamp
  }
  return (left.thread.sessionIdentity ?? left.thread.paneKey).localeCompare(
    right.thread.sessionIdentity ?? right.thread.paneKey
  )
}

/** Orders by Activity state, then effective priority, unread, age and identity; the input stays untouched. */
export function sortActivityThreads(
  threads: readonly AgentPaneThread[],
  workProjectPriorityRaised: boolean
): { thread: AgentPaneThread; effectivePriority: number }[] {
  return threads
    .map((thread) => activityThreadSortKey(thread, workProjectPriorityRaised))
    .sort(compareActivityThreadSortKeys)
}
