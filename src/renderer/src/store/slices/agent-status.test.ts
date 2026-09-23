import { afterEach, describe, expect, it, vi } from 'vitest'
import { AGENT_STATUS_STALE_AFTER_MS } from '../../../../shared/agent-status-types'
import { flushMicrotasks } from './agent-status-test-harness'
import { createTestStore, makeTab, seedStore } from './store-test-helpers'
import { getDefaultUIState } from '../../../../shared/constants'
import { buildSessionAttentionIdentity } from '../../../../shared/session-attention'
import { makePaneKey } from '../../../../shared/stable-pane-id'
import type { Tab } from '../../../../shared/tab-types'

describe('agent status freshness expiry', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('advances agentStatusEpoch when a fresh entry crosses the stale threshold', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))

    const store = createTestStore()
    store
      .getState()
      .setAgentStatus('tab-1:1', { state: 'working', prompt: 'Fix tests', agentType: 'codex' })

    // setAgentStatus bumps epoch once synchronously
    expect(store.getState().agentStatusEpoch).toBe(1)

    // Flush the queueMicrotask that schedules the freshness timer
    await flushMicrotasks()

    vi.advanceTimersByTime(AGENT_STATUS_STALE_AFTER_MS + 1)

    // Timer bump adds another increment
    expect(store.getState().agentStatusEpoch).toBe(2)
  })

  it('cancels the scheduled freshness tick when the entry is removed first', async () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))

    const store = createTestStore()
    store
      .getState()
      .setAgentStatus('tab-1:1', { state: 'working', prompt: 'Fix tests', agentType: 'codex' })
    // set bumps to 1, remove bumps to 2
    store.getState().removeAgentStatus('tab-1:1')
    expect(store.getState().agentStatusEpoch).toBe(2)

    // Flush microtask and advance past stale threshold
    await flushMicrotasks()
    vi.advanceTimersByTime(AGENT_STATUS_STALE_AFTER_MS + 1)

    // No additional bump since the entry was removed before the timer fires
    expect(store.getState().agentStatusEpoch).toBe(2)
  })

  it('arms freshness expiry for status rows written by an external mirror', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))
    const store = createTestStore()
    const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'
    const now = Date.now()

    store.setState({
      agentStatusByPaneKey: {
        [paneKey]: {
          paneKey,
          state: 'working',
          prompt: 'Mirrored agent',
          updatedAt: now,
          stateStartedAt: now,
          stateHistory: []
        }
      }
    })
    store.getState().scheduleAgentStatusFreshness()
    vi.advanceTimersByTime(AGENT_STATUS_STALE_AFTER_MS + 1)

    expect(store.getState().agentStatusEpoch).toBe(1)
  })
})

describe('agent status routing attribution', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('stores worktree and tab attribution from accepted hook events', () => {
    vi.useFakeTimers()
    const store = createTestStore()

    store
      .getState()
      .setAgentStatus(
        'tab-child:11111111-1111-4111-8111-111111111111',
        { state: 'working', prompt: 'child agent', agentType: 'codex' },
        undefined,
        undefined,
        { tabId: 'tab-child', worktreeId: 'wt-1', terminalHandle: 'term-child' }
      )

    expect(
      store.getState().agentStatusByPaneKey['tab-child:11111111-1111-4111-8111-111111111111']
    ).toMatchObject({
      tabId: 'tab-child',
      worktreeId: 'wt-1',
      terminalHandle: 'term-child'
    })
  })
})

