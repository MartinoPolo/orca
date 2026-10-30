import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { setPresenceGated } from '@/hooks/agent-auto-ack-presence'
import { dispatchTerminalNotification } from './use-notification-dispatch'
import { createAgentCompletionCoordinator } from './agent-completion-coordinator'
import type { AgentCompletionStatusSnapshot } from './agent-completion-coordinator-types'
import { buildSessionAttentionIdentity } from '../../../../shared/session-attention'
import {
  PANE_KEY,
  getLastNotificationDispatchArg,
  makeAgentStatus,
  playDesktopNotificationSound,
  resetNotificationDispatchMockState,
  type NotificationDispatchMockState
} from './notification-dispatch-test-harness'

vi.mock('@/store', async () => {
  const harness = await import('./notification-dispatch-test-harness')
  return harness.createNotificationDispatchStoreModuleMock()
})

vi.mock('@/lib/desktop-notification-sound', async () => {
  const harness = await import('./notification-dispatch-test-harness')
  return harness.createDesktopNotificationSoundModuleMock()
})

let mockState: NotificationDispatchMockState
const paneKey = PANE_KEY

beforeEach(() => {
  setPresenceGated(false)
  mockState = resetNotificationDispatchMockState()
})
afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
  setPresenceGated(true)
})

describe('dispatchTerminalNotification sound categories', () => {
  it('carries PTY hook input through the coordinator into delivery', () => {
    vi.useFakeTimers()
    try {
      mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
        state: 'blocked',
        agentType: 'copilot'
      })
      const dispatch = (title: string, snapshot?: AgentCompletionStatusSnapshot): void => {
        dispatchTerminalNotification('wt-primary', {
          source: 'agent-task-complete',
          paneKey,
          terminalTitle: title,
          agentStatusSnapshot: snapshot
        })
      }
      const coordinator = createAgentCompletionCoordinator({
        paneKey,
        getPtyId: () => 'pty-1',
        inspectProcess: vi.fn(),
        isLive: () => true,
        dispatchCompletion: (title, meta) => dispatch(title, meta?.agentStatus),
        dispatchAttention: (title, meta) => dispatch(title, meta.agentStatus)
      })
      coordinator.observeHookStatus({ state: 'working', agentType: 'copilot', prompt: 'test' })
      coordinator.observeHookStatus({
        state: 'blocked',
        agentType: 'copilot',
        prompt: 'test',
        requiresInput: true
      })
      vi.advanceTimersByTime(2_000)
      expect(getLastNotificationDispatchArg()).toMatchObject({
        source: 'agent-task-complete',
        soundCategory: 'needs-input'
      })
      coordinator.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays the default agent sound independently of a suppressed focused banner', () => {
    vi.mocked(window.api.notifications.dispatch).mockResolvedValue({
      delivered: false,
      reason: 'suppressed-focus'
    })
    dispatchTerminalNotification('wt-primary', { source: 'agent-task-complete', paneKey })
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('system', undefined, 'done')
  })

  it('plays the needs-input sound and keeps unread when the banner is below priority', async () => {
    mockState.settings.notifications = {
      enabled: true,
      agentTaskComplete: true,
      customSoundId: 'custom',
      needsInputSoundId: 'blip'
    }
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, { state: 'waiting' })
    vi.mocked(window.api.notifications.dispatch).mockResolvedValue({
      delivered: false,
      reason: 'priority'
    })
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      paneKey,
      agentStatusSnapshot: { state: 'waiting', agentType: 'codex', prompt: 'question' }
    })
    await vi.waitFor(() =>
      expect(playDesktopNotificationSound).toHaveBeenCalledWith('blip', undefined, 'needs-input')
    )
    expect(mockState.markAgentAttentionUnread).toHaveBeenCalled()
  })

  it('selects independent sounds and volumes without affecting unread admission', () => {
    mockState.settings.notifications = {
      customSoundId: 'custom',
      customSoundVolume: 25,
      needsInputSoundId: 'blip',
      needsInputSoundVolume: 45,
      failedSoundId: 'clack',
      failedSoundVolume: 75
    }
    for (const [state, requiresInput, sound, volume, category] of [
      ['done', false, 'custom', 25, 'done'],
      ['blocked', true, 'blip', 45, 'needs-input'],
      ['blocked', false, 'clack', 75, 'failed']
    ] as const) {
      mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
        state,
        requiresInput: requiresInput || undefined
      })
      dispatchTerminalNotification('wt-primary', {
        source: 'agent-task-complete',
        paneKey,
        agentStatusSnapshot: {
          state,
          agentType: 'codex',
          prompt: 'turn',
          requiresInput: requiresInput || undefined,
          stateStartedAt: mockState.agentStatusByPaneKey[paneKey].stateStartedAt
        }
      })
      expect(playDesktopNotificationSound).toHaveBeenLastCalledWith(sound, volume, category)
      expect(getLastNotificationDispatchArg()).toMatchObject({ soundCategory: category })
    }
    expect(mockState.markAgentAttentionUnread).toHaveBeenCalledTimes(3)
  })

  it('routes authoritative blocked and permission states to different sounds', () => {
    mockState.settings.notifications = {
      enabled: true,
      agentTaskComplete: true,
      failedSoundId: 'clack',
      needsInputSoundId: 'blip'
    }
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, { state: 'blocked' })
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      paneKey,
      agentStatusSnapshot: {
        state: 'blocked',
        agentType: 'codex',
        prompt: 'blocked',
        stateStartedAt: mockState.agentStatusByPaneKey[paneKey].stateStartedAt
      }
    })
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('clack', undefined, 'failed')
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
      state: 'blocked',
      interactivePrompt: '{}'
    })
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      paneKey,
      agentStatusSnapshot: {
        state: 'blocked',
        agentType: 'codex',
        prompt: 'permission',
        interactivePrompt: '{}',
        stateStartedAt: mockState.agentStatusByPaneKey[paneKey].stateStartedAt
      }
    })
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('blip', undefined, 'needs-input')
  })

  it.each(['failed', 'circuit_broken'] as const)(
    'routes observed orchestration %s to failure sound',
    (dispatchStatus) => {
      mockState.settings.notifications = { failedSoundId: 'clack', failedSoundVolume: 70 }
      const status = makeAgentStatus(paneKey, {
        orchestration: { taskId: 'task', dispatchId: 'dispatch', dispatchStatus }
      })
      mockState.agentStatusByPaneKey[paneKey] = status
      dispatchTerminalNotification('wt-primary', {
        source: 'agent-task-complete',
        paneKey,
        agentStatusSnapshot: {
          state: 'done',
          agentType: 'codex',
          prompt: 'task',
          stateStartedAt: status.stateStartedAt
        }
      })
      expect(getLastNotificationDispatchArg()).toMatchObject({ soundCategory: 'failed' })
      expect(playDesktopNotificationSound).toHaveBeenCalledWith('clack', 70, 'failed')
    }
  )

  it('delivers a synthetic failure without changing unread attention', () => {
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey,
      desktopOnly: true,
      soundCategory: 'failed',
      agentStatusSnapshot: {
        state: 'done',
        agentType: 'codex',
        prompt: 'codex-hook-notify',
        stateStartedAt: mockState.agentStatusByPaneKey[paneKey].stateStartedAt
      }
    })
    expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({ desktopOnly: true, soundCategory: 'failed' })
    )
    expect(mockState.markAgentAttentionUnread).not.toHaveBeenCalled()
  })
})

