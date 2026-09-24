import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { dispatchTerminalNotification } from './use-notification-dispatch'
import { createAgentCompletionCoordinator } from './agent-completion-coordinator'
import { buildAgentNotificationId } from '../../../../shared/agent-notification-id'
import { buildSessionAttentionIdentity } from '../../../../shared/session-attention'
import {
  PANE_KEY,
  getLastNotificationDispatchArg,
  makeAgentStatus,
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

describe('dispatchTerminalNotification', () => {
  const paneKey = PANE_KEY

  beforeEach(() => {
    mockState = resetNotificationDispatchMockState()
  })

  afterEach(() => {
    vi.unstubAllGlobals()
  })

  it('carries PTY hook input and failure through the coordinator into delivery', async () => {
    vi.useFakeTimers()
    try {
      mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
        state: 'blocked',
        agentType: 'copilot'
      })
      const coordinator = createAgentCompletionCoordinator({
        paneKey,
        getPtyId: () => 'pty-1',
        getSettings: () => null,
        inspectProcess: vi.fn(),
        isLive: () => true,
        dispatchCompletion: (title, meta) =>
          dispatchTerminalNotification('wt-primary', {
            source: 'agent-task-complete',
            paneKey,
            terminalTitle: title,
            agentStatusSnapshot: meta?.agentStatus
          }),
        dispatchAttention: (title, meta) =>
          dispatchTerminalNotification('wt-primary', {
            source: 'agent-task-complete',
            paneKey,
            terminalTitle: title,
            agentStatusSnapshot: meta.agentStatus
          })
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
      expect(mockState.markWorktreeUnread).toHaveBeenCalled()
      coordinator.dispose()
    } finally {
      vi.useRealTimers()
    }
  })

  it('plays the default agent sound independently of a suppressed focused banner', async () => {
    const { playDesktopNotificationSound } = await import('./notification-dispatch-test-harness')
    vi.mocked(window.api.notifications.dispatch).mockResolvedValue({
      delivered: false,
      reason: 'suppressed-focus'
    })
    dispatchTerminalNotification('wt-primary', { source: 'agent-task-complete', paneKey })
    expect(playDesktopNotificationSound).toHaveBeenCalledWith('system', undefined, 'done')
  })

  it('plays the needs-input sound even when the banner is suppressed', async () => {
    const { playDesktopNotificationSound } = await import('./notification-dispatch-test-harness')
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
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalled()
    expect(mockState.markWorktreeUnread).toHaveBeenCalled()
  })

  it('selects independent sounds and volumes without affecting unread admission', async () => {
    const { playDesktopNotificationSound } = await import('./notification-dispatch-test-harness')
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
    expect(mockState.markWorktreeUnread).toHaveBeenCalledTimes(3)
  })

  it('routes authoritative blocked and permission states to different sounds', async () => {
    const { playDesktopNotificationSound } = await import('./notification-dispatch-test-harness')
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

  it('keeps existing unread attention for blocked transitions', () => {
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
    expect(window.api.notifications.dispatch).toHaveBeenCalled()
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalled()
    expect(mockState.markWorktreeUnread).toHaveBeenCalled()
  })

  it.each(['failed', 'circuit_broken'] as const)(
    'routes observed orchestration %s to failure sound',
    async (dispatchStatus) => {
      const { playDesktopNotificationSound } = await import('./notification-dispatch-test-harness')
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

  it('recovers priority from matching retained session after teardown without borrowing a reused pane', () => {
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

  it('uses a live pane key when marking inactive worktree attention', () => {
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'agent-task-complete',
        notificationId: buildAgentNotificationId({
          worktreeId: 'wt-primary',
          paneKey,
          stateStartedAt: mockState.agentStatusByPaneKey[paneKey].stateStartedAt
        }),
        worktreeId: 'wt-primary',
        paneKey,
        repoLabel: 'orca',
        worktreeLabel: 'master',
        terminalTitle: 'codex',
        isActiveWorktree: false,
        agentType: 'codex',
        agentState: 'done',
        agentPrompt: 'codex-hook-notify',
        agentLastAssistantMessage: 'Done.'
      })
    )
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markTerminalTabUnread).toHaveBeenCalledWith('tab-1', 'agent-completion')
    expect(mockState.markTerminalPaneUnread).toHaveBeenCalledWith(paneKey, 'agent-completion')
  })

  it('builds the notification id from a completion snapshot, not the pinned working row', () => {
    const pinnedWorkingStartedAt = Date.now() - 60_000
    // Why: the stored row must name the event's agent, or it is dropped for identity mismatch
    // and the assertion would hold whichever side of the `??` wins.
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
      state: 'working',
      stateStartedAt: pinnedWorkingStartedAt,
      agentType: 'claude',
      terminalTitle: 'claude'
    })
    const turnCompletedAt = Date.now()

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'claude',
      paneKey,
      agentStatusSnapshot: {
        state: 'done',
        prompt: 'review the PR',
        agentType: 'claude',
        stateStartedAt: turnCompletedAt
      }
    })

    expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        notificationId: buildAgentNotificationId({
          worktreeId: 'wt-primary',
          paneKey,
          stateStartedAt: turnCompletedAt
        })
      })
    )
  })

  it.each([
    { clientStateStartedAt: 5_000, hostTurnCompletedAt: 2_000 },
    { clientStateStartedAt: 2_000, hostTurnCompletedAt: 5_000 }
  ])(
    'accepts a host-stamped completion across client/host clock skew %#',
    ({ clientStateStartedAt, hostTurnCompletedAt }) => {
      mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
        state: 'working',
        stateStartedAt: clientStateStartedAt,
        agentType: 'claude',
        terminalTitle: 'claude'
      })

      dispatchTerminalNotification('wt-primary', {
        source: 'agent-task-complete',
        terminalTitle: 'claude',
        paneKey,
        agentStatusSnapshot: {
          state: 'done',
          prompt: 'review the PR',
          agentType: 'claude',
          stateStartedAt: hostTurnCompletedAt,
          localStateStartedAt: clientStateStartedAt,
          turnCompletedAt: hostTurnCompletedAt
        }
      })

      expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
        expect.objectContaining({ source: 'agent-task-complete' })
      )
    }
  )

  it('drops a host-stamped completion after a newer client turn starts', () => {
    mockState.agentStatusByPaneKey[paneKey] = makeAgentStatus(paneKey, {
      state: 'working',
      stateStartedAt: 6_000,
      agentType: 'claude',
      terminalTitle: 'claude'
    })

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'claude',
      paneKey,
      agentStatusSnapshot: {
        state: 'done',
        prompt: 'previous turn',
        agentType: 'claude',
        stateStartedAt: 2_000,
        localStateStartedAt: 5_000,
        turnCompletedAt: 2_000
      }
    })

    expect(window.api.notifications.dispatch).not.toHaveBeenCalled()
  })

  it('uses a live pane key when inactive worktree tab membership is not hydrated', () => {
    mockState.tabsByWorktree = {}

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'agent-task-complete',
        worktreeId: 'wt-primary',
        paneKey
      })
    )
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markTerminalTabUnread).toHaveBeenCalledWith('tab-1', 'agent-completion')
    expect(mockState.markTerminalPaneUnread).toHaveBeenCalledWith(paneKey, 'agent-completion')
  })

  it('uses tab liveness when the layout has the leaf but no leaf pty binding yet', () => {
    mockState.terminalLayoutsByTabId['tab-1'].ptyIdsByLeafId = {}

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(window.api.notifications.dispatch).toHaveBeenCalledWith(
      expect.objectContaining({
        source: 'agent-task-complete',
        worktreeId: 'wt-primary',
        paneKey
      })
    )
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markTerminalTabUnread).toHaveBeenCalledWith('tab-1', 'agent-completion')
    expect(mockState.markTerminalPaneUnread).toHaveBeenCalledWith(paneKey, 'agent-completion')
  })

  it('falls back to background-worktree unread when terminal attention is disabled', () => {
    mockState.settings.experimentalTerminalAttention = false

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(window.api.notifications.dispatch).toHaveBeenCalled()
    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markTerminalTabUnread).not.toHaveBeenCalled()
    expect(mockState.markTerminalPaneUnread).not.toHaveBeenCalled()
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalledWith(
      paneKey,
      'agent-completion'
    )
  })

  it('offers attention-only completion to main for independent mobile delivery', () => {
    mockState.settings.notifications = { ...mockState.settings.notifications, enabled: false }
    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markTerminalTabUnread).toHaveBeenCalledWith('tab-1', 'agent-completion')
    expect(mockState.markTerminalPaneUnread).toHaveBeenCalledWith(paneKey, 'agent-completion')
    expect(window.api.notifications.dispatch).toHaveBeenCalled()
  })

  it('writes unread with the completion reason while the agent-complete banner toggle is off', () => {
    // Why: the renderer never reads the desktop banner gate — main applies it after unread
    // and mobile delivery, so a disabled banner must still leave unread + tray attention.
    mockState.settings.notifications = {
      ...mockState.settings.notifications,
      enabled: true,
      agentTaskComplete: false
    }

    dispatchTerminalNotification('wt-primary', {
      source: 'agent-task-complete',
      terminalTitle: 'codex',
      paneKey
    })

    expect(mockState.markWorktreeUnread).toHaveBeenCalledWith('wt-primary')
    expect(mockState.markAgentCompletionPaneUnread).toHaveBeenCalledWith(
      paneKey,
      'agent-completion'
    )
    expect(window.api.notifications.dispatch).toHaveBeenCalled()
  })
})
