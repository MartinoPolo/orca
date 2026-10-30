import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { TabMoveDirection } from '../../../shared/keybindings'
import { registerTabLifecycleIpcBridge } from './ipc-events/tab-lifecycle-ipc-bridge'

const { moveBrowserTabInDirection } = vi.hoisted(() => ({
  moveBrowserTabInDirection: vi.fn()
}))

vi.mock('@/components/tab-bar/tab-move-to-pane-column', () => ({ moveBrowserTabInDirection }))
vi.mock('@/lib/workspace-tab-commands', () => ({ dispatchWorkspaceTabCommand: vi.fn() }))
vi.mock('@/lib/app-keyboard-router', () => ({ replayAppKeyDown: vi.fn() }))
vi.mock('@/lib/floating-workspace-terminal-actions', () => ({
  resolveFloatingWorkspaceBrowserWorkspaceId: vi.fn()
}))
vi.mock('@/lib/floating-workspace-guest-bridge', () => ({
  dispatchFloatingWorkspaceGuestClose: vi.fn(),
  dispatchFloatingWorkspaceGuestSelectIndex: vi.fn()
}))
vi.mock('../../store', () => ({ useAppStore: { getState: vi.fn() } }))

type MoveTabListener = (payload: { direction: TabMoveDirection; sourceId: string }) => void

function registerTabMoveListener(): {
  listener: MoveTabListener
  moveTabUnsubscribe: ReturnType<typeof vi.fn>
  unsubscriptions: (() => void)[]
} {
  let listener: MoveTabListener | undefined
  const subscribe = vi.fn(() => vi.fn())
  const moveTabUnsubscribe = vi.fn()
  const onMoveTabFromBrowserGuest = vi.fn((nextListener: MoveTabListener) => {
    listener = nextListener
    return moveTabUnsubscribe
  })
  vi.stubGlobal('window', {
    api: {
      ui: {
        onBrowserPageTabShortcut: subscribe,
        onCloseActiveTab: subscribe,
        onCloseFloatingItem: subscribe,
        onMoveTabFromBrowserGuest,
        onSelectFloatingIndex: subscribe,
        onSwitchRecentTab: subscribe
      }
    }
  })

  const unsubscriptions: (() => void)[] = []
  registerTabLifecycleIpcBridge(unsubscriptions)
  expect(onMoveTabFromBrowserGuest).toHaveBeenCalledTimes(1)
  if (!listener) {
    throw new Error('tab move listener was not registered')
  }
  return { listener, moveTabUnsubscribe, unsubscriptions }
}

describe('browser guest tab move lifecycle bridge', () => {
  beforeEach(() => {
    vi.unstubAllGlobals()
    moveBrowserTabInDirection.mockReset()
  })

  it('registers cleanup and routes source identity with direction', () => {
    const { listener, moveTabUnsubscribe, unsubscriptions } = registerTabMoveListener()

    listener({ direction: 'down', sourceId: 'browser-page-1' })

    expect(moveBrowserTabInDirection).toHaveBeenCalledWith('browser-page-1', 'down')
    expect(unsubscriptions).toContain(moveTabUnsubscribe)
  })
})
