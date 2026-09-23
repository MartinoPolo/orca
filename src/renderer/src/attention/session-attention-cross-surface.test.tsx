/** @vitest-environment happy-dom */
import { cleanup, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { buildSessionAttentionIdentity } from '../../../shared/session-attention'
import type { AgentStatusEntry } from '../../../shared/agent-status-types'
import type { Tab } from '../../../shared/tab-types'
import type { TerminalTab } from '../../../shared/terminal-tab-types'
import { makePaneKey } from '../../../shared/stable-pane-id'
import { useAppStore } from '@/store'
import { TooltipProvider } from '@/components/ui/tooltip'
import DashboardAgentRow from '@/components/dashboard/DashboardAgentRow'
import type { DashboardAgentRow as DashboardAgentRowData } from '@/components/dashboard/useDashboardData'
import { CompactAgentRow } from '@/components/sidebar/worktree-card-compact-agent-row'
import { buildActivityEvents } from '@/components/activity/activity-event-builder'
import { buildAgentPaneThreads } from '@/components/activity/activity-thread-builder'
import { ActivityThreadRow } from '@/components/activity/activity-thread-row'
import { makeRepo, makeWorktree } from '@/components/activity/ActivityPrototypePage-test-fixtures'

const WORKSPACE_ID = 'wt-1'
const TERMINAL_TAB_ID = 'terminal-tab-1'
const PANE_KEY = makePaneKey(TERMINAL_TAB_ID, '11111111-1111-4111-8111-111111111111')
const PROVIDER_SESSION = { key: 'session_id' as const, id: 'provider-session-1' }

const terminalTab: TerminalTab = {
  id: TERMINAL_TAB_ID,
  ptyId: null,
  worktreeId: WORKSPACE_ID,
  title: 'Remote task',
  customTitle: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

const projectedTab: Tab = {
  id: 'renderer-tab-1',
  entityId: TERMINAL_TAB_ID,
  groupId: 'group-1',
  worktreeId: WORKSPACE_ID,
  executionHostId: 'ssh:tab-host',
  contentType: 'terminal',
  label: 'Remote task',
  customLabel: null,
  color: null,
  sortOrder: 0,
  createdAt: 1
}

const entry: AgentStatusEntry = {
  state: 'waiting',
  prompt: 'Review the remote change',
  updatedAt: 2_000,
  stateStartedAt: 1_000,
  paneKey: PANE_KEY,
  worktreeId: WORKSPACE_ID,
  tabId: TERMINAL_TAB_ID,
  agentType: 'claude',
  providerSession: PROVIDER_SESSION,
  stateHistory: []
}

function dashboardAgent(): DashboardAgentRowData {
  return {
    paneKey: PANE_KEY,
    entry,
    tab: terminalTab,
    agentType: 'claude',
    state: 'waiting',
    startedAt: 1_000
  }
}

function renderSidebarRow(compact: boolean): string {
  const view = render(
    <TooltipProvider>
      {compact ? (
        <CompactAgentRow agent={dashboardAgent()} now={3_000} onActivate={vi.fn()} isUnread />
      ) : (
        <DashboardAgentRow
          agent={dashboardAgent()}
          onDismiss={vi.fn()}
          onActivate={vi.fn()}
          now={3_000}
          isUnvisited
        />
      )}
    </TooltipProvider>
  )
  const markup = view.container.innerHTML
  view.unmount()
  return markup
}

describe('session attention cross-surface identity', () => {
  beforeEach(() => {
    const workspaceWorktree = { ...makeWorktree(), hostId: 'ssh:workspace-host' as const }
    const workspaceRepo = {
      ...makeRepo(),
      executionHostId: 'ssh:workspace-host' as const,
      connectionId: 'workspace-host'
    }
    const identity = buildSessionAttentionIdentity({
      executionHostId: 'ssh:tab-host',
      workspaceId: WORKSPACE_ID,
      agentType: 'claude',
      providerSession: PROVIDER_SESSION
    })
    if (!identity) {
      throw new Error('provider fixture must have an identity')
    }
    useAppStore.setState({
      unifiedTabsByWorktree: { [WORKSPACE_ID]: [projectedTab] },
      repos: [workspaceRepo],
      getKnownWorktreeById: () => workspaceWorktree,
      sessionAttentionMetadataByIdentity: {
        [identity]: { priority: 5, savedColor: 'teal', savedAt: 500 }
      }
    })
  })

  afterEach(() => cleanup())

  it('uses the tab host and same metadata in full, compact, and Activity rows', () => {
    const identity = buildSessionAttentionIdentity({
      executionHostId: 'ssh:tab-host',
      workspaceId: WORKSPACE_ID,
      agentType: 'claude',
      providerSession: PROVIDER_SESSION
    })
    const repo = makeRepo()
    const worktree = makeWorktree()
    const activity = buildActivityEvents({
      agentStatusByPaneKey: { [PANE_KEY]: entry },
      retainedAgentsByPaneKey: {},
      tabsByWorktree: { [WORKSPACE_ID]: [terminalTab] },
      unifiedTabsByWorktree: { [WORKSPACE_ID]: [projectedTab] },
      worktreeMap: new Map([[WORKSPACE_ID, worktree]]),
      repoMap: new Map([[repo.id, repo]]),
      acknowledgedAgentsByPaneKey: {},
      now: 3_000
    })
    const [activityThread] = buildAgentPaneThreads({
      ...activity,
      sessionAttentionMetadataByIdentity: useAppStore.getState().sessionAttentionMetadataByIdentity,
      defaultHostId: 'runtime:worktree-host'
    })

    expect(activityThread).toMatchObject({
      sessionIdentity: identity,
      priority: 5,
      savedMarker: { savedColor: 'teal', savedAt: 500 },
      attentionStartedAt: 500
    })
    const activityView = render(
      <TooltipProvider>
        <ActivityThreadRow
          thread={activityThread}
          selected={false}
          onSelect={vi.fn()}
          onJump={vi.fn()}
          onMarkRead={vi.fn()}
          onMarkUnread={vi.fn()}
          canJump={false}
          compactMode
        />
      </TooltipProvider>
    )
    const activityMarkup = activityView.container.innerHTML
    activityView.unmount()
    for (const markup of [renderSidebarRow(false), renderSidebarRow(true), activityMarkup]) {
      expect(markup).toContain('aria-label="Priority P5"')
      expect(markup).toContain('aria-label="Saved for later, teal"')
      expect(markup).toContain('aria-label="Unread — mark read:')
    }
  })

  it('uses the workspace host instead of focused local settings when no tab host is available', () => {
    const identity = buildSessionAttentionIdentity({
      executionHostId: 'ssh:workspace-host',
      workspaceId: WORKSPACE_ID,
      agentType: 'claude',
      providerSession: PROVIDER_SESSION
    })
    if (!identity) {
      throw new Error('workspace-host fixture must have an identity')
    }
    useAppStore.setState({
      unifiedTabsByWorktree: {},
      sessionAttentionMetadataByIdentity: {
        [identity]: { priority: 5, savedColor: 'teal', savedAt: 500 }
      }
    })
    const repo = {
      ...makeRepo(),
      executionHostId: 'ssh:workspace-host' as const,
      connectionId: 'workspace-host'
    }
    const worktree = { ...makeWorktree(), hostId: 'ssh:workspace-host' as const }
    const activity = buildActivityEvents({
      agentStatusByPaneKey: { [PANE_KEY]: entry },
      retainedAgentsByPaneKey: {},
      tabsByWorktree: { [WORKSPACE_ID]: [terminalTab] },
      worktreeMap: new Map([[WORKSPACE_ID, worktree]]),
      repoMap: new Map([[repo.id, repo]]),
      acknowledgedAgentsByPaneKey: {},
      now: 3_000
    })
    const [activityThread] = buildAgentPaneThreads({
      ...activity,
      sessionAttentionMetadataByIdentity: useAppStore.getState().sessionAttentionMetadataByIdentity,
      defaultHostId: 'local'
    })

    expect(activityThread.sessionIdentity).toBe(identity)
    for (const markup of [renderSidebarRow(false), renderSidebarRow(true)]) {
      expect(markup).toContain('aria-label="Priority P5"')
      expect(markup).toContain('aria-label="Saved for later, teal"')
    }
  })
})
