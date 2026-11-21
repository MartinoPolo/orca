import { translate } from '@/i18n/i18n'
import { getTranslationResourceVersion } from '@/i18n/translation-resource-version'
import type { Translate } from '@/i18n/use-translate'
import { formatAgentTypeLabel } from '../../../../../shared/agent-status/presentation/agent-type-label'
import { getAgentRowPrimaryText } from '../../../../../shared/agent-status/presentation/agent-row-primary-text'
import { getActivityThreadWorkspaceTitle } from '@/lib/workspace/activity/activity-thread-display'
import { isClipboardTextByteLengthOverLimit } from '../../../../../shared/clipboard/clipboard-text'
import {
  agentMeta,
  agentSummary,
  agentTitle,
  threadAgentStateLabel
} from '../threads/activity-thread-presentation'
import {
  HIGH_SESSION_PRIORITY,
  workProjectPriorityShift
} from '../../../../../shared/session-effective-priority'
import type { ActivityGroupBy } from '../../../../../shared/agent-status/presentation/agents-view-thread-filters'
import type { ActivityThreadGroup, AgentPaneThread } from '../threads/activity-thread-types'
import { sortActivityThreads } from '../threads/session-attention-presentation'

function getActivityThreadGroup(
  thread: AgentPaneThread,
  groupBy: Exclude<ActivityGroupBy, 'none' | 'status'>,
  t: Translate
): { key: string; label: string } {
  if (groupBy === 'project') {
    return thread.repo
      ? { key: `project:${thread.repo.id}`, label: thread.repo.displayName }
      : {
          key: 'project:unknown',
          label: t('auto.components.activity.ActivityPrototypePage.5651b216c6', 'Unknown project')
        }
  }
  if (groupBy === 'worktree') {
    return { key: `worktree:${thread.worktree.id}`, label: thread.worktree.displayName }
  }
  return { key: `agent:${thread.agentType}`, label: formatAgentTypeLabel(thread.agentType) }
}

function collectWorkPriorityShifts(
  threads: readonly AgentPaneThread[],
  workProjectPriorityRaised: boolean
): Map<string, number> {
  const shifts = new Map<string, number>()
  for (const thread of threads) {
    const shift = workProjectPriorityShift({
      workProject: thread.repo?.workProject,
      workProjectPriorityRaised
    })
    if (shift !== 0) {
      shifts.set(thread.paneKey, shift)
    }
  }
  return shifts
}

/** Status grouping splits by effective priority tier; each row's own state glyph shows its status. */
function buildActivityPriorityTierGroups(
  threads: AgentPaneThread[],
  workProjectPriorityRaised: boolean,
  workPriorityShiftByPaneKey: ReadonlyMap<string, number>,
  t: Translate
): ActivityThreadGroup[] {
  const highPriorityGroup: ActivityThreadGroup = {
    key: 'priority:high',
    label: t('sessionAttention.tier.high', 'High priority'),
    threads: [],
    workPriorityShiftByPaneKey
  }
  const otherGroup: ActivityThreadGroup = {
    key: 'priority:other',
    label: t('sessionAttention.tier.other', 'Other'),
    threads: [],
    workPriorityShiftByPaneKey
  }
  const migrationNoticeGroup: ActivityThreadGroup = {
    key: 'migration-notice',
    label: t('sessionAttention.migrationNotice', 'Migration notice'),
    threads: [],
    workPriorityShiftByPaneKey
  }
  for (const { thread, effectivePriority } of sortActivityThreads(
    threads,
    workProjectPriorityRaised
  )) {
    const group =
      thread.migrationUnsupportedPtyId !== undefined
        ? migrationNoticeGroup
        : effectivePriority >= HIGH_SESSION_PRIORITY
          ? highPriorityGroup
          : otherGroup
    group.threads.push(thread)
  }
  return [highPriorityGroup, otherGroup, migrationNoticeGroup].filter(
    (group) => group.threads.length > 0
  )
}

