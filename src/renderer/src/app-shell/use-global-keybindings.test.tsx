// @vitest-environment happy-dom

import { act, renderHook } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  GlobalKeybindingsFloatingWorkspace,
  GlobalKeybindingsLayout
} from './use-global-keybindings'

const mocks = vi.hoisted(() => {
  const moveRight = vi.fn(() => true)
  const moveUp = vi.fn(() => true)
  const sidebarToggle = vi.fn(() => true)
  const storeState: {
    keybindings: Record<string, readonly string[]>
    settings: { terminalShortcutPolicy: 'orca-first' }
  } = {
    keybindings: {},
    settings: { terminalShortcutPolicy: 'orca-first' }
  }
  return { moveRight, moveUp, sidebarToggle, storeState }
})

vi.mock('../store', () => ({
  useAppStore: (selector: (state: typeof mocks.storeState) => unknown) => selector(mocks.storeState)
}))

vi.mock('@/store/plugin-panels', () => ({ usePluginCommands: () => [] }))
vi.mock('@/lib/app-command-dispatch', () => ({
  registerAppCommandDispatcher: () => () => {}
}))
vi.mock('@/lib/plugin-command-execution', () => ({ executePluginCommand: vi.fn() }))
vi.mock('@/lib/plugin-command-keybindings', () => ({
  findPluginCommandForKeybinding: () => null
}))
vi.mock('@/lib/terminal-shortcut-capture-notification', () => ({
  showTerminalShortcutCaptureNotification: vi.fn()
}))
vi.mock('@/lib/floating-workspace-terminal-actions', () => ({
  isFloatingWorkspacePanelFocused: () => false,
  isFloatingWorkspaceTerminalInputTarget: (target: EventTarget | null) =>
    target instanceof HTMLElement &&
    target.classList.contains('xterm-helper-textarea') &&
    target.closest('[data-floating-terminal-panel]') !== null,
  matchFloatingWorkspacePanelChord: () => null,
  shouldMinimizeFloatingWorkspacePanelOnCloseShortcut: () => false
}))
vi.mock('./app-window-chrome', () => ({ shortcutPlatform: 'win32' }))
vi.mock('./app-command-handlers', () => ({
  createAppCommandHandlers: (_state: unknown, input: { preventDefault: () => void }) =>
    new Map([
      [
        'tab.moveRight',
        () => {
          input.preventDefault()
          return mocks.moveRight()
        }
      ],
      [
        'tab.moveUp',
        () => {
          input.preventDefault()
          return mocks.moveUp()
        }
      ],
      [
        'sidebar.left.toggle',
        () => {
          input.preventDefault()
          return mocks.sidebarToggle()
        }
      ]
    ]),
  getKeybindingContext: (target: EventTarget | null) =>
    target instanceof HTMLElement && target.classList.contains('xterm-helper-textarea')
      ? 'terminal'
      : 'app',
  useAppShortcutActions: () => ({})
}))

import { useGlobalKeybindings } from './use-global-keybindings'

const layout: GlobalKeybindingsLayout = {
  activeView: 'terminal',
  activeWorktreeId: 'worktree-1',
  creationLayoutActive: false,
  workspaceChromeActive: true
}
const floatingWorkspace: GlobalKeybindingsFloatingWorkspace = {
  enabled: true,
  open: true,
  visibleTabCount: 1,
  openMaximized: vi.fn(),
  setOpenWithFocus: vi.fn()
}

function dispatchKeydown(target: HTMLElement, init: KeyboardEventInit): KeyboardEvent {
  const event = new KeyboardEvent('keydown', {
    bubbles: true,
    cancelable: true,
    ...init
  })
  act(() => target.dispatchEvent(event))
  return event
}

describe('useGlobalKeybindings directional tab move dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mocks.storeState.keybindings = {}
    document.body.replaceChildren()
  })

  it('dispatches a matched custom tab move from an editable target', () => {
    mocks.storeState.keybindings = {
      'tab.moveRight': [],
      'tab.moveUp': ['Mod+Shift+ArrowUp']
    }
    const input = document.createElement('input')
    document.body.append(input)
    const view = renderHook(() => useGlobalKeybindings({ layout, floatingWorkspace }))

    const event = dispatchKeydown(input, {
      key: 'ArrowUp',
      code: 'ArrowUp',
      ctrlKey: true,
      shiftKey: true
    })

    expect(mocks.moveUp).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    view.unmount()
  })

  it('keeps non-tab-move shortcuts blocked in editable targets', () => {
    mocks.storeState.keybindings = {
      'tab.moveRight': [],
      'sidebar.left.toggle': ['Mod+Alt+ArrowRight']
    }
    const input = document.createElement('input')
    document.body.append(input)
    const view = renderHook(() => useGlobalKeybindings({ layout, floatingWorkspace }))

    const event = dispatchKeydown(input, {
      key: 'ArrowRight',
      code: 'ArrowRight',
      ctrlKey: true,
      altKey: true
    })

    expect(mocks.sidebarToggle).not.toHaveBeenCalled()
    expect(event.defaultPrevented).toBe(false)
    view.unmount()
  })

  it('dispatches a matched tab move from floating terminal input', () => {
    const panel = document.createElement('div')
    panel.dataset.floatingTerminalPanel = ''
    const terminalInput = document.createElement('textarea')
    terminalInput.className = 'xterm-helper-textarea'
    panel.append(terminalInput)
    document.body.append(panel)
    const view = renderHook(() => useGlobalKeybindings({ layout, floatingWorkspace }))

    const event = dispatchKeydown(terminalInput, {
      key: 'ArrowRight',
      code: 'ArrowRight',
      ctrlKey: true,
      altKey: true
    })

    expect(mocks.moveRight).toHaveBeenCalledOnce()
    expect(event.defaultPrevented).toBe(true)
    view.unmount()
  })
})