describe('agent status stateStartedAt', () => {
  afterEach(() => {
    vi.useRealTimers()
  })

  it('carries stateStartedAt forward across same-state pings', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))

    const store = createTestStore()
    store.getState().setAgentStatus('tab-1:1', { state: 'working', prompt: 'p1' }, 'claude')
    const firstStart = store.getState().agentStatusByPaneKey['tab-1:1'].stateStartedAt

    // Advance 5s and re-ping with same state but different prompt/tool fields
    vi.setSystemTime(new Date('2026-04-09T12:00:05.000Z'))
    store
      .getState()
      .setAgentStatus('tab-1:1', { state: 'working', prompt: 'p1', toolName: 'Edit' }, 'claude')

    const entry = store.getState().agentStatusByPaneKey['tab-1:1']
    // Why: stateStartedAt is the invariant we are protecting — it must survive
    // tool/prompt pings within the same state, while updatedAt advances.
    expect(entry.stateStartedAt).toBe(firstStart)
    expect(entry.updatedAt).toBe(new Date('2026-04-09T12:00:05.000Z').getTime())
  })

  it('resets stateStartedAt when the state changes', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))

    const store = createTestStore()
    store.getState().setAgentStatus('tab-1:1', { state: 'working', prompt: 'p1' }, 'claude')
    const workingStart = store.getState().agentStatusByPaneKey['tab-1:1'].stateStartedAt

    vi.setSystemTime(new Date('2026-04-09T12:00:10.000Z'))
    store.getState().setAgentStatus('tab-1:1', { state: 'done', prompt: 'p1' }, 'claude')

    const entry = store.getState().agentStatusByPaneKey['tab-1:1']
    expect(entry.stateStartedAt).toBe(new Date('2026-04-09T12:00:10.000Z').getTime())
    expect(entry.stateStartedAt).not.toBe(workingStart)
    // history should capture the working state's true start
    expect(entry.stateHistory).toHaveLength(1)
    expect(entry.stateHistory[0].state).toBe('working')
    expect(entry.stateHistory[0].startedAt).toBe(workingStart)
  })

  it('uses IPC snapshot timing instead of restamping restored entries as fresh', () => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-04-09T12:00:00.000Z'))

    const store = createTestStore()
    store
      .getState()
      .setAgentStatus(
        'tab-1:1',
        { state: 'working', prompt: 'p1', agentType: 'claude' },
        'claude',
        {
          updatedAt: new Date('2026-04-09T10:00:00.000Z').getTime(),
          stateStartedAt: new Date('2026-04-09T09:55:00.000Z').getTime()
        }
      )

    const entry = store.getState().agentStatusByPaneKey['tab-1:1']
    expect(entry.updatedAt).toBe(new Date('2026-04-09T10:00:00.000Z').getTime())
    expect(entry.stateStartedAt).toBe(new Date('2026-04-09T09:55:00.000Z').getTime())
  })

  it('ignores an older snapshot when a newer live event already updated the pane', () => {
    vi.useFakeTimers()
    const store = createTestStore()
    store
      .getState()
      .setAgentStatus(
        'tab-1:1',
        { state: 'working', prompt: 'fresh', agentType: 'claude' },
        'claude',
        { updatedAt: 2_000, stateStartedAt: 2_000 }
      )
    store
      .getState()
      .setAgentStatus(
        'tab-1:1',
        { state: 'done', prompt: 'stale', agentType: 'claude' },
        'claude',
        { updatedAt: 1_000, stateStartedAt: 1_000 }
      )

    const entry = store.getState().agentStatusByPaneKey['tab-1:1']
    expect(entry.state).toBe('working')
    expect(entry.prompt).toBe('fresh')
    expect(entry.updatedAt).toBe(2_000)
  })
})

const ATTENTION_WORKSPACE_ID = 'attention-workspace'
const ATTENTION_TAB_ID = 'attention-tab'
const ATTENTION_PANE = makePaneKey(ATTENTION_TAB_ID, '11111111-1111-4111-8111-111111111111')
const ATTENTION_PROVIDER_SESSION = { key: 'session_id' as const, id: 'attention-session' }

