// @vitest-environment happy-dom

import { act, cleanup, render, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { AppState } from '@/store/types'
import type * as RuntimeRpcClientModule from '@/runtime/runtime-rpc-client'
import type * as NotificationDispatchModule from '../terminal-pane/use-notification-dispatch'
import {
  readProjectedAgentStatuses,
  readStatusFeed,
  structuredTab,
  summary
} from './structured-agent-session-status-bridge-test-fixtures'

const mocks = vi.hoisted(() => ({
  store: null as null | {
    getState: () => AppState
    setState: (state: Partial<AppState> & { testRuntimeOwner?: string | null }) => void
  },
  subscribeStatus: vi.fn(),
  supportsCapability: vi.fn(),
  unsubscribe: vi.fn(),
  dispatchTerminalNotification: vi.fn(),
  actualDispatcher: vi.fn<typeof NotificationDispatchModule.dispatchTerminalNotification>()
}))

vi.mock('@/store', async () => {
  const { createTestStore } = await import('@/store/slices/store-test-helpers')
  const useAppStore = createTestStore()
  mocks.store = useAppStore
  return { useAppStore }
})

vi.mock('../terminal-pane/use-notification-dispatch', () => ({
  dispatchTerminalNotification: (worktreeId: string, event: never) => {
    mocks.dispatchTerminalNotification(worktreeId, event)
    mocks.actualDispatcher?.(worktreeId, event)
  }
}))
vi.mock('@/lib/desktop-notification-sound', () => ({
  playDesktopNotificationSound: vi.fn(async () => undefined)
}))

vi.mock('@/lib/worktree-runtime-owner', () => ({
  getRuntimeEnvironmentIdForWorktree: (state: { testRuntimeOwner?: string | null }) =>
    state.testRuntimeOwner ?? null,
  getExecutionHostIdForWorktree: (state: { testRuntimeOwner?: string | null }) =>
    state.testRuntimeOwner ? `runtime:${state.testRuntimeOwner}` : 'local'
}))

vi.mock('@/runtime/runtime-rpc-client', async (importOriginal) => ({
  ...(await importOriginal<typeof RuntimeRpcClientModule>()),
  runtimeEnvironmentSupportsCapability: mocks.supportsCapability
}))

vi.mock('@/runtime/structured-agent-session-client', () => ({
  callStructuredAgentSession: vi.fn(),
  subscribeStructuredAgentSession: vi.fn(),
  subscribeStructuredAgentSessionStatus: mocks.subscribeStatus
}))

import { StructuredAgentSessionStatusBridge } from './StructuredAgentSessionStatusBridge'
import { resetStructuredAgentSessionStatusFeedsForTests } from '@/runtime/structured-agent-session-status-feed'

const statuses = () => readProjectedAgentStatuses(mocks.store)
const feed = (index = 0) => readStatusFeed(mocks.subscribeStatus, index)

describe('StructuredAgentSessionStatusBridge notifications', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.actualDispatcher.mockReset()
    resetStructuredAgentSessionStatusFeedsForTests()
    mocks.subscribeStatus.mockResolvedValue({ unsubscribe: mocks.unsubscribe })
    mocks.supportsCapability.mockResolvedValue(true)
    mocks.store?.setState({
      agentStatusByPaneKey: {},
      testRuntimeOwner: null,
      unifiedTabsByWorktree: { 'wt-1': [structuredTab] }
    })
  })

  afterEach(() => {
    cleanup()
    resetStructuredAgentSessionStatusFeedsForTests()
  })

  it('alerts only on live structured transitions, not snapshots, repeats or reconnects', async () => {
    render(<StructuredAgentSessionStatusBridge />)
    await waitFor(() => expect(mocks.subscribeStatus).toHaveBeenCalledOnce())
    act(() => feed().emit({ type: 'snapshot', sessions: [summary({ status: 'idle' })] }))
    expect(mocks.dispatchTerminalNotification).not.toHaveBeenCalled()
    act(() => feed().emit({ type: 'status', session: summary({ updatedAt: 2 }) }))
    act(() =>
      feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: 3 }) })
    )
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledTimes(1)
    act(() =>
      feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: 4 }) })
    )
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledTimes(1)
    act(() => feed().emit({ type: 'end' }))
    await waitFor(() => expect(mocks.subscribeStatus).toHaveBeenCalledTimes(2))
    act(() =>
      feed(1).emit({ type: 'snapshot', sessions: [summary({ status: 'idle', updatedAt: 5 })] })
    )
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledTimes(1)
  })

  it('keeps a confirmed live feed across tab metadata updates and notifies with the latest title', async () => {
    render(<StructuredAgentSessionStatusBridge />)
    await waitFor(() => expect(mocks.subscribeStatus).toHaveBeenCalledOnce())
    act(() => feed().emit({ type: 'snapshot', sessions: [summary()] }))

    act(() =>
      mocks.store?.setState({
        unifiedTabsByWorktree: {
          'wt-1': [{ ...structuredTab, label: 'Renamed Chat', customLabel: 'Renamed Chat' }]
        }
      })
    )
    expect(mocks.subscribeStatus).toHaveBeenCalledOnce()
    expect(mocks.unsubscribe).not.toHaveBeenCalled()
    expect(statuses()[0]?.terminalTitle).toBe('Renamed Chat')

    act(() =>
      feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: 2 }) })
    )
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledOnce()
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledWith(
      'wt-1',
      expect.objectContaining({
        source: 'agent-task-complete',
        terminalTitle: 'Renamed Chat',
        agentStatusSnapshot: expect.objectContaining({ state: 'blocked', stateStartedAt: 2 })
      })
    )
  })

  it('delivers a mid-turn prompt despite batched renders and leaves settled turns to the completion feed', async () => {
    const view = render(<StructuredAgentSessionStatusBridge />)
    await waitFor(() => expect(mocks.subscribeStatus).toHaveBeenCalledOnce())
    act(() => feed().emit({ type: 'snapshot', sessions: [summary({ status: 'idle' })] }))
    act(() => {
      feed().emit({ type: 'status', session: summary({ status: 'working', updatedAt: 2 }) })
      feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: 3 }) })
      feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: 4 }) })
      feed().emit({ type: 'status', session: summary({ status: 'working', updatedAt: 5 }) })
      feed().emit({ type: 'status', session: summary({ status: 'idle', updatedAt: 6 }) })
    })
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledOnce()
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledWith(
      'wt-1',
      expect.objectContaining({
        desktopOnly: true,
        agentStatusSnapshot: expect.objectContaining({ state: 'blocked', stateStartedAt: 3 })
      })
    )
    view.unmount()
    render(<StructuredAgentSessionStatusBridge />)
    expect(mocks.dispatchTerminalNotification).toHaveBeenCalledOnce()
  })

  it.each([4, 5])(
    'passes saved P%s structured transitions through real dispatch without new unread',
    async (priority) => {
      const { dispatchTerminalNotification } = await vi.importActual<
        typeof NotificationDispatchModule
      >('../terminal-pane/use-notification-dispatch')
      const { resolveEntryIdentity } = await import('@/store/slices/session-attention-transition')
      const { getDefaultSettings } = await import('../../../../shared/constants')
      const { getDefaultNotificationSettings } =
        await import('../../../../shared/notification-settings-defaults')
      const dispatch = vi.fn(async () => ({ delivered: true }))
      Object.defineProperty(window, 'api', {
        configurable: true,
        value: { notifications: { dispatch } }
      })
      mocks.store?.setState({
        activeWorktreeId: 'other',
        settings: {
          ...getDefaultSettings('/workspace'),
          notifications: getDefaultNotificationSettings()
        }
      })
      mocks.actualDispatcher.mockImplementation(dispatchTerminalNotification)
      render(<StructuredAgentSessionStatusBridge />)
      await waitFor(() => expect(mocks.subscribeStatus).toHaveBeenCalledOnce())
      const now = Date.now()
      act(() => feed().emit({ type: 'status', session: summary({ updatedAt: now - 1000 }) }))
      const state = mocks.store?.getState()
      const entry = state?.agentStatusByPaneKey[Object.keys(state.agentStatusByPaneKey)[0]]
      if (!state || !entry) {
        throw new Error('missing projected session')
      }
      const identity = resolveEntryIdentity(state, entry)?.sessionIdentity
      if (!identity) {
        throw new Error('missing session identity')
      }
      mocks.store?.setState({
        sessionAttentionMetadataByIdentity: { [identity]: { priority: priority === 4 ? 4 : 5 } }
      })
      const previousUnread = mocks.store?.getState().unreadAgentCompletionPanes
      act(() =>
        feed().emit({ type: 'status', session: summary({ status: 'attention', updatedAt: now }) })
      )
      await waitFor(() => expect(dispatch).toHaveBeenCalledOnce())
      expect(dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ priority, desktopOnly: true, soundCategory: 'needs-input' })
      )
      expect(mocks.store?.getState().unreadAgentCompletionPanes).toEqual(previousUnread)
      Reflect.deleteProperty(window, 'api')
    }
  )
})
