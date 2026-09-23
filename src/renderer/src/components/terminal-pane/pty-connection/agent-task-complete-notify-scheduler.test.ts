import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS,
  AGENT_TASK_COMPLETE_NOTIFICATION_MAX_WAIT_MS
} from '../agent-task-complete-policy'
import { installAgentTaskCompleteNotify } from './agent-task-complete-notify'
import type { ConnectPanePtySession } from './connect-pane-pty-session'

const mocks = vi.hoisted(() => ({
  status: {
    state: 'waiting',
    updatedAt: 0,
    lastAssistantMessage: 'Please approve',
    agentType: 'codex',
    stateStartedAt: 1
  }
}))
vi.mock('@/store', () => ({
  useAppStore: {
    getState: () => ({ agentStatusByPaneKey: { 'tab:leaf': mocks.status } }),
    subscribe: () => vi.fn()
  }
}))
vi.mock('@/lib/agent-status', () => ({
  detectAgentStatusFromTitle: vi.fn(),
  isClaudeAgent: vi.fn()
}))
vi.mock('./agent-idle-working-handlers', () => ({ installAgentIdleWorkingHandlers: vi.fn() }))

function nullTimer(): ReturnType<typeof setTimeout> | null {
  return null
}

function installedSession() {
  const dispatchNotification = vi.fn()
  const session = {
    cacheKey: 'tab:leaf',
    deps: { dispatchNotification },
    disposed: false,
    requiresFreshWorkingForAgentTaskCompleteNotification: false,
    agentTaskCompleteNotificationGeneration: 0,
    syncAgentTaskCompleteTrackingEnabled: () => true,
    clearPendingAgentTaskCompleteNotification() {
      if (session.agentTaskCompleteNotificationGraceTimer) {
        clearTimeout(session.agentTaskCompleteNotificationGraceTimer)
      }
      if (session.agentTaskCompleteNotificationMaxTimer) {
        clearTimeout(session.agentTaskCompleteNotificationMaxTimer)
      }
    },
    clearTerminalBellNotificationTimer: vi.fn(),
    pendingTerminalBellNotification: true,
    agentTaskCompleteNotificationGraceTimer: nullTimer(),
    agentTaskCompleteNotificationMaxTimer: nullTimer()
  }
  // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the installer reads only the supplied session fields; pane and manager are not used by this scheduler.
  const installed = session as unknown as ConnectPanePtySession
  installAgentTaskCompleteNotify(installed)
  return { installed, dispatchNotification, session }
}

describe('installed PTY completion scheduler', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    mocks.status.updatedAt = Date.now()
    mocks.status.state = 'waiting'
  })
  afterEach(() => {
    vi.clearAllTimers()
    vi.useRealTimers()
  })

  it.each(['waiting', 'blocked'] as const)(
    'delivers %s hook detail after grace only once',
    (state) => {
      mocks.status.state = state
      const { installed, dispatchNotification } = installedSession()
      installed.scheduleAgentTaskCompleteNotification('Codex', {
        agentStatusSnapshot: { state, agentType: 'codex', stateStartedAt: 1 }
      })
      expect(dispatchNotification).not.toHaveBeenCalled()
      vi.advanceTimersByTime(AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS)
      expect(dispatchNotification).toHaveBeenCalledOnce()
      expect(dispatchNotification).toHaveBeenCalledWith(
        expect.objectContaining({
          source: 'agent-task-complete',
          agentStatusSnapshot: expect.objectContaining({ state })
        })
      )
      vi.advanceTimersByTime(AGENT_TASK_COMPLETE_NOTIFICATION_MAX_WAIT_MS)
      expect(dispatchNotification).toHaveBeenCalledOnce()
    }
  )

  it('replaces duplicate scheduled failure signals during the grace window', () => {
    mocks.status.state = 'blocked'
    const { installed, dispatchNotification } = installedSession()
    const notification = {
      agentStatusSnapshot: { state: 'blocked', agentType: 'codex', stateStartedAt: 1 }
    } as const
    installed.scheduleAgentTaskCompleteNotification('Codex', notification)
    vi.advanceTimersByTime(AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS - 1)
    installed.scheduleAgentTaskCompleteNotification('Codex', notification)
    vi.advanceTimersByTime(AGENT_TASK_COMPLETE_NOTIFICATION_GRACE_MS)
    expect(dispatchNotification).toHaveBeenCalledOnce()
  })

  it('cancels a pending failure when the turn resumes before grace', () => {
    mocks.status.state = 'blocked'
    const { installed, dispatchNotification, session } = installedSession()
    installed.scheduleAgentTaskCompleteNotification('Codex', {
      agentStatusSnapshot: {
        state: 'blocked' as const,
        agentType: 'codex' as const,
        stateStartedAt: 1
      }
    })
    session.agentTaskCompleteNotificationGeneration += 1
    vi.advanceTimersByTime(AGENT_TASK_COMPLETE_NOTIFICATION_MAX_WAIT_MS)
    expect(dispatchNotification).not.toHaveBeenCalled()
  })
})
