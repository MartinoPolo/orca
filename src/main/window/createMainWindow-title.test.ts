import { beforeEach, describe, expect, it, vi } from 'vitest'

vi.mock('electron', async () =>
  (await import('./createMainWindow-test-harness')).electronModuleMock()
)
vi.mock('@electron-toolkit/utils', async () =>
  (await import('./createMainWindow-test-harness')).electronToolkitUtilsMock()
)
vi.mock('./macos-tahoe-release', async () =>
  (await import('./createMainWindow-test-harness')).macosTahoeReleaseMock()
)
vi.mock('../app-icon', async () => (await import('./createMainWindow-test-harness')).appIconMock())
vi.mock('../browser/browser-manager', async () =>
  (await import('./createMainWindow-test-harness')).browserManagerMock()
)

import { createMainWindow, loadMainWindow } from './createMainWindow'
import { resetExpectedTeardownStateForTest } from '../crash-reporting/expected-teardown-state'
import { browserWindowMock, resetMainWindowMocks } from './createMainWindow-test-harness'

describe('createMainWindow native title', () => {
  beforeEach(() => {
    resetMainWindowMocks()
    resetExpectedTeardownStateForTest()
    vi.useRealTimers()
  })

  function setupWindow() {
    const windowHandlers = new Map<string, ((...args: any[]) => void)[]>()
    const webContents = {
      id: 1,
      on: vi.fn(),
      setZoomLevel: vi.fn(),
      setBackgroundThrottling: vi.fn(),
      invalidate: vi.fn(),
      setWindowOpenHandler: vi.fn(),
      send: vi.fn(),
      isDestroyed: vi.fn(() => false)
    }
    const instance = {
      webContents,
      on: vi.fn((event: string, handler: (...args: any[]) => void) => {
        const handlers = windowHandlers.get(event) ?? []
        handlers.push(handler)
        windowHandlers.set(event, handlers)
      }),
      isDestroyed: vi.fn(() => false),
      isMaximized: vi.fn(() => true),
      isFullScreen: vi.fn(() => false),
      getSize: vi.fn(() => [1200, 800]),
      setSize: vi.fn(),
      maximize: vi.fn(),
      show: vi.fn(),
      loadFile: vi.fn(() => Promise.resolve()),
      loadURL: vi.fn(() => Promise.resolve())
    }
    browserWindowMock.mockImplementation(function () {
      return instance
    })

    return { instance, windowHandlers }
  }

  it('preserves the explicit Orca Lab title across renderer title updates and reloads', () => {
    const { instance, windowHandlers } = setupWindow()

    const mainWindow = createMainWindow(null, { deferLoad: true, title: 'Orca Lab' })

    expect(browserWindowMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Orca Lab' }))
    const updateTitle = windowHandlers.get('page-title-updated')?.[0]
    expect(updateTitle).toBeTypeOf('function')

    const initialTitleUpdate = { preventDefault: vi.fn() }
    updateTitle?.(initialTitleUpdate, 'Orca', true)
    expect(initialTitleUpdate.preventDefault).toHaveBeenCalledOnce()

    loadMainWindow(mainWindow)
    expect(instance.loadFile).toHaveBeenCalledOnce()

    const reloadedTitleUpdate = { preventDefault: vi.fn() }
    updateTitle?.(reloadedTitleUpdate, 'Orca', true)
    expect(reloadedTitleUpdate.preventDefault).toHaveBeenCalledOnce()
  })

  it('keeps the default title behavior when no explicit title is supplied', () => {
    const { windowHandlers } = setupWindow()

    createMainWindow(null, { deferLoad: true })

    expect(browserWindowMock).toHaveBeenCalledWith(expect.objectContaining({ title: 'Orca' }))
    expect(windowHandlers.has('page-title-updated')).toBe(false)
  })
})
