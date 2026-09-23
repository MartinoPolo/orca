import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import {
  createMockChildProcess,
  createMockTaskkillProcess,
  expectWindowsTaskkillTree,
  mockWindowsTaskkillTree,
  withPlatform
} from './runner-command-exec-fixtures'

const { execFileMock, execFileSyncMock, spawnMock } = vi.hoisted(() => ({
  execFileMock: vi.fn(),
  execFileSyncMock: vi.fn(),
  spawnMock: vi.fn()
}))

vi.mock('node:child_process', () => ({
  execFile: execFileMock,
  execFileSync: execFileSyncMock,
  spawn: spawnMock
}))

import { commandExecFileAsync, ghExecFileAsync } from './runner'

describe('commandExecFileAsync Windows command shims', () => {
  const originalComSpec = process.env.ComSpec

  beforeEach(() => {
    process.env.ComSpec = 'C:\\Windows\\System32\\cmd.exe'
    execFileMock.mockReset()
    execFileSyncMock.mockReset()
    spawnMock.mockReset()
  })

  afterEach(() => {
    vi.useRealTimers()
    if (originalComSpec === undefined) {
      delete process.env.ComSpec
    } else {
      process.env.ComSpec = originalComSpec
    }
  })

  it('kills aborted Windows .cmd shim executions as a process tree', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const controller = new AbortController()
      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['--version'], {
        cwd: 'C:\\repo',
        signal: controller.signal
      })
      const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      controller.abort()

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
    })
  })

  it('kills timed-out Windows .cmd shim executions as a process tree', async () => {
    vi.useFakeTimers()
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['store', 'prune'], {
        cwd: 'C:\\repo',
        timeout: 1000
      })
      const rejection = expect(promise).rejects.toThrow('C:\\tools\\pnpm.cmd timed out.')
      await vi.advanceTimersByTimeAsync(1000)

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })

  it('kills over-buffer Windows .cmd shim executions as a process tree', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      const taskkill = createMockTaskkillProcess()
      spawnMock.mockImplementation((cmd: string) => (cmd === 'taskkill' ? taskkill : command))

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['store', 'prune'], {
        cwd: 'C:\\repo',
        maxBuffer: 2
      })
      const rejection = expect(promise).rejects.toThrow(
        'C:\\tools\\pnpm.cmd stdout exceeded maxBuffer.'
      )
      command.stdout.emit('data', Buffer.from('too much output'))

      await rejection
      expect(spawnMock).toHaveBeenCalledWith(
        'taskkill',
        ['/pid', '1234', '/t', '/f'],
        expect.objectContaining({ stdio: 'ignore', windowsHide: true })
      )
      expect(command.kill).not.toHaveBeenCalled()
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })

  it('removes listeners after successful Windows .cmd shim executions', async () => {
    await withPlatform('win32', async () => {
      const command = createMockChildProcess(1234)
      spawnMock.mockReturnValue(command)

      const promise = commandExecFileAsync('C:\\tools\\pnpm.cmd', ['--version'], {
        cwd: 'C:\\repo'
      })
      command.stdout.emit('data', Buffer.from('9.1.0\n'))
      command.stderr.emit('data', Buffer.from('notice\n'))
      command.emit('close', 0)

      await expect(promise).resolves.toEqual({ stdout: '9.1.0\n', stderr: 'notice\n' })
      expect(command.stdout.listenerCount('data')).toBe(0)
      expect(command.stderr.listenerCount('data')).toBe(0)
      expect(command.listenerCount('error')).toBe(0)
      expect(command.listenerCount('close')).toBe(0)
    })
  })
})

describe('hosted CLI Windows termination', () => {
  beforeEach(() => {
    execFileMock.mockReset()
    execFileSyncMock.mockReset()
    spawnMock.mockReset()
    vi.useFakeTimers()
  })

  afterEach(() => vi.useRealTimers())

  it('waits for taskkill when an active gh execution times out', async () => {
    await withPlatform('win32', async () => {
      const { command, taskkill } = mockWindowsTaskkillTree(spawnMock, 1234)

      const promise = ghExecFileAsync(['api', 'repos/stablyai/orca/issues/5388'], {
        cwd: 'C:\\repo',
        timeout: 1234
      })
      const rejection = expect(promise).rejects.toThrow('gh timed out.')
      await vi.advanceTimersByTimeAsync(1234)

      expectWindowsTaskkillTree(spawnMock, 1234)
      taskkill.emit('close', 0, null)
      await rejection
      expect(command.kill).not.toHaveBeenCalled()
    })
  })

  it('waits for taskkill when an active gh execution is aborted', async () => {
    await withPlatform('win32', async () => {
      const { command, taskkill } = mockWindowsTaskkillTree(spawnMock, 1234)
      const controller = new AbortController()

      const promise = ghExecFileAsync(['api', 'repos/stablyai/orca/issues/5388'], {
        cwd: 'C:\\repo',
        signal: controller.signal
      })
      const rejection = expect(promise).rejects.toMatchObject({ name: 'AbortError' })
      await vi.waitFor(() => expect(spawnMock).toHaveBeenCalledOnce())
      controller.abort()

      expectWindowsTaskkillTree(spawnMock, 1234)
      taskkill.emit('close', 0, null)
      await rejection
      expect(command.kill).not.toHaveBeenCalled()
    })
  })
})