function seedAttentionSession(store: ReturnType<typeof createTestStore>): void {
  const terminalTab = makeTab({ id: ATTENTION_TAB_ID, worktreeId: ATTENTION_WORKSPACE_ID })
  const projectedTab: Tab = {
    id: 'projected-attention-tab',
    entityId: ATTENTION_TAB_ID,
    groupId: 'group-1',
    worktreeId: ATTENTION_WORKSPACE_ID,
    executionHostId: 'local',
    contentType: 'terminal',
    label: 'Claude',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  seedStore(store, {
    tabsByWorktree: { [ATTENTION_WORKSPACE_ID]: [terminalTab] },
    unifiedTabsByWorktree: { [ATTENTION_WORKSPACE_ID]: [projectedTab] }
  })
}

function attentionIdentity(): string {
  const identity = buildSessionAttentionIdentity({
    executionHostId: 'local',
    workspaceId: ATTENTION_WORKSPACE_ID,
    agentType: 'claude',
    providerSession: ATTENTION_PROVIDER_SESSION
  })
  if (!identity) {
    throw new Error('provider-backed fixture must have a stable identity')
  }
  return identity
}

function reportAttentionStatus(
  store: ReturnType<typeof createTestStore>,
  state: 'working' | 'blocked' | 'waiting' | 'done',
  at: number,
  paneKey = ATTENTION_PANE
): void {
  store
    .getState()
    .setAgentStatus(
      paneKey,
      { state, prompt: 'Attention episode', agentType: 'claude' },
      'Claude',
      { updatedAt: at, stateStartedAt: at },
      { tabId: ATTENTION_TAB_ID, worktreeId: ATTENTION_WORKSPACE_ID },
      { providerSession: ATTENTION_PROVIDER_SESSION }
    )
}

describe('persisted session attention episodes', () => {
  it('keeps one age across qualifying status changes and starts over after resolution', () => {
    const store = createTestStore()
    seedAttentionSession(store)

    reportAttentionStatus(store, 'waiting', 1_000)
    reportAttentionStatus(store, 'blocked', 2_000)
    reportAttentionStatus(store, 'blocked', 3_000)
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toMatchObject({
      attentionEpisodeStartedAt: 1_000,
      attentionEpisodeKind: 'unresolved-input'
    })

    reportAttentionStatus(store, 'working', 4_000)
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toBeUndefined()

    reportAttentionStatus(store, 'waiting', 5_000)
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toMatchObject({
      attentionEpisodeStartedAt: 5_000
    })
  })

  it('hydrates and replays the same episode onto a replacement pane', () => {
    const first = createTestStore()
    seedAttentionSession(first)
    reportAttentionStatus(first, 'waiting', 1_000)
    const persisted = first.getState().sessionAttentionMetadataByIdentity

    const resumed = createTestStore()
    seedAttentionSession(resumed)
    resumed.getState().hydratePersistedUI({
      ...getDefaultUIState(),
      sessionAttentionMetadataByIdentity: persisted
    })
    const replacementPane = makePaneKey(ATTENTION_TAB_ID, '22222222-2222-4222-8222-222222222222')
    reportAttentionStatus(resumed, 'blocked', 8_000, replacementPane)

    expect(
      resumed.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]
    ).toMatchObject({
      attentionEpisodeStartedAt: 1_000
    })
  })

  it('preserves the current attention age when saved markers change', () => {
    const store = createTestStore()
    seedAttentionSession(store)
    reportAttentionStatus(store, 'waiting', 1_000)

    store.getState().setSessionSavedMarker(attentionIdentity(), 'teal')
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toMatchObject({
      savedColor: 'teal',
      attentionEpisodeStartedAt: 1_000
    })

    store.getState().setSessionSavedMarker(attentionIdentity(), null)
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toEqual({
      priority: 3,
      attentionEpisodeStartedAt: 1_000,
      attentionEpisodeKind: 'unresolved-input'
    })
  })

  it('migrates structured metadata when provider identity arrives later', () => {
    const store = createTestStore()
    seedAttentionSession(store)
    store.setState((state) => ({
      unifiedTabsByWorktree: {
        ...state.unifiedTabsByWorktree,
        [ATTENTION_WORKSPACE_ID]: state.unifiedTabsByWorktree[ATTENTION_WORKSPACE_ID].map(
          (tab) => ({
            ...tab,
            structuredSessionId: 'structured-attention-session'
          })
        )
      }
    }))
    store
      .getState()
      .setAgentStatus(
        ATTENTION_PANE,
        { state: 'waiting', prompt: 'Attention episode', agentType: 'claude' },
        'Claude',
        { updatedAt: 1_000, stateStartedAt: 1_000 },
        { tabId: ATTENTION_TAB_ID, worktreeId: ATTENTION_WORKSPACE_ID }
      )
    const [structuredIdentity] = Object.keys(store.getState().sessionAttentionMetadataByIdentity)
    store.getState().setSessionPriority(structuredIdentity, 5)

    reportAttentionStatus(store, 'blocked', 2_000)

    expect(store.getState().sessionAttentionMetadataByIdentity).toEqual({
      [attentionIdentity()]: {
        priority: 5,
        attentionEpisodeStartedAt: 1_000,
        attentionEpisodeKind: 'unresolved-input'
      }
    })
  })

  it('uses the retained terminal handle runtime identity when a completion is read after tab teardown', () => {
    const store = createTestStore()
    seedAttentionSession(store)
    store.setState((state) => ({
      unifiedTabsByWorktree: {
        [ATTENTION_WORKSPACE_ID]: state.unifiedTabsByWorktree[ATTENTION_WORKSPACE_ID].map(
          (tab) => ({ ...tab, executionHostId: 'runtime:attention-host' as const })
        )
      }
    }))
    store.getState().setAgentStatus(
      ATTENTION_PANE,
      { state: 'done', prompt: 'Attention episode', agentType: 'claude' },
      'Claude',
      { updatedAt: 1_000, stateStartedAt: 1_000 },
      {
        tabId: ATTENTION_TAB_ID,
        worktreeId: ATTENTION_WORKSPACE_ID,
        terminalHandle: 'remote:attention-host@@terminal-1',
        connectionId: null
      },
      { providerSession: ATTENTION_PROVIDER_SESSION }
    )
    const remoteIdentity = buildSessionAttentionIdentity({
      executionHostId: 'runtime:attention-host',
      workspaceId: ATTENTION_WORKSPACE_ID,
      agentType: 'claude',
      providerSession: ATTENTION_PROVIDER_SESSION
    })
    if (!remoteIdentity) {
      throw new Error('remote provider fixture must have a stable identity')
    }
    const liveEntry = store.getState().agentStatusByPaneKey[ATTENTION_PANE]
    const retainedTab = store.getState().tabsByWorktree[ATTENTION_WORKSPACE_ID][0]
    store.setState({
      agentStatusByPaneKey: {},
      tabsByWorktree: {},
      unifiedTabsByWorktree: {},
      retainedAgentsByPaneKey: {
        [ATTENTION_PANE]: {
          entry: liveEntry,
          worktreeId: ATTENTION_WORKSPACE_ID,
          tab: retainedTab,
          agentType: 'claude',
          startedAt: liveEntry.stateStartedAt
        }
      }
    })

    store.getState().acknowledgeAgents([ATTENTION_PANE])

    expect(store.getState().sessionAttentionMetadataByIdentity[remoteIdentity]).toBeUndefined()
    expect(Object.keys(store.getState().sessionAttentionMetadataByIdentity)).toEqual([])
  })

  it('resolves an input episode before starting a distinct unread completion episode', () => {
    const store = createTestStore()
    seedAttentionSession(store)

    reportAttentionStatus(store, 'waiting', 1_000)
    reportAttentionStatus(store, 'blocked', 2_000)
    reportAttentionStatus(store, 'done', 3_000)

    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toMatchObject({
      attentionEpisodeStartedAt: 3_000,
      attentionEpisodeKind: 'unread-outcome'
    })
  })

  it('does not inherit state timing or attention metadata across provider conversations', () => {
    const store = createTestStore()
    seedAttentionSession(store)
    reportAttentionStatus(store, 'waiting', 1_000)
    const replacementProviderSession = { key: 'session_id' as const, id: 'replacement-session' }

    store
      .getState()
      .setAgentStatus(
        ATTENTION_PANE,
        { state: 'waiting', prompt: 'Replacement conversation', agentType: 'claude' },
        'Claude',
        { updatedAt: 4_000 },
        { tabId: ATTENTION_TAB_ID, worktreeId: ATTENTION_WORKSPACE_ID },
        { providerSession: replacementProviderSession }
      )

    const replacementIdentity = buildSessionAttentionIdentity({
      executionHostId: 'local',
      workspaceId: ATTENTION_WORKSPACE_ID,
      agentType: 'claude',
      providerSession: replacementProviderSession
    })
    if (!replacementIdentity) {
      throw new Error('replacement provider fixture must have a stable identity')
    }
    expect(store.getState().agentStatusByPaneKey[ATTENTION_PANE].stateStartedAt).toBe(4_000)
    expect(store.getState().sessionAttentionMetadataByIdentity[replacementIdentity]).toMatchObject({
      attentionEpisodeStartedAt: 4_000,
      attentionEpisodeKind: 'unresolved-input'
    })
  })

  it('clears completion age on read while unresolved blocked age remains', () => {
    const store = createTestStore()
    seedAttentionSession(store)
    reportAttentionStatus(store, 'done', 1_000)
    store.getState().acknowledgeAgents([ATTENTION_PANE])
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toBeUndefined()

    reportAttentionStatus(store, 'blocked', 2_000)
    store.getState().acknowledgeAgents([ATTENTION_PANE])
    expect(store.getState().sessionAttentionMetadataByIdentity[attentionIdentity()]).toMatchObject({
      attentionEpisodeStartedAt: 2_000
    })
  })
})