export function buildActivityThreadGroups(
  threads: AgentPaneThread[],
  groupBy: ActivityGroupBy,
  {
    workProjectPriorityRaised,
    t = translate
  }: { workProjectPriorityRaised: boolean; t?: Translate }
): ActivityThreadGroup[] {
  if (threads.length === 0) {
    return []
  }
  const workPriorityShiftByPaneKey = collectWorkPriorityShifts(threads, workProjectPriorityRaised)
  if (groupBy === 'none') {
    return [{ key: 'all', label: '', threads, workPriorityShiftByPaneKey }]
  }
  if (groupBy === 'status') {
    return buildActivityPriorityTierGroups(
      threads,
      workProjectPriorityRaised,
      workPriorityShiftByPaneKey,
      t
    )
  }
  const groups: ActivityThreadGroup[] = []
  const groupIndexByKey = new Map<string, number>()
  for (const thread of threads) {
    const group = getActivityThreadGroup(thread, groupBy, t)
    const existingIndex = groupIndexByKey.get(group.key)
    if (existingIndex === undefined) {
      groups.push({ ...group, threads: [thread], workPriorityShiftByPaneKey })
      groupIndexByKey.set(group.key, groups.length - 1)
      continue
    }
    groups[existingIndex].threads.push(thread)
  }
  return groups
}

function buildThreadSearchText(thread: AgentPaneThread): string {
  const latest = thread.latestEvent
  const stateLabel = threadAgentStateLabel(thread)
  const currentPrompt = thread.currentAgentEntry
    ? getAgentRowPrimaryText(thread.currentAgentEntry)
    : ''
  const rawCurrentPrompt = thread.currentAgentEntry?.prompt.trim() ?? ''
  const currentSummary = thread.currentAgentEntry?.lastAssistantMessage?.trim() ?? ''
  const latestEventText = latest
    ? `${agentTitle(latest)} ${agentSummary(latest)} ${agentMeta(latest)}`
    : ''
  return `${thread.paneTitle} ${getActivityThreadWorkspaceTitle(thread.worktree)} ${thread.worktree.branch ?? ''} ${thread.repo?.displayName ?? ''} ${formatAgentTypeLabel(thread.agentType)} ${stateLabel} ${currentPrompt} ${rawCurrentPrompt} ${currentSummary} ${thread.responsePreview} ${latestEventText}`.toLowerCase()
}

// Thread identity changes with its data, so cache lowercase search text across keystrokes; WeakMap releases dropped threads.
// Shared threads outlive a language switch, so the text is also keyed by the translation version.
const threadSearchTextCache = new WeakMap<AgentPaneThread, { version: number; text: string }>()
function threadSearchText(thread: AgentPaneThread): string {
  const version = getTranslationResourceVersion()
  const cached = threadSearchTextCache.get(thread)
  if (cached?.version === version) {
    return cached.text
  }
  const text = buildThreadSearchText(thread)
  threadSearchTextCache.set(thread, { version, text })
  return text
}

export const ACTIVITY_SEARCH_QUERY_MAX_BYTES = 2 * 1024

export function isActivitySearchQueryTooLarge(
  query: string,
  maxBytes = ACTIVITY_SEARCH_QUERY_MAX_BYTES
): boolean {
  return isClipboardTextByteLengthOverLimit(query, maxBytes)
}

export function createActivityThreadSearchMatcher(
  searchQuery: string
): (thread: AgentPaneThread) => boolean {
  if (isActivitySearchQueryTooLarge(searchQuery)) {
    return () => false
  }
  const trimmedQuery = searchQuery.trim()
  if (!trimmedQuery) {
    return () => true
  }
  const normalizedQuery = trimmedQuery.toLowerCase()
  return (thread) => threadSearchText(thread).includes(normalizedQuery)
}

export function activityThreadMatchesSearchQuery({
  thread,
  searchQuery
}: {
  thread: AgentPaneThread
  searchQuery: string
}): boolean {
  if (isActivitySearchQueryTooLarge(searchQuery)) {
    return false
  }
  const trimmedQuery = searchQuery.trim()
  if (!trimmedQuery) {
    return true
  }
  return threadSearchText(thread).includes(trimmedQuery.toLowerCase())
}
