import { EventEmitter } from 'node:events'
import { expect, vi } from 'vitest'

export type MockChildProcess = EventEmitter & {
  stdout: EventEmitter
  stderr: EventEmitter
  pid: number
  kill: ReturnType<typeof vi.fn>
  unref?: ReturnType<typeof vi.fn>
}

export function createMockChildProcess(pid: number): MockChildProcess {
  const child = new EventEmitter() as MockChildProcess
  child.stdout = new EventEmitter()
  child.stderr = new EventEmitter()
  child.pid = pid
  child.kill = vi.fn()
  return child
}

/** The CLI hangs while the POSIX process-group quiescence probe answers immediately. */
export function mockWedgedCliSpawn(
  spawnMock: ReturnType<typeof vi.fn>,
  child: MockChildProcess
): void {
  spawnMock.mockImplementation((program: string) => {
    if (program !== 'ps') {
      return child
    }
    const probe = createMockChildProcess(9100)
    queueMicrotask(() => probe.emit('close', 0, null))
    return probe
  })
}

/** Signals succeed; the existence probe reports the group already gone. */
export function mockProcessGroupSignals(): ReturnType<typeof vi.spyOn> {
  return vi.spyOn(process, 'kill').mockImplementation(((_pid: number, signal?: unknown) => {
    if (signal === 0) {
      throw Object.assign(new Error('ESRCH'), { code: 'ESRCH' })
    }
    return true
  }) as typeof process.kill)
}

export function createMockTaskkillProcess(): MockChildProcess {
  const child = createMockChildProcess(9000)
  child.unref = vi.fn()
  return child
}

export function mockWindowsTaskkillTree(
  spawnMock: ReturnType<typeof vi.fn>,
  pid: number
): { command: MockChildProcess; taskkill: MockChildProcess } {
  const command = createMockChildProcess(pid)
  const taskkill = createMockTaskkillProcess()
  spawnMock.mockImplementation((program: string) => (program === 'taskkill' ? taskkill : command))
  return { command, taskkill }
}

export function expectWindowsTaskkillTree(spawnMock: ReturnType<typeof vi.fn>, pid: number): void {
  expect(spawnMock).toHaveBeenCalledWith(
    'taskkill',
    ['/pid', String(pid), '/t', '/f'],
    expect.objectContaining({ shell: false, windowsHide: true })
  )
}

export async function withPlatform<T>(
  platform: NodeJS.Platform,
  run: () => Promise<T>
): Promise<T> {
  const original = process.platform
  Object.defineProperty(process, 'platform', { configurable: true, value: platform })
  try {
    return await run()
  } finally {
    Object.defineProperty(process, 'platform', { configurable: true, value: original })
  }
}
