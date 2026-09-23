import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { KeybindingOverrides } from '../../shared/keybindings'
import { setupGuestShortcutForwarding } from './browser-guest-shortcut-forwarding'

const browserTabId = 'tab-1'
let beforeInputHandler: ((event: Electron.Event, input: Electron.Input) => void) | undefined
let rendererSend: ReturnType<typeof vi.fn>

function registerForwarding(options: {
  getKeybindings?: () => KeybindingOverrides
  resolveWorktreeId: () => string
}): void {
  const guest: Electron.WebContents = Object.assign(Object.create(null), {
    on: vi.fn(
      (eventName: string, listener: (event: Electron.Event, input: Electron.Input) => void) => {
        if (eventName === 'before-input-event') {
          beforeInputHandler = listener
        }
      }
    ),
    off: vi.fn()
  })
  const renderer: Electron.WebContents = Object.assign(Object.create(null), {
    send: rendererSend
  })

  setupGuestShortcutForwarding({
    browserTabId,
    guest,
    resolveRenderer: () => renderer,
    ...options
  })
}

function triggerBeforeInput(input: Partial<Electron.Input>): ReturnType<typeof vi.fn> {
  if (!beforeInputHandler) {
    throw new Error('before-input-event listener was not registered')
  }
  const preventDefault = vi.fn()
  const event: Electron.Event = Object.assign(Object.create(null), { preventDefault })
  const completeInput: Electron.Input = Object.assign(Object.create(null), {
    type: 'keyDown',
    alt: false,
    meta: process.platform === 'darwin',
    control: process.platform !== 'darwin',
    shift: false,
    ...input
  })
  beforeInputHandler(event, completeInput)
  return preventDefault
}

describe('browser guest directional tab move forwarding', () => {
  beforeEach(() => {
    beforeInputHandler = undefined
    rendererSend = vi.fn()
  })

  it('forwards the default move-right binding with the focused normal guest source', () => {
    registerForwarding({ resolveWorktreeId: () => 'worktree-1' })

    const preventDefault = triggerBeforeInput({
      code: 'ArrowRight',
      key: 'ArrowRight',
      alt: true
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(rendererSend).toHaveBeenCalledWith('ui:moveTabFromBrowserGuest', {
      direction: 'right',
      sourceId: browserTabId
    })
  })

  it('forwards a custom non-right binding with the focused floating guest source', () => {
    registerForwarding({
      resolveWorktreeId: () => 'global-floating-terminal',
      getKeybindings: () => ({ 'tab.moveUp': ['Mod+Shift+ArrowUp'] })
    })

    const preventDefault = triggerBeforeInput({
      code: 'ArrowUp',
      key: 'ArrowUp',
      shift: true
    })

    expect(preventDefault).toHaveBeenCalledTimes(1)
    expect(rendererSend).toHaveBeenCalledWith('ui:moveTabFromBrowserGuest', {
      direction: 'up',
      sourceId: browserTabId
    })
  })
})
