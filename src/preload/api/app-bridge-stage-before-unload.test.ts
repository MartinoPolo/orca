import { beforeEach, describe, expect, it, vi } from 'vitest'

const mocks = vi.hoisted(() => ({ sendSync: vi.fn() }))

vi.mock('electron', () => ({
  ipcRenderer: { sendSync: mocks.sendSync, invoke: vi.fn(), on: vi.fn(), removeListener: vi.fn() }
}))
vi.mock('../renderer-restart-wiring', () => ({ prepareAndInvokeAppRestart: vi.fn() }))
vi.mock('../preload-runtime-support', () => ({
  awaitBeforeUnloadCheckpoint: vi.fn(),
  startupDiagnosticsEnabled: false
}))

const { appApi } = await import('./app-bridge')

const stageArgs = { sessions: [], ui: {} }

describe('appApi.stageBeforeUnloadSync', () => {
  beforeEach(() => {
    mocks.sendSync.mockReset()
  })

  it('returns when main staged the snapshot', () => {
    mocks.sendSync.mockReturnValue({ ok: true })

    expect(() => appApi.stageBeforeUnloadSync(stageArgs)).not.toThrow()
  })

  it('surfaces the main-process staging reason', () => {
    mocks.sendSync.mockReturnValue({ ok: false, reason: 'session ssh:target-1: boom' })

    expect(() => appApi.stageBeforeUnloadSync(stageArgs)).toThrow(
      'Failed to stage renderer state before unload: session ssh:target-1: boom'
    )
  })

  it('keeps the generic message when main gives no reason', () => {
    mocks.sendSync.mockReturnValue(undefined)

    expect(() => appApi.stageBeforeUnloadSync(stageArgs)).toThrow(
      'Failed to stage renderer state before unload.'
    )
  })
})
