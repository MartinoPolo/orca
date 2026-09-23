/** @vitest-environment happy-dom */
import { act } from 'react'
import { createRoot, type Root } from 'react-dom/client'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { StoreApi } from 'zustand/vanilla'
import { getDefaultUIState } from '../../../shared/constants'
import { buildSessionAttentionIdentity } from '../../../shared/session-attention'
import type { PersistedUIState } from '../../../shared/persisted-ui-state-types'
import type { Tab } from '../../../shared/tab-types'
import type { AppState } from '../store/types'
import { createTestStore, makeTab } from '../store/slices/store-test-helpers'
import { usePersistedUIWriter } from './use-persisted-ui-writer'

const storeRef = vi.hoisted(() => {
  let current: StoreApi<AppState> | null = null
  return {
    get(): StoreApi<AppState> {
      if (!current) {
        throw new Error('test store must be initialized before use')
      }
      return current
    },
    set(store: StoreApi<AppState>): void {
      current = store
    }
  }
})

vi.mock('../store', async () => {
  const { useStore } = await import('zustand')
  const useAppStore = (selector: (state: AppState) => unknown) => useStore(storeRef.get(), selector)
  useAppStore.getState = () => storeRef.get().getState()
  useAppStore.setState = (partial: Partial<AppState>) => storeRef.get().setState(partial)
  useAppStore.subscribe = (listener: (state: AppState) => void) =>
    storeRef.get().subscribe(listener)
  return { useAppStore }
})

const WORKSPACE_ID = 'attention-persistence-workspace'
const TAB_ID = 'attention-persistence-tab'
const PANE_KEY = `${TAB_ID}:11111111-1111-4111-8111-111111111111`
const PROVIDER_SESSION = { key: 'session_id' as const, id: 'persisted-provider-session' }

function identityFor(providerSession = PROVIDER_SESSION): string {
  const identity = buildSessionAttentionIdentity({
    executionHostId: 'local',
    workspaceId: WORKSPACE_ID,
    agentType: 'claude',
    providerSession
  })
  if (!identity) {
    throw new Error('provider fixture must have a stable identity')
  }
  return identity
}

function seedSession(store: StoreApi<AppState>): void {
  const terminalTab = makeTab({ id: TAB_ID, worktreeId: WORKSPACE_ID })
  const projectedTab: Tab = {
    id: 'projected-attention-persistence-tab',
    entityId: TAB_ID,
    groupId: 'group-1',
    worktreeId: WORKSPACE_ID,
    executionHostId: 'local',
    contentType: 'terminal',
    label: 'Claude',
    customLabel: null,
    color: null,
    sortOrder: 0,
    createdAt: 1
  }
  store.setState({
    tabsByWorktree: { [WORKSPACE_ID]: [terminalTab] },
    unifiedTabsByWorktree: { [WORKSPACE_ID]: [projectedTab] }
  })
}

function reportWaiting(
  store: StoreApi<AppState>,
  providerSession: typeof PROVIDER_SESSION,
  at: number
): void {
  store
    .getState()
    .setAgentStatus(
      PANE_KEY,
      { state: 'waiting', prompt: 'Persist attention', agentType: 'claude' },
      'Claude',
      { updatedAt: at },
      { tabId: TAB_ID, worktreeId: WORKSPACE_ID },
      { providerSession }
    )
}

describe('session attention durable writer integration', () => {
  let container: HTMLDivElement
  let root: Root
  let outgoing: Partial<PersistedUIState>[]

  beforeEach(() => {
    vi.useFakeTimers()
    outgoing = []
    const store = createTestStore()
    storeRef.set(store)
    Object.defineProperty(window, 'api', {
      configurable: true,
      value: {
        ui: {
          set: (update: Partial<PersistedUIState>) => {
            outgoing.push(update)
            return Promise.resolve()
          },
          setWithAck: (update: Partial<PersistedUIState>) => {
            outgoing.push(update)
            return Promise.resolve()
          }
        }
      }
    })
    store.getState().hydratePersistedUI(getDefaultUIState(), 'startup')
    container = document.createElement('div')
    document.body.appendChild(container)
    root = createRoot(container)
    act(() => {
      root.render(<WriterProbe />)
    })
  })

  afterEach(() => {
    if (root) {
      act(() => root.unmount())
    }
    container?.remove()
    vi.useRealTimers()
  })

  it('writes attention fields and hydrates them only into the same provider conversation', async () => {
    const identity = identityFor()
    act(() => {
      storeRef.get().getState().setSessionPriority(identity, 5)
      storeRef.get().getState().setSessionSavedMarker(identity, 'teal')
    })
    await act(async () => {
      vi.advanceTimersByTime(200)
      await Promise.resolve()
    })
    const writtenAttention = outgoing.find(
      (update) => update.sessionAttentionMetadataByIdentity !== undefined
    )?.sessionAttentionMetadataByIdentity
    expect(writtenAttention?.[identity]).toMatchObject({ priority: 5, savedColor: 'teal' })

    const resumed = createTestStore()
    resumed
      .getState()
      .hydratePersistedUI(
        { ...getDefaultUIState(), sessionAttentionMetadataByIdentity: writtenAttention },
        'startup'
      )
    seedSession(resumed)
    reportWaiting(resumed, PROVIDER_SESSION, 1_000)
    expect(resumed.getState().sessionAttentionMetadataByIdentity[identity]).toMatchObject({
      priority: 5,
      savedColor: 'teal',
      attentionEpisodeStartedAt: 1_000
    })

    const replacementProvider = {
      key: 'session_id' as const,
      id: 'replacement-provider-session'
    }
    reportWaiting(resumed, replacementProvider, 2_000)
    expect(
      resumed.getState().sessionAttentionMetadataByIdentity[identityFor(replacementProvider)]
    ).toEqual({
      priority: 3,
      attentionEpisodeStartedAt: 2_000,
      attentionEpisodeKind: 'unresolved-input'
    })
  })
})

function WriterProbe(): null {
  usePersistedUIWriter()
  return null
}
