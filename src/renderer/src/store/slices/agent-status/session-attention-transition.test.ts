import { describe, expect, it } from 'vitest'
import { createTestStore, seedStore } from '../../testing/app-store-test-fixture'
import { makeTab } from '../../terminals/testing/terminal-tab.test-fixture'
import { getDefaultUIState } from '../../../../../shared/orca-profiles/constants'
import { buildSessionAttentionIdentity } from '../../../../../shared/session-attention'
import { makePaneKey } from '../../../../../shared/workspace-layout/stable-pane-id'
import type { Tab } from '../../../../../shared/workspace-layout/tab-groups/tab-types'

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
      priority: 2,
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
            id: ATTENTION_TAB_ID,
            contentType: 'agent-session' as const,
            entityId: 'structured-attention-session'
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
    expect(store.getState().agentStatusByPaneKey.get(ATTENTION_PANE)?.stateStartedAt).toBe(4_000)
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
