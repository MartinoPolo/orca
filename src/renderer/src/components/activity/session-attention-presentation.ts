import type { ActivityThreadStatusId } from './activity-thread-presentation'
import type { AgentPaneThread } from './activity-thread-types'

export type SessionAttentionTone = 'input' | 'outcome' | 'done' | null

export function isAttentionQueueEligible({
  status,
  unread,
  saved,
  supportsStatusAttention = true
}: {
  status: ActivityThreadStatusId
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
  status: ActivityThreadStatusId
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
  status: ActivityThreadStatusId
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

/** Sorts only within a factual status group. */
export function compareAttentionThreads(left: AgentPaneThread, right: AgentPaneThread): number {
  const leftPriority = left.priority ?? 3
  const rightPriority = right.priority ?? 3
  if (leftPriority !== rightPriority) {
    return rightPriority - leftPriority
  }
  if (left.unread !== right.unread) {
    return left.unread ? -1 : 1
  }
  const leftStartedAt = left.attentionStartedAt ?? Number.POSITIVE_INFINITY
  const rightStartedAt = right.attentionStartedAt ?? Number.POSITIVE_INFINITY
  if (leftStartedAt !== rightStartedAt) {
    return leftStartedAt - rightStartedAt
  }
  return (left.sessionIdentity ?? left.paneKey).localeCompare(
    right.sessionIdentity ?? right.paneKey
  )
}
