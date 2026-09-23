import { beforeEach, describe, expect, it, vi } from 'vitest'
import { FLOATING_TERMINAL_WORKTREE_ID } from '../../../shared/constants'
import { TAB_MOVE_ACTIONS } from '../../../shared/keybindings'
import type { AppShortcutState, ShortcutDispatchInput } from './app-command-handlers'

const mocks = vi.hoisted(() => ({
  floatingWorkspaceFocused: false,
  moveActiveTabInDirection: vi.fn()
}))

vi.mock('../components/tab-bar/tab-move-to-pane-column', () => ({
  moveActiveTabInDirection: mocks.moveActiveTabInDirection
}))

vi.mock('@/lib/floating-workspace-terminal-actions', () => ({
  isFloatingWorkspacePanelFocused: () => mocks.floatingWorkspaceFocused
}))

vi.mock('@/lib/terminal-shortcut-capture-notification', () => ({
  showTerminalShortcutCaptureNotification: vi.fn()
}))

import { createAppCommandHandlers } from './app-command-handlers'

function shortcutState(overrides: Partial<AppShortcutState> = {}): AppShortcutState {
  return {
    activeView: 'terminal',
    activeWorktreeId: 'worktree-1',
    actions: {
      toggleSidebar: vi.fn(),
      toggleRightSidebar: vi.fn(),
      setRightSidebarOpen: vi.fn(),
      setRightSidebarTab: vi.fn(),
      showRightSidebarFiles: vi.fn(),
      showRightSidebarSearch: vi.fn(),
      openDiffNotesSendMenuForActiveWorktree: vi.fn()
    },
    creationLayoutActive: false,
    floatingTerminalEnabled: false,
    floatingTerminalOpen: false,
    floatingVisibleTabCount: 0,
    keybindings: {},
    openFloatingWorkspaceMaximized: vi.fn(),
    pluginCommands: [],
    setFloatingTerminalOpen: vi.fn(),
    terminalShortcutPolicy: 'orca-first',
    workspaceChromeActive: true,
    ...overrides
  }
}

function shortcutInput(): ShortcutDispatchInput {
  return { target: null, defaultPrevented: false, preventDefault: vi.fn() }
}

describe('directional tab move app commands', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.floatingWorkspaceFocused = false
  })

  it.each(TAB_MOVE_ACTIONS)(
    'claims $actionId only when the tab moves',
    ({ actionId, direction }) => {
      const input = shortcutInput()
      mocks.moveActiveTabInDirection.mockReturnValue(true)

      expect(createAppCommandHandlers(shortcutState(), input, 'terminal').get(actionId)?.()).toBe(
        true
      )
      expect(mocks.moveActiveTabInDirection).toHaveBeenCalledWith('worktree-1', direction)
      expect(input.preventDefault).toHaveBeenCalledOnce()
    }
  )

  it('does not claim a no-op move', () => {
    const input = shortcutInput()
    mocks.moveActiveTabInDirection.mockReturnValue(false)

    expect(
      createAppCommandHandlers(shortcutState(), input, 'terminal').get('tab.moveRight')?.()
    ).toBe(false)
    expect(input.preventDefault).not.toHaveBeenCalled()
  })

  it('does not claim without an active worktree', () => {
    const input = shortcutInput()
    expect(
      createAppCommandHandlers(shortcutState({ activeWorktreeId: null }), input).get(
        'tab.moveRight'
      )?.()
    ).toBe(false)
    expect(mocks.moveActiveTabInDirection).not.toHaveBeenCalled()
    expect(input.preventDefault).not.toHaveBeenCalled()
  })

  it('does not run outside workspace or floating workspace context', () => {
    const input = shortcutInput()
    expect(
      createAppCommandHandlers(shortcutState({ workspaceChromeActive: false }), input).get(
        'tab.moveRight'
      )?.()
    ).toBe(false)
    expect(mocks.moveActiveTabInDirection).not.toHaveBeenCalled()
    expect(input.preventDefault).not.toHaveBeenCalled()
  })

  it('targets the floating workspace when its panel is focused', () => {
    const input = shortcutInput()
    mocks.floatingWorkspaceFocused = true
    mocks.moveActiveTabInDirection.mockReturnValue(true)

    expect(
      createAppCommandHandlers(
        shortcutState({ activeWorktreeId: null, workspaceChromeActive: false }),
        input,
        'terminal'
      ).get('tab.moveDown')?.()
    ).toBe(true)
    expect(mocks.moveActiveTabInDirection).toHaveBeenCalledWith(
      FLOATING_TERMINAL_WORKTREE_ID,
      'down'
    )
    expect(input.preventDefault).toHaveBeenCalledOnce()
  })
})
