import type { Mock } from 'vitest'
import type {
  AgentSessionStatusEvent,
  AgentSessionStatusSummary
} from '../../../../shared/agent-session-wire'
import type { AgentStatusEntry } from '../../../../shared/agent-status-types'
import type { Tab } from '../../../../shared/tab-types'
import type { AppState } from '@/store/types'

export const structuredTab = {
  id: 'structured-tab-1',
  worktreeId: 'wt-1',
  groupId: 'group-1',
  contentType: 'agent-session',
  entityId: 'session-1',
  label: 'Codex Chat',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 0,
  isPinned: false,
  agentSessionAgent: 'codex'
} satisfies Tab

export const providerSession = {
  key: 'session_id',
  id: '01a002e9-9a1c-7d42-a642-e481f64446f1'
} as const

export function summary(
  overrides: Partial<AgentSessionStatusSummary> = {}
): AgentSessionStatusSummary {
  return {
    sessionId: 'session-1',
    workspaceId: 'wt-1',
    agent: 'codex',
    status: 'working',
    hostExecutionOwned: true,
    latestPrompt: 'hello',
    providerSession,
    updatedAt: 1,
    ...overrides
  }
}

export function readProjectedAgentStatuses(
  store: { getState: () => AppState } | null
): AgentStatusEntry[] {
  return Object.values(store?.getState().agentStatusByPaneKey ?? {})
}

/** The host side of a mocked status subscription, by subscription order. */
export function readStatusFeed(
  subscribeStatus: Mock,
  index: number
): { target: unknown; emit: (event: AgentSessionStatusEvent) => void } {
  const call = subscribeStatus.mock.calls[index]
  if (!call) {
    throw new Error('status feed not subscribed')
  }
  return { target: call[0], emit: call[1] as (event: AgentSessionStatusEvent) => void }
}
