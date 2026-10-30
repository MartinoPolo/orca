import { beforeEach, describe, expect, it, vi } from 'vitest'

const { listeners, on, removeListener } = vi.hoisted(() => {
  const listeners = new Map<string, (...args: unknown[]) => void>()
  return {
    listeners,
    on: vi.fn((channel: string, listener: (...args: unknown[]) => void) => {
      listeners.set(channel, listener)
    }),
    removeListener: vi.fn()
  }
})

vi.mock('electron', () => ({
  ipcRenderer: { on, removeListener, send: vi.fn() }
}))
vi.mock('../preload-runtime-support', () => ({
  browserFindSubscriptions: { subscribe: vi.fn() }
}))

import { uiTabAndBrowserCommandsApi } from './ui-bridge-tab-and-browser-commands'

describe('ui tab move bridge', () => {
  beforeEach(() => {
    listeners.clear()
    on.mockClear()
    removeListener.mockClear()
  })

  it('forwards an admitted source-aware directional move payload', () => {
    const callback = vi.fn()
    const unsubscribe = uiTabAndBrowserCommandsApi.onMoveTabFromBrowserGuest(callback)

    listeners.get('ui:moveTabFromBrowserGuest')?.({}, { direction: 'up', sourceId: 'page-1' })

    expect(callback).toHaveBeenCalledWith({ direction: 'up', sourceId: 'page-1' })
    unsubscribe()
    expect(removeListener).toHaveBeenCalledWith('ui:moveTabFromBrowserGuest', expect.any(Function))
  })

  it('drops malformed payloads at the preload boundary', () => {
    const callback = vi.fn()
    uiTabAndBrowserCommandsApi.onMoveTabFromBrowserGuest(callback)

    listeners.get('ui:moveTabFromBrowserGuest')?.({}, { direction: 'right', sourceId: '' })
    listeners.get('ui:moveTabFromBrowserGuest')?.({}, { direction: 'diagonal', sourceId: 'page-1' })

    expect(callback).not.toHaveBeenCalled()
  })
})