describe('dispatchTerminalNotification session priority', () => {
  it('uses session-scoped priority and defaults unassigned sessions to P3', () => {
    const providerSession = { key: 'session_id' as const, id: 'session-1' }
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
      providerSession,
      connectionId: null,
      worktreeId: 'wt-primary',
      tabId: 'tab-1'
    })
    const identity = buildSessionAttentionIdentity({
      executionHostId: 'local',
      workspaceId: 'wt-primary',
      agentType: 'codex',
      providerSession
    })
    if (!identity) {
      throw new Error('Expected a session identity')
    }
    mockState.sessionAttentionMetadataByIdentity[identity] = { priority: 4 }
    dispatchTerminalNotification('wt-primary', { source: 'agent-task-complete', paneKey })
    expect(getLastNotificationDispatchArg()).toMatchObject({ priority: 4 })
    mockState.sessionAttentionMetadataByIdentity = {}
    dispatchTerminalNotification('wt-primary', { source: 'agent-task-complete', paneKey })
    expect(getLastNotificationDispatchArg()).toMatchObject({ priority: 3 })
  })

  it('recovers priority from a matching retained session without borrowing a reused pane', () => {
    const providerSession = { key: 'session_id' as const, id: 'retained-session' }
    const retained = makeAgentStatus(paneKey, {
      state: 'working',
      providerSession,
      connectionId: null,
      worktreeId: 'wt-primary',
      tabId: 'tab-1'
    })
    const identity = buildSessionAttentionIdentity({
      executionHostId: 'local',
      workspaceId: 'wt-primary',
      agentType: 'codex',
      providerSession
    })
    if (!identity) {
      throw new Error('Expected a session identity')
    }
    mockState.sessionAttentionMetadataByIdentity[identity] = { priority: 5 }
    mockState.retainedAgentsByPaneKey[paneKey] = { worktreeId: 'wt-primary', entry: retained }
    delete mockState.agentStatusByPaneKey[paneKey]
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      paneKey,
      agentStatusSnapshot: {
        state: 'done',
        agentType: 'codex',
        prompt: 'turn',
        stateStartedAt: retained.stateStartedAt + 1,
        localStateStartedAt: retained.stateStartedAt
      }
    })
    expect(getLastNotificationDispatchArg()).toMatchObject({ priority: 5 })
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
      agentType: 'claude',
      worktreeId: 'wt-primary'
    })
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      paneKey,
      agentStatusSnapshot: {
        state: 'done',
        agentType: 'claude',
        prompt: 'new turn',
        stateStartedAt: Date.now() + 1
      }
    })
    expect(getLastNotificationDispatchArg()).toMatchObject({ priority: 3 })
  })
})
