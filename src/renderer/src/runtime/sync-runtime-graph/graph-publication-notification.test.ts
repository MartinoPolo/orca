import { afterEach, describe, expect, it, vi } from 'vitest'
import { createTestStore } from '@/store/slices/store-test-helpers'
import { graphState } from './graph-state'

const dispatchNotification = vi.hoisted(() => vi.fn())
vi.mock('@/components/terminal-pane/use-notification-dispatch', () => ({
  dispatchTerminalNotification: dispatchNotification
}))

import { syncRuntimeGraph } from './graph-publication'

const paneKey = 'tab-1:11111111-1111-4111-8111-111111111111'
const dispatch = (dispatchStatus: 'dispatched' | 'failed' | 'circuit_broken') => ({
  [paneKey]: { taskId: 'task-1', dispatchId: 'ctx-1', dispatchStatus }
})

describe('runtime graph failure delivery', () => {
  afterEach(() => {
    graphState.syncEnabled = false
    graphState.getStoreState = null
    vi.unstubAllGlobals()
    vi.clearAllMocks()
  })

  it.each(['failed', 'circuit_broken'] as const)(
    'notifies once for observed %s on a done row, not first sync or replay',
    async (failure) => {
      const store = createTestStore()
      store
        .getState()
        .setAgentStatus(
          paneKey,
          { state: 'done', agentType: 'claude', prompt: 'task' },
          'claude',
          undefined,
          { worktreeId: 'wt-1', tabId: 'tab-1' }
        )
      graphState.syncEnabled = true
      graphState.getStoreState = store.getState
      const syncWindowGraph = vi
        .fn()
        .mockResolvedValueOnce({ agentOrchestrationByPaneKey: dispatch(failure) })
        .mockResolvedValueOnce({ agentOrchestrationByPaneKey: dispatch('dispatched') })
        .mockResolvedValueOnce({ agentOrchestrationByPaneKey: dispatch(failure) })
        .mockResolvedValueOnce({ agentOrchestrationByPaneKey: dispatch(failure) })
      vi.stubGlobal('window', { api: { runtime: { syncWindowGraph } } })
      await syncRuntimeGraph()
      expect(dispatchNotification).not.toHaveBeenCalled()
      await syncRuntimeGraph()
      await syncRuntimeGraph()
      expect(dispatchNotification).toHaveBeenCalledOnce()
      expect(dispatchNotification).toHaveBeenCalledWith(
        'wt-1',
        expect.objectContaining({
          source: 'agent-task-complete',
          desktopOnly: true,
          soundCategory: 'failed',
          paneKey,
          agentStatusSnapshot: expect.objectContaining({ state: 'done', agentType: 'claude' })
        })
      )
      await syncRuntimeGraph()
      expect(dispatchNotification).toHaveBeenCalledOnce()
    }
  )
})
