import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { __setWindowsProcessTreeLoaderForTests } from '../windows/windows-process-table'
import { resolveAgentForegroundProcessWithAvailability } from './agent-foreground-process'

const getAllProcessesMock = vi.fn()

// The interactive shell's fork exited, so the script chain hangs off a dead pid.
const ORPHANED_LAUNCH_ROWS = [
  // A real snapshot contains the querying process; the reader rejects one without it.
  { pid: process.pid, ppid: 0, name: 'vitest.exe', commandLine: 'vitest' },
  {
    pid: 100,
    ppid: 99,
    name: 'bash.exe',
    commandLine: 'C:\\Program Files\\Git\\usr\\bin\\bash.exe --login -i'
  },
  {
    pid: 300,
    ppid: 299,
    name: 'bash.exe',
    commandLine: 'C:\\Program Files\\Git\\usr\\bin\\bash.exe C:/tools/bin/launch claude work'
  },
  {
    pid: 301,
    ppid: 300,
    name: 'node.exe',
    commandLine: 'node.exe C:/tools/src/cli.ts launch claude work'
  },
  {
    pid: 302,
    ppid: 301,
    name: 'claude.exe',
    commandLine: 'C:\\Users\\dev\\.local\\bin\\claude.exe --add-dir C:\\tools'
  }
]
const PANE_JOB_PROCESS_IDS = new Set([100, 300, 301, 302])

describe('a Windows agent launched through a Git Bash script', () => {
  let platform: PropertyDescriptor | undefined

  beforeEach(() => {
    getAllProcessesMock.mockReset()
    getAllProcessesMock.mockImplementation((cb: (rows: unknown) => void) => {
      cb(ORPHANED_LAUNCH_ROWS)
    })
    __setWindowsProcessTreeLoaderForTests(() => ({
      ProcessDataFlag: { None: 0, Memory: 1, CommandLine: 2, CreationTime: 4 },
      getAllProcesses: getAllProcessesMock
    }))
    platform = Object.getOwnPropertyDescriptor(process, 'platform')
    Object.defineProperty(process, 'platform', { configurable: true, value: 'win32' })
  })

  afterEach(() => {
    __setWindowsProcessTreeLoaderForTests()
    if (platform) {
      Object.defineProperty(process, 'platform', platform)
    }
  })

  it('is invisible to the ppid walk alone', async () => {
    await expect(
      resolveAgentForegroundProcessWithAvailability(100, 'bash.exe', { fresh: true })
    ).resolves.toEqual({ available: true, processName: 'bash.exe' })
  })

  it('is recognized from the pane job', async () => {
    await expect(
      resolveAgentForegroundProcessWithAvailability(100, 'bash.exe', {
        fresh: true,
        forceProcessScan: true,
        readWindowsPaneJobProcessIds: () => PANE_JOB_PROCESS_IDS,
        readWindowsConsoleAttachedProcessIds: async () => PANE_JOB_PROCESS_IDS
      })
    ).resolves.toEqual({ available: true, processName: 'claude', processId: 302 })
  })

  it('is still dropped once it detaches from the console', async () => {
    await expect(
      resolveAgentForegroundProcessWithAvailability(100, 'bash.exe', {
        fresh: true,
        forceProcessScan: true,
        readWindowsPaneJobProcessIds: () => PANE_JOB_PROCESS_IDS,
        readWindowsConsoleAttachedProcessIds: async () => new Set([100])
      })
    ).resolves.toEqual({ available: true, processName: 'bash.exe' })
  })
})
