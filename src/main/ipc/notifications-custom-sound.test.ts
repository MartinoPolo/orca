import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import {
  getDispatchHandler,
  getLoadSoundHandler,
  getResolveSoundPathHandler,
  notificationCtorMock,
  resetNotificationDispatchMocks
} from './notifications-test-harness'

vi.mock('../../../resources/notification-sounds/two-tone.mp3?asset', () => ({
  default: '/notification-sounds/two-tone.mp3'
}))

vi.mock('electron', async () =>
  (await import('./notifications-test-harness')).createElectronModuleMock()
)

vi.mock('./notification-authorization-status', async () =>
  (await import('./notifications-test-harness')).createNotificationAuthorizationModuleMock()
)

vi.mock('./ui', async () =>
  (await import('./notifications-test-harness')).createTrustedUIRendererModuleMock()
)

vi.mock('../tray/system-tray', async () =>
  (await import('./notifications-test-harness')).createSystemTrayModuleMock()
)

import { registerNotificationHandlers } from './notifications'

describe('registerNotificationHandlers', () => {
  let tempDir: string

  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-03-28T16:00:00Z'))
    tempDir = mkdtempSync(join(tmpdir(), 'orca-notification-test-'))
    resetNotificationDispatchMocks()
  })

  afterEach(() => {
    rmSync(tempDir, { recursive: true, force: true })
  })

  it('uses the macOS default notification sound when no custom sound is configured', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      registerNotificationHandlers({
        getSettings: () => ({
          notifications: {
            enabled: true,
            agentTaskComplete: true,
            terminalBell: true,
            suppressWhenFocused: false,
            customSoundPath: null
          }
        })
      } as never)

      const handler = getDispatchHandler()
      expect(await handler({}, { source: 'test' })).toEqual({ delivered: true })
      expect(notificationCtorMock).toHaveBeenCalledWith({
        title: 'Orca notifications are on',
        body: 'This is a test notification from Orca.',
        sound: 'default'
      })
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it('plays System Default agent audio through the local sound path, without a second banner sound', async () => {
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked store exposes only fields the notification handlers read.
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: false,
          customSoundId: 'system',
          customSoundPath: null
        }
      })
    } as never)
    expect(await getResolveSoundPathHandler()({}, 'done')).toMatchObject({ ok: true })
    expect(
      await getDispatchHandler()(
        {},
        {
          source: 'agent-task-complete',
          priority: 5,
          soundCategory: 'done',
          worktreeId: 'wt'
        }
      )
    ).toEqual({ delivered: true })
    expect(notificationCtorMock).toHaveBeenCalledWith(expect.objectContaining({ silent: true }))
  })

  it('does not request a native macOS sound when a custom sound is configured', async () => {
    const originalPlatform = process.platform
    Object.defineProperty(process, 'platform', { value: 'darwin', configurable: true })
    try {
      registerNotificationHandlers({
        getSettings: () => ({
          notifications: {
            enabled: true,
            agentTaskComplete: true,
            terminalBell: true,
            suppressWhenFocused: false,
            customSoundPath: '/Users/kaylee/Downloads/Note_block_pling.ogg'
          }
        })
      } as never)

      const handler = getDispatchHandler()
      expect(await handler({}, { source: 'test' })).toEqual({ delivered: true })
      expect(notificationCtorMock).toHaveBeenCalledWith({
        title: 'Orca notifications are on',
        body: 'This is a test notification from Orca.',
        silent: true
      })
    } finally {
      Object.defineProperty(process, 'platform', { value: originalPlatform, configurable: true })
    }
  })

  it('silences the native notification when a custom sound is configured', async () => {
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: true,
          customSoundPath: '/Users/kaylee/Downloads/Note_block_pling.ogg'
        }
      })
    } as never)

    const handler = getDispatchHandler()
    expect(await handler({}, { source: 'test' })).toEqual({ delivered: true })
    expect(notificationCtorMock).toHaveBeenCalledWith({
      title: 'Orca notifications are on',
      body: 'This is a test notification from Orca.',
      silent: true
    })
  })

  it('loads allowed custom sound files for preload playback', async () => {
    const soundPath = join(tempDir, 'sound.ogg')
    writeFileSync(soundPath, Buffer.from([1, 2, 3]))
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: false,
          customSoundPath: soundPath
        }
      })
    } as never)

    const handler = getLoadSoundHandler()
    await expect(handler({})).resolves.toMatchObject({
      ok: true,
      data: new Uint8Array([1, 2, 3]),
      mimeType: 'audio/ogg'
    })
  })

  it('loads independent input and failure sound paths without changing Done', async () => {
    const donePath = join(tempDir, 'done.mp3')
    const inputPath = join(tempDir, 'input.mp3')
    const failedPath = join(tempDir, 'failed.mp3')
    writeFileSync(donePath, Buffer.from([1]))
    writeFileSync(inputPath, Buffer.from([2]))
    writeFileSync(failedPath, Buffer.from([3]))
    // oxlint-disable-next-line typescript/consistent-type-assertions -- SAFETY: the mocked store exposes only fields the sound IPC handler reads.
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          customSoundId: 'custom',
          customSoundPath: donePath,
          needsInputSoundId: 'custom',
          needsInputSoundPath: inputPath,
          failedSoundId: 'custom',
          failedSoundPath: failedPath
        }
      })
    } as never)
    expect(await getResolveSoundPathHandler()({}, 'needs-input')).toEqual({
      ok: true,
      path: inputPath
    })
    expect(await getLoadSoundHandler()({}, 'failed')).toMatchObject({
      ok: true,
      path: failedPath,
      data: new Uint8Array([3])
    })
    expect(await getResolveSoundPathHandler()({})).toEqual({ ok: true, path: donePath })
  })

  it('rejects unsupported custom sound file types', async () => {
    const soundPath = join(tempDir, 'sound.txt')
    writeFileSync(soundPath, 'not audio')
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: false,
          customSoundPath: soundPath
        }
      })
    } as never)

    const handler = getLoadSoundHandler()
    expect(await handler({})).toEqual({
      ok: false,
      reason: 'unsupported-type'
    })
  })

  it('resolves the sound path without reading the file', async () => {
    const soundPath = join(tempDir, 'sound.ogg')
    writeFileSync(soundPath, Buffer.from([1, 2, 3]))
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: false,
          customSoundPath: soundPath
        }
      })
    } as never)

    const handler = getResolveSoundPathHandler()
    expect(await handler({})).toEqual({ ok: true, path: soundPath })
  })

  it('rejects unsupported types from resolveSoundPath without touching the disk', async () => {
    registerNotificationHandlers({
      getSettings: () => ({
        notifications: {
          enabled: true,
          agentTaskComplete: true,
          terminalBell: true,
          suppressWhenFocused: false,
          customSoundPath: '/some/where/sound.txt'
        }
      })
    } as never)

    const handler = getResolveSoundPathHandler()
    expect(await handler({})).toEqual({ ok: false, reason: 'unsupported-type' })
  })
})
